"""Persistent local research store and historical paper-replay operations (no broker)."""
from __future__ import annotations
import hashlib, json, os, sqlite3, threading, time, uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from contextlib import contextmanager
from .quant import parse_bars, spec_params, execution_settings, desired_position, backtest, number, InputError


def now():return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def uid():return str(uuid.uuid4())
def dump(v):return json.dumps(v,separators=(',',':'),allow_nan=False)
def rowdict(row):return dict(row) if row is not None else None

SCHEMA='''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS datasets(
 id TEXT PRIMARY KEY, filename TEXT NOT NULL, checksum TEXT NOT NULL UNIQUE,
 symbol TEXT NOT NULL, venue TEXT NOT NULL, currency TEXT NOT NULL, provider TEXT NOT NULL,
 interval_seconds INTEGER NOT NULL, first_at TEXT NOT NULL,last_at TEXT NOT NULL,
 bar_count INTEGER NOT NULL, rights_reference TEXT NOT NULL, allowed_uses_json TEXT NOT NULL,
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(
 id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL REFERENCES datasets(id),
 strategy_json TEXT NOT NULL,settings_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
 result_json TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status,created_at);
CREATE TABLE IF NOT EXISTS paper_sessions(
 id TEXT PRIMARY KEY,dataset_id TEXT NOT NULL REFERENCES datasets(id),
 strategy_json TEXT NOT NULL,settings_json TEXT NOT NULL,currency TEXT NOT NULL,
 cash REAL NOT NULL,qty REAL NOT NULL,cost_basis REAL NOT NULL,peak_equity REAL NOT NULL,
 initial_cash REAL NOT NULL,last_close REAL NOT NULL,next_index INTEGER NOT NULL,
 opening_attribution TEXT,
 status TEXT NOT NULL CHECK(status IN ('running','stopped','completed')),
 auto_enabled INTEGER NOT NULL CHECK(auto_enabled IN (0,1)),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS paper_orders(
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES paper_sessions(id),
 client_order_id TEXT NOT NULL,side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
 status TEXT NOT NULL CHECK(status IN ('queued','filled','rejected','cancelled')),
 requested_at TEXT NOT NULL,updated_at TEXT NOT NULL,reason TEXT,
 UNIQUE(session_id,client_order_id));
CREATE TABLE IF NOT EXISTS paper_fills(
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES paper_sessions(id),
 at TEXT NOT NULL,side TEXT NOT NULL,quantity REAL NOT NULL,price REAL NOT NULL,
 fee REAL NOT NULL,realised_pnl REAL NOT NULL,origin TEXT NOT NULL,
 opening_attribution TEXT,closing_attribution TEXT,order_id TEXT);
CREATE INDEX IF NOT EXISTS paper_fills_idx ON paper_fills(session_id,at);
CREATE TABLE IF NOT EXISTS paper_events(
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES paper_sessions(id),
 at TEXT NOT NULL,event_type TEXT NOT NULL,details_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS paper_events_idx ON paper_events(session_id,at);
'''

