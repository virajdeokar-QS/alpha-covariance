import csv,io,os,tempfile,unittest
from datetime import datetime,timedelta,timezone
from research_engine.store import ResearchStore
from research_engine.quant import parse_bars,backtest,InputError
from research_engine.server import handle

def sample_csv(n=110, slope=0.06):
    output=io.StringIO();w=csv.writer(output);w.writerow(['timestamp','open','high','low','close','volume'])
    start=datetime(2025,1,1,tzinfo=timezone.utc)
    for i in range(n):
        o=100+i*slope + 2*((i%20)-10)/10
        c=o+(0.4 if i%8<5 else -0.6)
        w.writerow([(start+timedelta(minutes=i)).isoformat(),f'{o:.5f}',f'{max(o,c)+.2:.5f}',f'{min(o,c)-.2:.5f}',f'{c:.5f}',10+i])
    return output.getvalue()

SPEC={'id':'example-strategy-id','version':1,'name':'Moving average example','signal_family':'moving_average_cross','parameters':{'fast':5,'slow':15}}
META={'symbol':'TEST/USD','currency':'USD','venue':'Educational historical records','provider':'User-provided export',
      'interval_seconds':60,'rights_reference':'research licence agreement ID EDU-2026-001',
      'allowed_uses':{'historical_storage':True,'algorithmic_backtesting':True,'paper_replay':True}}

class ResearchEngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=ResearchStore(self.tmp.name)
        self.dataset=self.store.ingest({**META,'csv_text':sample_csv()})
    def tearDown(self):self.tmp.cleanup()
    def test_import_and_checksum(self):
        self.assertEqual(self.dataset['bar_count'],110)
        self.assertEqual(self.dataset['currency'],'USD')
        self.assertEqual(self.store.ingest({**META,'csv_text':sample_csv()})['id'],self.dataset['id'])
    def test_source_attributed_candlestick_chart_is_recorded_only(self):
        payload, code=handle(self.store,'GET','/api/engine/datasets/'+self.dataset['id']+'/bars',{})
        self.assertEqual(code,200)
        self.assertEqual(payload['checksum'],self.dataset['checksum'])
        self.assertEqual(len(payload['bars']),110)
        self.assertEqual(payload['bars'][0],self.store.bars(self.dataset)[0])
        self.assertEqual(payload['source'],'owner_registered_historical_dataset')

    def test_cannot_import_without_rights(self):
        with self.assertRaises(InputError):self.store.ingest({**META,'csv_text':sample_csv(), 'allowed_uses':{}})
    def test_no_synthetic_gap_fill(self):
        bars=sample_csv().splitlines();bars.pop(12)
        out=parse_bars('\n'.join(bars),60)
        self.assertEqual(len(out),109)
    def test_duplicate_and_nonmonotonic_rejected(self):
        bars=sample_csv().splitlines();bars.insert(7,bars[6])
        with self.assertRaises(InputError):parse_bars('\n'.join(bars),60)
    def test_bad_envelope_rejected(self):
        rows=sample_csv().splitlines()
        fields=rows[1].split(',');fields[2]='1.00000';rows[1]=','.join(fields)
        with self.assertRaises(InputError):parse_bars('\n'.join(rows),60)
    def test_backtest_next_bar_open_and_metrics(self):
        r=backtest(self.store.bars(self.dataset),SPEC,{'initial_cash':10000,'fee_bps':10,'slippage_bps':5})
        self.assertEqual(r['status'],'completed');self.assertEqual(r['validation'],'IN_SAMPLE_EXPLORATORY_ONLY')
        self.assertEqual(r['alpha_claim'],'NOT_VALIDATED');self.assertEqual(r['bars'],110)
        self.assertGreaterEqual(len(r['fills']),1)
        self.assertIn(r['fills'][0]['at'],[b['t'] for b in self.store.bars(self.dataset)[1:]])
    def test_reject_unreviewed_custom_strategy(self):
        with self.assertRaises(InputError):backtest(self.store.bars(self.dataset),{**SPEC,'signal_family':'custom_research'}, {})
    def test_job_survives_store_restart(self):
        job=self.store.enqueue({'dataset_id':self.dataset['id'],'strategy':SPEC,'settings':{}})
        fresh=ResearchStore(self.tmp.name);self.assertEqual(fresh.job(job['id'])['status'],'queued')
        self.assertTrue(fresh.process_one_job());self.assertEqual(fresh.job(job['id'])['status'],'completed')
        self.assertEqual(fresh.job(job['id'])['result']['dataset_sha256'],self.dataset['checksum'])
    def test_paper_requires_explicit_resume(self):
        sess=self.store.new_paper({'dataset_id':self.dataset['id'],'strategy':SPEC,'auto_enabled':True,'settings':{'initial_cash':10000}})
        self.assertEqual(sess['status'],'stopped');self.assertFalse(self.store.paper_step(sess['id']))
        self.store.paper_control(sess['id'],'resume');self.assertTrue(self.store.paper_step(sess['id']))
        self.store.paper_control(sess['id'],'stop');self.assertFalse(self.store.paper_step(sess['id']))
        self.assertEqual(self.store.paper(sess['id'])['status'],'stopped')
    def test_manual_idempotency_and_trade_history(self):
        sess=self.store.new_paper({'dataset_id':self.dataset['id'],'strategy':SPEC,'auto_enabled':False,'settings':{}})
        s=sess['id'];order={'side':'BUY','client_order_id':'client-unique-001'}
        a=self.store.manual_order(s,order);b=self.store.manual_order(s,order)
        self.assertEqual(a['id'],b['id'])
        self.store.paper_control(s,'resume');self.store.paper_step(s)
        details=self.store.paper(s);self.assertEqual(len(details['fills']),1);self.assertEqual(details['fills'][0]['origin'],'manual')
        self.assertEqual(details['orders'][0]['status'],'filled')
        self.store.manual_order(s,{'side':'SELL','client_order_id':'client-unique-002'});self.store.paper_step(s)
        details=self.store.paper(s);self.assertEqual(details['fills'][0]['side'],'SELL')
        self.assertAlmostEqual(details['qty'],0)
    def test_full_replay_ends_no_broker(self):
        sess=self.store.new_paper({'dataset_id':self.dataset['id'],'strategy':SPEC,'auto_enabled':True,'settings':{}});s=sess['id'];self.store.paper_control(s,'resume')
        for _ in range(140):self.store.paper_step(s)
        state=self.store.paper(s);self.assertEqual(state['status'],'completed');self.assertEqual(state['next_index'],110)
        self.assertTrue(all(f['origin'] in ('strategy','risk') for f in state['fills']))
    def test_internal_api(self):
        j,code=handle(self.store,'POST','/api/engine/backtests',{'dataset_id':self.dataset['id'],'strategy':SPEC,'settings':{}})
        self.assertEqual(code,202);self.assertEqual(j['status'],'queued')
        got,code=handle(self.store,'GET','/api/engine/backtests/'+j['id'],{})
        self.assertEqual(code,200)

if __name__=='__main__':unittest.main()
