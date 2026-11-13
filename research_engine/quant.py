"""Deterministic, long-only, historical-bar execution simulator.

IMPORTANT: Only uses explicitly imported, licensed historical datasets. No fake live prices.
Signals are calculated from bars through t and orders fill at the next bar's open.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite, sqrt
from statistics import mean, pstdev
import csv, io
from typing import Any

ALGORITHMS = ('moving_average_cross', 'mean_reversion', 'momentum')
INTERVALS = (60, 300, 900, 3600, 86400)

class InputError(ValueError):
    pass


def number(v, name: str, minimum=None, maximum=None) -> float:
    try: n = float(v)
    except (TypeError, ValueError): raise InputError(f'Invalid {name}')
    if not isfinite(n) or (minimum is not None and n < minimum) or (maximum is not None and n > maximum):
        raise InputError(f'Invalid {name}')
    return n


def utc_timestamp(value: str) -> str:
    if not isinstance(value, str): raise InputError('timestamp must be ISO 8601 with UTC offset')
    try: dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError: raise InputError('timestamp must be ISO 8601 with UTC offset')
    if dt.tzinfo is None: raise InputError('timestamp must include timezone')
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z')


def parse_bars(content: str, interval_seconds: int, max_rows=100_000) -> list[dict]:
    if interval_seconds not in INTERVALS: raise InputError('Unsupported candle interval')
    if not isinstance(content, str) or not content.strip(): raise InputError('Missing historical CSV')
    if '\x00' in content: raise InputError('Invalid CSV bytes')
    reader = csv.DictReader(io.StringIO(content, newline=''))
    required = ('timestamp','open','high','low','close','volume')
    if reader.fieldnames != list(required): raise InputError('CSV header must be timestamp,open,high,low,close,volume')
    bars = []; prior = None
    for row in reader:
        if len(bars) >= max_rows: raise InputError('Dataset exceeds bar limit')
        t = utc_timestamp(row['timestamp'])
        dt = datetime.fromisoformat(t.replace('Z','+00:00'))
        seconds = int(dt.timestamp())
        if prior is not None and (seconds <= prior or (seconds-prior)%interval_seconds != 0):
            raise InputError('Timestamps must ascend in valid interval multiples; no synthetic gap filling')
        # Explicit missing intervals are allowed but never filled.
        if seconds > int(datetime.now(timezone.utc).timestamp()) + interval_seconds:
            raise InputError('Historical observations cannot be from the future')
        o=number(row['open'],'open',minimum=0.000000000001);h=number(row['high'],'high',minimum=0.000000000001)
        l=number(row['low'],'low',minimum=0.000000000001);c=number(row['close'],'close',minimum=0.000000000001)
        v=number(row['volume'],'volume',minimum=0)
        if l>min(o,c) or h<max(o,c) or h<l: raise InputError('OHLC envelope inconsistent')
        bars.append({'t':t,'open':o,'high':h,'low':l,'close':c,'volume':v});prior=seconds
    if len(bars)<60: raise InputError('At least 60 real historical bars are required')
    return bars


def spec_params(spec: dict) -> tuple[str,dict]:
    if not isinstance(spec, dict): raise InputError('Strategy snapshot must be an object')
    family=spec.get('signal_family');p=spec.get('parameters')
    if family not in ALGORITHMS: raise InputError('Strategy family has no reviewed executable implementation')
    if not isinstance(p,dict): raise InputError('Strategy parameters must be an object')
    # Reject strings/booleans in integer params rather than silently casting.
    def int_param(k, default, lo=2, hi=500):
        v=p.get(k,default)
        if isinstance(v,bool) or not isinstance(v,int) or not lo<=v<=hi: raise InputError(f'Invalid {k}')
        return v
    valid_keys={'moving_average_cross':{'fast','slow'},'mean_reversion':{'window','entry_z','exit_z'},'momentum':{'lookback'}}[family]
    if set(p)-valid_keys:raise InputError('Unrecognized executable parameters: '+', '.join(sorted(set(p)-valid_keys)))
    if family=='moving_average_cross':
        fast=int_param('fast',10);slow=int_param('slow',30)
        if fast>=slow: raise InputError('fast must be less than slow')
        return family,{'fast':fast,'slow':slow}
    if family=='momentum':return family,{'lookback':int_param('lookback',20)}
    window=int_param('window',30)
    entry=number(p.get('entry_z',-2),'entry_z',minimum=-6,maximum=-0.1)
    exit_z=number(p.get('exit_z',0),'exit_z',minimum=-2,maximum=4)
    if exit_z<=entry: raise InputError('exit_z must exceed entry_z')
    return family,{'window':window,'entry_z':entry,'exit_z':exit_z}


def desired_position(bars:list[dict], i:int, family:str,p:dict, holding:bool)->bool:
    """Decision at close of bar i using no future bars."""
    if i<0:return False
    if family=='moving_average_cross':
        f=p['fast'];s=p['slow']
        if i+1<s:return False
        return mean(b['close'] for b in bars[i-f+1:i+1])>mean(b['close'] for b in bars[i-s+1:i+1])
    if family=='momentum':
        n=p['lookback'];return i>=n and bars[i]['close']>bars[i-n]['close']
    w=p['window']
    if i+1<w:return False
    sample=[b['close'] for b in bars[i-w+1:i+1]]
    std=pstdev(sample)
    if std<=0:return holding
    z=(sample[-1]-mean(sample))/std
    return (z<p['exit_z']) if holding else (z<=p['entry_z'])


def execution_settings(raw:dict)->dict:
    if not isinstance(raw,dict):raise InputError('Execution settings required')
    return dict(initial_cash=number(raw.get('initial_cash',10000),'initial_cash',minimum=100,maximum=100_000_000),
                fee_bps=number(raw.get('fee_bps',10),'fee_bps',minimum=0,maximum=200),
                slippage_bps=number(raw.get('slippage_bps',5),'slippage_bps',minimum=0,maximum=200),
                max_allocation=number(raw.get('max_allocation',0.90),'max_allocation',minimum=.01,maximum=.98),
                max_drawdown_stop_pct=number(raw.get('max_drawdown_stop_pct',25),'max_drawdown_stop_pct',minimum=1,maximum=90))


def backtest(bars:list[dict], spec:dict,settings:dict)->dict[str,Any]:
    family,params=spec_params(spec);cfg=execution_settings(settings)
    cash=cfg['initial_cash'];qty=0.;cost_basis=0.;fees=0.;peak=cash
    fills=[];equity=[];closed_trades=[];returns=[];prev_equity=None;stopped=False
    fill_bps=cfg['slippage_bps']/10000;fee_rate=cfg['fee_bps']/10000
    for i,b in enumerate(bars):
        if i>0 and not stopped:
            wanted=desired_position(bars,i-1,family,params,qty>1e-12)
            if equity and equity[-1]['drawdown_pct']<=-cfg['max_drawdown_stop_pct']:wanted=False;stopped=True
            if wanted and qty<=1e-12:
                price=b['open']*(1+fill_bps);budget=cash*cfg['max_allocation'];trade_qty=budget/(price*(1+fee_rate))
                if trade_qty>0:
                    gross=trade_qty*price;fee=gross*fee_rate;cash-=gross+fee;qty+=trade_qty;cost_basis=gross+fee;fees+=fee
                    fills.append({'at':b['t'],'action':'BUY','price':price,'quantity':trade_qty,'fee':fee,'origin':'strategy','strategy_id':str(spec.get('id',''))})
            elif not wanted and qty>1e-12:
                price=b['open']*(1-fill_bps);gross=qty*price;fee=gross*fee_rate;cash+=gross-fee;fees+=fee
                pnl=gross-fee-cost_basis;closed_trades.append({'exit_at':b['t'],'pnl':pnl,'return_pct':(pnl/cost_basis*100 if cost_basis else None)})
                fills.append({'at':b['t'],'action':'SELL','price':price,'quantity':qty,'fee':fee,'origin':'risk' if stopped else 'strategy','strategy_id':str(spec.get('id',''))})
                qty=0.;cost_basis=0.
        current=cash+qty*b['close'];peak=max(peak,current);dd=(current/peak-1)*100
        if prev_equity and prev_equity>0:returns.append(current/prev_equity-1)
        prev_equity=current
        equity.append({'t':b['t'],'equity':current,'drawdown_pct':dd})
    # Open positions remain marked-to-market. We do NOT pretend they closed at a tradable execution price.
    ending=equity[-1]['equity']
    sharpe_per_bar=None
    if len(returns)>2 and pstdev(returns)>0:sharpe_per_bar=mean(returns)/pstdev(returns)
    first=bars[0]['close'];last=bars[-1]['close']
    buyhold_pct=(last/first-1)*100
    result={
        'status':'completed','mode':'HISTORICAL_BACKTEST','trading':'simulated_only','strategy_family':family,
        'start_at':bars[0]['t'],'end_at':bars[-1]['t'],'bars':len(bars),
        'initial_cash':cfg['initial_cash'],'ending_equity':ending,'return_pct':(ending/cfg['initial_cash']-1)*100,
        'buyhold_price_change_pct':buyhold_pct,
        'excess_vs_price_pct_points':(ending/cfg['initial_cash']-1)*100-buyhold_pct,
        'max_drawdown_pct':min(q['drawdown_pct'] for q in equity),
        'fees':fees,'completed_trades':len(closed_trades),
        'winning_trades':sum(x['pnl']>0 for x in closed_trades),
        'losing_trades':sum(x['pnl']<0 for x in closed_trades),
        'realised_pnl':sum(x['pnl'] for x in closed_trades),
        'unrealised_mark_to_market':qty*bars[-1]['close']-cost_basis if qty else 0,
        'open_quantity':qty,'per_bar_sharpe_unannualized':sharpe_per_bar,
        'risk_stop_triggered':stopped,'fills':fills,'equity_curve':equity,
        'validation':'IN_SAMPLE_EXPLORATORY_ONLY','alpha_claim':'NOT_VALIDATED',
        'notes':['No broker orders','Long only, next-bar-open simulated fills','Fees and slippage estimated, not observed','Not investment advice',
                 'Price-only buy-and-hold comparator is not statistical alpha','Unannualized Sharpe per bar, not annualized']}
    return result
