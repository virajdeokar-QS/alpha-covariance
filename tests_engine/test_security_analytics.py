import http.client,io,json,threading,unittest,tempfile
from http.server import ThreadingHTTPServer
from research_engine.server import make_handler
from research_engine.store import ResearchStore
from research_engine.quant import InputError
from research_engine.analytics import analyze_portfolio,explore_factors
from research_engine.reports import generate
from test_engine import sample_csv,META,SPEC

class SecurityAndAnalytics(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=ResearchStore(self.tmp.name)
        self.a=self.store.ingest({**META,'csv_text':sample_csv()})
    def tearDown(self):self.tmp.cleanup()
    def test_engine_secret_gate(self):
        secret='z'*48;server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.store,secret))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            conn=http.client.HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
            conn.request('GET','/api/engine/status');r=conn.getresponse();self.assertEqual(r.status,403);r.read()
            conn.request('GET','/api/engine/status',headers={'X-Alpha-Engine-Token':secret});r=conn.getresponse();d=json.loads(r.read());self.assertEqual(r.status,200);self.assertFalse(d['live_trading'])
            self.assertEqual(r.getheader('Cache-Control'),'private, no-store')
            conn.close()
        finally:server.shutdown();server.server_close();thread.join(timeout=3)
    def test_portfolio(self):
        second=self.store.ingest({**META,'symbol':'OTHER/USD','csv_text':sample_csv(slope=-.03)})
        a=analyze_portfolio(self.store,[self.a['id'],second['id']])
        self.assertEqual(a['overlapping_bars'],110)
        self.assertAlmostEqual(sum(a['long_only_minimum_variance']['weights']),1,places=8)
        self.assertLessEqual(a['long_only_minimum_variance']['per_bar_volatility'],a['equal_weight']['per_bar_volatility']+1e-8)
        self.assertEqual(a['alpha_claim'],'NOT_VALIDATED')
    def test_factor_explorer(self):
        out=explore_factors(self.store,self.a['id']);self.assertEqual(out['observations'],110);self.assertIn('return_20_bars',out)
    def test_no_cross_currency_portfolio(self):
        other=self.store.ingest({**META,'currency':'INR','symbol':'OTHER/INR','csv_text':sample_csv(slope=-.03)})
        with self.assertRaises(InputError):analyze_portfolio(self.store,[self.a['id'],other['id']])
    def test_report_records_full_provenance(self):
        j=self.store.enqueue({'dataset_id':self.a['id'],'strategy':SPEC,'settings':{}})
        self.store.process_one_job()
        path=generate(self.store,j['id']);content=path.read_text()
        self.assertIn(self.a['checksum'],content)
        self.assertIn('NOT a validated strategy',content)
        self.assertNotIn('Coinbase Exchange API',content)
    def test_unknown_strategy_parameter_rejected(self):
        with self.assertRaises(InputError):self.store.enqueue({'dataset_id':self.a['id'],'strategy':{**SPEC,'parameters':{'fast_window':5}},'settings':{}})

if __name__=='__main__':unittest.main()