class ResearchStore:
    def __init__(self, home:str|Path):
        self.home=Path(home).resolve(); self.data=self.home/'datasets';self.data.mkdir(parents=True,exist_ok=True)
        self.dbpath=self.home/'research.sqlite3';self._cache={};self._cache_lock=threading.Lock()
        with self.conn() as db: db.executescript(SCHEMA)

    @contextmanager
    def conn(self):
        db=sqlite3.connect(str(self.dbpath),timeout=30)
        try:
            db.row_factory=sqlite3.Row
            db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA busy_timeout=30000')
            yield db
            if db.in_transaction:db.commit()
        except Exception:
            if db.in_transaction:db.rollback()
            raise
        finally:db.close()

    def event(self,db,id,kind,details=None):
        db.execute('INSERT INTO paper_events VALUES (?,?,?,?,?)',(uid(),id,now(),kind,dump(details or {})))

    def ingest(self, body:dict):
        if not isinstance(body,dict):raise InputError('Dataset record required')
        csv_text=body.get('csv_text');symbol=str(body.get('symbol','')).strip().upper()
        currency=str(body.get('currency','')).strip().upper();venue=str(body.get('venue','')).strip()
        provider=str(body.get('provider','')).strip();evidence=str(body.get('rights_reference','')).strip()
        allowed=body.get('allowed_uses');bar_size=body.get('interval_seconds')
        if not isinstance(bar_size,int) or isinstance(bar_size,bool):raise InputError('interval_seconds must be an integer')
        if len(symbol)<3 or len(symbol)>30 or not all(c.isalnum() or c in '-_./' for c in symbol):raise InputError('Invalid instrument')
        if currency not in ('USD','INR','EUR','GBP','HKD','JPY','USDT','USDC'):raise InputError('Explicit quote currency required')
        if not 2<len(venue)<=100 or not 2<len(provider)<=100 or not 7<len(evidence)<=500:raise InputError('Source and rights reference required')
        if not isinstance(allowed,dict) or any(allowed.get(p) is not True for p in ('historical_storage','algorithmic_backtesting','paper_replay')):
            raise InputError('Documented rights for storage, algorithmic backtesting and replay must be confirmed before import')
        if not isinstance(csv_text,str) or len(csv_text.encode('utf8'))>4*1024*1024:raise InputError('CSV must be 4 MB or smaller')
        bars=parse_bars(csv_text,bar_size)
        sha=hashlib.sha256(csv_text.encode('utf8')).hexdigest()
        path=self.data/(sha+'.csv')
        if not path.exists():
            temp=path.with_suffix('.tmp-'+uid());temp.write_bytes(csv_text.encode('utf8'));os.replace(temp,path)
        with self.conn() as db:
            found=db.execute('SELECT * FROM datasets WHERE checksum=?',(sha,)).fetchone()
            if found:
                existing=self._dataset(found)
                if existing['symbol']!=symbol or existing['currency']!=currency or existing['venue']!=venue or existing['provider']!=provider or existing['interval_seconds']!=bar_size:
                    raise InputError('Identical CSV checksum is already registered under different instrument metadata')
                return existing
            rid=uid();ts=now()
            db.execute('INSERT INTO datasets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(rid,path.name,sha,symbol,venue,currency,provider,bar_size,bars[0]['t'],bars[-1]['t'],len(bars),evidence,dump(allowed),ts))
            db.commit()
            return self._dataset(db.execute('SELECT * FROM datasets WHERE id=?',(rid,)).fetchone())

    def _dataset(self,r):
        d=rowdict(r);d['allowed_uses']=json.loads(d.pop('allowed_uses_json'));return d

    def datasets(self):
        with self.conn() as db:return [self._dataset(r) for r in db.execute('SELECT * FROM datasets ORDER BY created_at DESC')]

    def chart_bars(self, dataset_id: str, limit: int = 180):
        # Source-authenticated OHLC only. Never manufacture or interpolate a candle.
        d = self.get_dataset(dataset_id, 'historical_storage')
        if not isinstance(limit, int) or limit < 5 or limit > 240:
            raise InputError('Chart limit must be between 5 and 240')
        candles = self.bars(d)[-limit:]
        return {'dataset_id':d['id'], 'symbol':d['symbol'], 'currency':d['currency'],
                'provider':d['provider'], 'venue':d['venue'], 'checksum':d['checksum'],
                'interval_seconds':d['interval_seconds'], 'bars':candles,
                'source':'owner_registered_historical_dataset'}

    def get_dataset(self,id,required_use):
        with self.conn() as db:r=db.execute('SELECT * FROM datasets WHERE id=?',(id,)).fetchone()
        if not r:raise InputError('Dataset not found')
        d=self._dataset(r)
        if d['allowed_uses'].get(required_use) is not True:raise InputError('Dataset is not entitled for '+required_use)
        return d

    def bars(self, dataset:dict):
        key=dataset['checksum']
        with self._cache_lock:
            if key in self._cache:return self._cache[key]
        path=self.data/(key+'.csv')
        if not path.is_file():raise InputError('Historical data file missing')
        content=path.read_bytes().decode('utf8')
        if hashlib.sha256(content.encode('utf-8')).hexdigest()!=key:raise InputError('Historical data integrity check failed')
        bars=parse_bars(content,dataset['interval_seconds'])
        with self._cache_lock:
            if len(self._cache)>=5:self._cache.clear()
            self._cache[key]=bars
        return bars

    def enqueue(self,body:dict):
        d=self.get_dataset(body.get('dataset_id'), 'algorithmic_backtesting')
        s=body.get('strategy');spec_params(s)
        cfg=execution_settings(body.get('settings',{}))
        id=uid();created=now()
        with self.conn() as db:
            db.execute('INSERT INTO jobs (id,dataset_id,strategy_json,settings_json,status,created_at,updated_at) VALUES (?,?,?, ?,?,?,?)',
                (id,d['id'],dump(s),dump(cfg),'queued',created,created));db.commit()
        return {'id':id,'status':'queued','mode':'HISTORICAL_BACKTEST','dataset_id':d['id']}

    def jobs(self):
        with self.conn() as db:
            return [{'id':r['id'],'dataset_id':r['dataset_id'],'status':r['status'],'created_at':r['created_at'],'updated_at':r['updated_at'],'error':r['error']} for r in db.execute('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100')]

    def job(self,id):
        with self.conn() as db:r=db.execute('SELECT * FROM jobs WHERE id=?',(id,)).fetchone()
        if not r:raise InputError('Backtest not found')
        d=rowdict(r);d['strategy']=json.loads(d.pop('strategy_json'));d['settings']=json.loads(d.pop('settings_json'))
        if d['result_json']:
            result=json.loads(d.pop('result_json'))
            # Original research result is persisted in full; API returns a bounded visual sample.
            curve=result['equity_curve'];stride=max(1,(len(curve)+299)//300)
            result['equity_curve']=curve[::stride] + ([curve[-1]] if curve[-1] not in curve[::stride] else [])
            d['result']=result
        else:d.pop('result_json',None)
        return d

    def recover_jobs(self):
        with self.conn() as db:db.execute("UPDATE jobs SET status='queued',updated_at=? WHERE status='running'",(now(),));db.commit()

    def process_one_job(self):
        with self.conn() as db:
            db.execute('BEGIN IMMEDIATE')
            r=db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            if not r:db.rollback();return False
            db.execute("UPDATE jobs SET status='running',updated_at=? WHERE id=? AND status='queued'",(now(),r['id']));db.commit()
        try:
            ds=self.get_dataset(r['dataset_id'],'algorithmic_backtesting')
            bars=self.bars(ds)
            report=backtest(bars,json.loads(r['strategy_json']),json.loads(r['settings_json']))
            report['dataset_sha256']=ds['checksum'];report['dataset_provider']=ds['provider'];report['instrument']=ds['symbol'];report['currency']=ds['currency'];report['rights_reference']=ds['rights_reference']
            with self.conn() as db:
                db.execute("UPDATE jobs SET status='completed',result_json=?,updated_at=? WHERE id=? AND status='running'",(dump(report),now(),r['id']));db.commit()
        except Exception as e:
            with self.conn() as db:
                db.execute("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=? AND status='running'",(str(e)[:300],now(),r['id']));db.commit()
        return True

    def new_paper(self,body:dict):
        ds=self.get_dataset(body.get('dataset_id'),'paper_replay');spec=body.get('strategy');spec_params(spec)
        cfg=execution_settings(body.get('settings',{}));bars=self.bars(ds)
        id=uid();created=now();initial=cfg['initial_cash'];auto=1 if body.get('auto_enabled') is True else 0
        with self.conn() as db:
            db.execute('INSERT INTO paper_sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                  (id,ds['id'],dump(spec),dump(cfg),ds['currency'],initial,0.,0.,initial,initial,bars[0]['close'],1,None,'stopped',auto,created,created))
            self.event(db,id,'session_created',{'mode':'HISTORICAL_REPLAY','initial_cash':initial,'auto_enabled':bool(auto),'dataset_sha256':ds['checksum']})
            db.commit()
        return self.paper(id)

    def _paper(self, r,db):
        d=rowdict(r);d['settings']=json.loads(d.pop('settings_json'))
        s=json.loads(d.pop('strategy_json'));d['strategy']={'id':s.get('id'),'name':s.get('name'),'signal_family':s.get('signal_family'),'version':s.get('version')}
        d['auto_enabled']=bool(d['auto_enabled']);d['mode']='HISTORICAL_REPLAY_ONLY'
        d['equity_mark_to_market']=d['cash']+d['qty']*d['last_close'];d['pnl_mark_to_market']=d['equity_mark_to_market']-d['initial_cash']
        d['fills']=[rowdict(f) for f in db.execute('SELECT * FROM paper_fills WHERE session_id=? ORDER BY at DESC LIMIT 150',(d['id'],))]
        d['orders']=[rowdict(o) for o in db.execute('SELECT * FROM paper_orders WHERE session_id=? ORDER BY requested_at DESC LIMIT 150',(d['id'],))]
        d['events']=[{**rowdict(e),'details':json.loads(e['details_json'])} for e in db.execute('SELECT * FROM paper_events WHERE session_id=? ORDER BY at DESC LIMIT 100',(d['id'],))]
        for e in d['events']:e.pop('details_json',None)
        return d

    def paper(self,id):
        with self.conn() as db:
            r=db.execute('SELECT * FROM paper_sessions WHERE id=?',(id,)).fetchone()
            if not r:raise InputError('Paper session not found')
            return self._paper(r,db)

    def papers(self):
        with self.conn() as db:
            return [{'id':r['id'],'dataset_id':r['dataset_id'],'currency':r['currency'],'status':r['status'],'next_index':r['next_index'],'auto_enabled':bool(r['auto_enabled']),'updated_at':r['updated_at']} for r in db.execute('SELECT * FROM paper_sessions ORDER BY created_at DESC LIMIT 100')]

    def paper_control(self,id,action,body=None):
        with self.conn() as db:
            db.execute('BEGIN IMMEDIATE');r=db.execute('SELECT * FROM paper_sessions WHERE id=?',(id,)).fetchone()
            if not r:raise InputError('Paper session not found')
            if action=='stop':
                db.execute("UPDATE paper_sessions SET status='stopped',updated_at=? WHERE id=? AND status='running'",(now(),id))
                cancelled=db.execute("UPDATE paper_orders SET status='cancelled',reason='Operator stopped replay',updated_at=? WHERE session_id=? AND status='queued'",(now(),id)).rowcount
                self.event(db,id,'user_stop_requested',{'pending_orders_cancelled':cancelled})
            elif action=='resume':
                if r['status']=='completed':raise InputError('Completed replay cannot restart')
                db.execute("UPDATE paper_sessions SET status='running',updated_at=? WHERE id=? AND status='stopped'",(now(),id));self.event(db,id,'explicit_user_resume')
            elif action=='auto':
                if not isinstance(body,dict) or type(body.get('enabled')) is not bool:raise InputError('enabled must be boolean')
                db.execute('UPDATE paper_sessions SET auto_enabled=?,updated_at=? WHERE id=?',(int(body['enabled']),now(),id));self.event(db,id,'auto_toggle',{'enabled':body['enabled']})
            else:raise InputError('Unknown session action')
            db.commit()
        return self.paper(id)

    def manual_order(self,id,body):
        if not isinstance(body,dict):raise InputError('Order required')
        side=body.get('side');cid=str(body.get('client_order_id',''))
        if side not in ('BUY','SELL') or not 8<=len(cid)<=80 or not all(c.isalnum() or c in '-_' for c in cid):raise InputError('Invalid side or idempotency key')
        with self.conn() as db:
            db.execute('BEGIN IMMEDIATE');r=db.execute('SELECT * FROM paper_sessions WHERE id=?',(id,)).fetchone()
            if not r:raise InputError('Paper session not found')
            if r['status']=='completed':raise InputError('Replay already completed')
            existing=db.execute('SELECT * FROM paper_orders WHERE session_id=? AND client_order_id=?',(id,cid)).fetchone()
            if existing:return rowdict(existing)
            order_id=uid();t=now();db.execute('INSERT INTO paper_orders VALUES (?,?,?,?,?,?,?,?)',(order_id,id,cid,side,'queued',t,t,None))
            self.event(db,id,'manual_order_queued',{'side':side,'order_id':order_id})
            db.commit()
            return rowdict(db.execute('SELECT * FROM paper_orders WHERE id=?',(order_id,)).fetchone())

    def paper_step(self,id):
        """Advance exactly one real historical bar; never claims real-time execution."""
        # Acquire a SQLite immediate transaction for single-step/idempotent updates.
        with self.conn() as db:
            db.execute('BEGIN IMMEDIATE')
            r=db.execute('SELECT * FROM paper_sessions WHERE id=?',(id,)).fetchone()
            if not r or r['status']!='running':db.rollback();return False
            ds=self.get_dataset(r['dataset_id'],'paper_replay');bars=self.bars(ds);i=r['next_index']
            if i>=len(bars):
                db.execute("UPDATE paper_sessions SET status='completed',updated_at=? WHERE id=?",(now(),id));self.event(db,id,'replay_completed',{'open_position_marked_to_market':r['qty']>0});db.commit();return True
            b=bars[i];spec=json.loads(r['strategy_json']);settings=json.loads(r['settings_json']);family,p=spec_params(spec)
            cash=r['cash'];qty=r['qty'];basis=r['cost_basis'];peak=r['peak_equity'];opening_attribution=r['opening_attribution'];fee_rate=settings['fee_bps']/10000
            slip=settings['slippage_bps']/10000
            order=db.execute("SELECT * FROM paper_orders WHERE session_id=? AND status='queued' ORDER BY requested_at LIMIT 1",(id,)).fetchone()
            equity_before=cash+qty*bars[i-1]['close']
            risk_stop=equity_before<peak*(1-settings['max_drawdown_stop_pct']/100)
            origin='risk' if risk_stop and qty>0 else 'strategy'
            side='SELL' if risk_stop and qty>0 else None
            attribution=f"{spec.get('id','strategy')}@v{spec.get('version','unspecified')}"
            if not side and order:
                side=order['side'];origin='manual'
            if not side and bool(r['auto_enabled']):
                desired=desired_position(bars,i-1,family,p,qty>1e-12)
                side='BUY' if desired and qty<=1e-12 else 'SELL' if not desired and qty>1e-12 else None
            filled=False;reason=None;realised=0.0
            if side=='BUY':
                if qty>1e-12:reason='Already holding a long position'
                else:
                    price=b['open']*(1+slip);budget=cash*settings['max_allocation'];trade_qty=budget/(price*(1+fee_rate))
                    if trade_qty<=0:reason='Insufficient virtual cash'
                    else:
                        gross=trade_qty*price;fee=gross*fee_rate;cash-=gross+fee;qty=trade_qty;basis=gross+fee;opening_attribution=('MANUAL' if origin=='manual' else attribution);filled=True
            elif side=='SELL':
                if qty<=1e-12:reason='No long position to close'
                else:
                    price=b['open']*(1-slip);trade_qty=qty;gross=qty*price;fee=gross*fee_rate
                    cash+=gross-fee;realised=gross-fee-basis;qty=0.;basis=0.;filled=True
            if filled:
                db.execute('INSERT INTO paper_fills VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                    (uid(),id,b['t'],side,trade_qty,price,fee,realised,origin,opening_attribution,('MANUAL' if origin=='manual' else attribution) if side=='SELL' else None,order['id'] if order and origin=='manual' else None))
                self.event(db,id,'virtual_fill',{'side':side,'price':price,'quantity':trade_qty,'fee':fee,'pnl':realised,'origin':origin,'at':b['t']})
            if filled and side=='SELL':opening_attribution=None
            if order and origin=='manual':
                db.execute('UPDATE paper_orders SET status=?,reason=?,updated_at=? WHERE id=?',('filled' if filled else 'rejected',reason,now(),order['id']))
                if reason:self.event(db,id,'manual_order_rejected',{'order_id':order['id'],'reason':reason})
            elif order and risk_stop:
                db.execute("UPDATE paper_orders SET status='rejected',reason='Risk stop triggered',updated_at=? WHERE id=?",(now(),order['id']))
            mark=cash+qty*b['close'];peak=max(peak,mark)
            new_status='stopped' if risk_stop else 'completed' if i+1>=len(bars) else 'running'
            db.execute('UPDATE paper_sessions SET cash=?,qty=?,cost_basis=?,peak_equity=?,last_close=?,next_index=?,opening_attribution=?,status=?,updated_at=? WHERE id=?',
                (cash,qty,basis,peak,b['close'],i+1,opening_attribution,new_status,now(),id))
            if risk_stop:self.event(db,id,'risk_stop',{'reason':'Portfolio drawdown exceeded stop; replay requires manual restart'})
            if new_status=='completed':self.event(db,id,'replay_completed',{'open_position_marked_to_market':qty>0})
            db.commit();return True

    def tick_sessions(self,max_sessions=10):
        with self.conn() as db:ids=[r['id'] for r in db.execute("SELECT id FROM paper_sessions WHERE status='running' ORDER BY updated_at LIMIT ?",(max_sessions,))]
        for id in ids:self.paper_step(id)
        return len(ids)

    def state(self):
        with self.conn() as db:
            return {'mode':'HISTORICAL_RESEARCH_AND_PAPER_REPLAY','live_trading':False,'market_data_feed':'NONE',
                    'datasets':db.execute('SELECT count(*) FROM datasets').fetchone()[0],
                    'jobs_queued':db.execute("SELECT count(*) FROM jobs WHERE status='queued'").fetchone()[0],
                    'paper_running':db.execute("SELECT count(*) FROM paper_sessions WHERE status='running'").fetchone()[0],
                    'engine_version':'0.5.0','storage':'SQLite WAL (local PC)'}
