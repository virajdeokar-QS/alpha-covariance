"""Private internal API. Never expose this service without the authenticated Desk Worker proxy.

All endpoints require a constant-time server-to-server secret. No CORS, no API keys
in browser code, no real/live trading or market-data retrieval.
"""
import hmac,json,os,re,sys,traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from .store import ResearchStore
from .quant import InputError
from .analytics import analyze_portfolio, explore_factors

MAX_JSON=5*1024*1024


def handle(store, method, path, body):
    p=urlsplit(path)
    parts=[s for s in p.path.split('/') if s]
    if parts[:2]!=['api','engine']:raise InputError('Unknown API route')
    end=parts[2:]
    if method=='GET':
        if end==['status']:return store.state(),200
        if end==['datasets']:return {'datasets':store.datasets()},200
        if len(end)==3 and end[0]=='datasets' and end[2]=='bars':return store.chart_bars(end[1]),200
        if end==['backtests']:return {'jobs':store.jobs()},200
        if end==['paper']:return {'sessions':store.papers()},200
        if end==['analytics','factors']:
            from urllib.parse import parse_qs
            query=parse_qs(p.query);return explore_factors(store,query.get('dataset_id',[''])[0]),200
        if len(end)==2 and end[0]=='backtests':return store.job(end[1]),200
        if len(end)==2 and end[0]=='paper':return store.paper(end[1]),200
    if method=='POST':
        if end==['datasets']:return store.ingest(body),201
        if end==['analytics','portfolio']:return analyze_portfolio(store,body.get('dataset_ids')),200
        if end==['backtests']:return store.enqueue(body),202
        if end==['paper']:return store.new_paper(body),201
        if len(end)==3 and end[0]=='paper' and end[2] in ('stop','resume','auto'):
            return store.paper_control(end[1],end[2],body),200
        if len(end)==3 and end[0]=='paper' and end[2]=='orders':
            return store.manual_order(end[1],body),202
    raise InputError('Unknown API route')


def make_handler(store, secret):
    class API(BaseHTTPRequestHandler):
        server_version='ACResearch/0.5'
        sys_version=''
        def log_message(self,format,*args):
            sys.stderr.write('research-api '+(format%args)+'\n')
        def response(self,status, data):
            out=json.dumps(data,allow_nan=False,separators=(',',':')).encode('utf8')
            self.send_response(status)
            for k,v in {'Content-Type':'application/json; charset=utf-8','Content-Length':str(len(out)),
                        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
                        'X-Robots-Tag':'noindex, nofollow, noarchive','Access-Control-Allow-Origin':'null'}.items():
                self.send_header(k,v)
            self.end_headers();self.wfile.write(out)
        def proceed(self, method):
            actual=self.headers.get('X-Alpha-Engine-Token','')
            if not actual or not hmac.compare_digest(actual,secret):
                self.response(403,{'error':'ACCESS_DENIED'});return
            try:
                body={}
                if method=='POST':
                    size_str=self.headers.get('Content-Length','')
                    if not size_str.isdecimal() or not 0<int(size_str)<=MAX_JSON:
                        self.response(413,{'error':'PAYLOAD_TOO_LARGE'});return
                    if not self.headers.get('Content-Type','').lower().startswith('application/json'):
                        self.response(415,{'error':'JSON_REQUIRED'});return
                    body=json.loads(self.rfile.read(int(size_str)))
                    if not isinstance(body,dict):raise InputError('Request must be JSON object')
                result,status=handle(store,method,self.path,body)
                self.response(status,result)
            except (InputError,ValueError,KeyError) as exc:self.response(400,{'error':'INVALID_REQUEST','message':str(exc)[:250]})
            except Exception:
                traceback.print_exc(file=sys.stderr)
                self.response(503,{'error':'ENGINE_UNAVAILABLE','message':'Internal research service failure'})
        def do_GET(self):self.proceed('GET')
        def do_POST(self):self.proceed('POST')
        def do_OPTIONS(self):self.response(405,{'error':'METHOD_NOT_ALLOWED'})
    return API


def serve():
    secret=os.environ.get('ENGINE_SHARED_SECRET','')
    if len(secret)<40:raise SystemExit('ENGINE_SHARED_SECRET must be a fresh random string, at least 40 characters')
    home=os.environ.get('AC_ENGINE_HOME','./runtime')
    store=ResearchStore(home)
    # Bind loopback only. A tunnel service must share the host namespace to reach it.
    host='127.0.0.1';port=int(os.environ.get('AC_ENGINE_PORT','8790'))
    server=ThreadingHTTPServer((host,port),make_handler(store,secret))
    print(f'Alpha Covariance local research API: http://{host}:{port} (token required)',flush=True)
    try:server.serve_forever(poll_interval=.25)
    except KeyboardInterrupt:pass
    finally:server.server_close()
