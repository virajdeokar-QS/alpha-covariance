"""End-to-end process exercise with isolated synthetic TEST fixtures, never website data."""
import http.client,json,os,socket,subprocess,sys,tempfile,time,unittest
from pathlib import Path
from test_engine import sample_csv,META,SPEC

class EndToEnd(unittest.TestCase):
    def test_http_gateway_persistent_job_worker_and_stop(self):
        with tempfile.TemporaryDirectory() as home:
            sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
            env=os.environ.copy();env.update({'AC_ENGINE_HOME':home,'AC_ENGINE_PORT':str(port),
                     'ENGINE_SHARED_SECRET':'s'*60,'AC_REPLAY_TICK_SECONDS':'1'})
            cwd=str(Path(__file__).resolve().parents[1]);proc=[]
            def call(path,method='GET',body=None):
                conn=http.client.HTTPConnection('127.0.0.1',port,timeout=4)
                raw=json.dumps(body).encode() if body is not None else None
                conn.request(method,path,body=raw,headers={'X-Alpha-Engine-Token':env['ENGINE_SHARED_SECRET'],
                   **({'Content-Type':'application/json'} if body is not None else {})})
                r=conn.getresponse();out=json.loads(r.read());status=r.status;conn.close();return status,out
            try:
                proc.append(subprocess.Popen([sys.executable,'-m','research_engine','api'],cwd=cwd,env=env,
                      stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
                for _ in range(50):
                    try:st,status=call('/api/engine/status');break
                    except (ConnectionRefusedError,ConnectionResetError,TimeoutError,OSError):time.sleep(.1)
                else:self.fail('Internal HTTP API did not start')
                self.assertEqual(st,200)
                _,ds=call('/api/engine/datasets','POST',{**META,'csv_text':sample_csv()})
                self.assertEqual(ds['bar_count'],110)
                st,job=call('/api/engine/backtests','POST',{'dataset_id':ds['id'],'strategy':SPEC,'settings':{}})
                self.assertEqual(st,202)
                proc.append(subprocess.Popen([sys.executable,'-m','research_engine','worker'],cwd=cwd,env=env,
                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
                for _ in range(50):
                    st,result=call('/api/engine/backtests/'+job['id'])
                    if result['status']=='completed':break
                    time.sleep(.1)
                self.assertEqual(result['status'],'completed')
                st,paper=call('/api/engine/paper','POST',{'dataset_id':ds['id'],'strategy':SPEC,'auto_enabled':True,'settings':{}})
                self.assertEqual(st,201);self.assertEqual(paper['status'],'stopped')
                _,paper=call('/api/engine/paper/'+paper['id']+'/resume','POST',{})
                time.sleep(1.3)
                _,stopped=call('/api/engine/paper/'+paper['id']+'/stop','POST',{})
                idx=stopped['next_index'];time.sleep(1.3)
                _,still=call('/api/engine/paper/'+paper['id'])
                self.assertEqual(still['status'],'stopped');self.assertEqual(still['next_index'],idx)
                self.assertEqual(still['mode'],'HISTORICAL_REPLAY_ONLY')
            finally:
                for p in reversed(proc):
                    p.terminate()
                    try:p.wait(timeout=2)
                    except subprocess.TimeoutExpired:p.kill();p.wait(timeout=2)

if __name__=='__main__':unittest.main()
