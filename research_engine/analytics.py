"""Transparent exploratory portfolio analytics from permitted historical closes.
No predictive signals, forecasts, or claims of positive alpha.
"""
from __future__ import annotations
from math import sqrt
from statistics import mean,pstdev
from .quant import InputError


def covariance_matrix(returns):
    n=len(returns);m=len(returns[0]);mu=[mean(row[j] for row in returns) for j in range(m)]
    return [[sum((row[i]-mu[i])*(row[j]-mu[j]) for row in returns)/n for j in range(m)] for i in range(m)]


def variance(w,cov):return sum(w[i]*cov[i][j]*w[j] for i in range(len(w)) for j in range(len(w)))


def project_simplex(v):
    vals=sorted(v,reverse=True);s=0;rho=0;theta=0
    for i,x in enumerate(vals):
        s+=x
        t=(s-1)/(i+1)
        if x>t:rho=i+1;theta=t
    if rho==0:raise InputError('Invalid portfolio weights')
    return [max(x-theta,0) for x in v]


def minvar_weights(cov):
    n=len(cov);w=[1/n]*n
    L=max(sum(abs(v) for v in row) for row in cov)
    if L<=1e-20:return w
    for _ in range(1000):
        grad=[2*sum(cov[i][j]*w[j] for j in range(n)) for i in range(n)]
        w=project_simplex([w[i]-grad[i]/(2*L) for i in range(n)])
    return w


def analyze_portfolio(store,ids):
    if not isinstance(ids,list) or not 2<=len(ids)<=6 or len(set(ids))!=len(ids):
        raise InputError('Choose 2–6 different licensed datasets')
    datasets=[store.get_dataset(id,'algorithmic_backtesting') for id in ids]
    if len({d['currency'] for d in datasets})>1:raise InputError('All assets must share a quote currency, unless explicit FX conversions are supplied')
    if len({d['interval_seconds'] for d in datasets})>1:raise InputError('All assets must use the same bar interval')
    maps=[]
    for d in datasets:
        bars=store.bars(d)
        maps.append({b['t']:b['close'] for b in bars})
    shared=sorted(set.intersection(*(set(m) for m in maps)))
    if len(shared)<60:raise InputError('At least 60 timestamps must overlap; no gaps or missing prices are fabricated')
    rows=[]
    for k in range(1,len(shared)):
        rows.append([maps[i][shared[k]]/maps[i][shared[k-1]]-1 for i in range(len(ids))])
    cov=covariance_matrix(rows);n=len(ids);ew=[1/n]*n;mw=minvar_weights(cov)
    std=[sqrt(max(0,cov[i][i])) for i in range(n)]
    risk_ew=sqrt(max(0,variance(ew,cov)));risk_mv=sqrt(max(0,variance(mw,cov)))
    # Euler risk contribution (variance component), not a return forecast.
    contributions=[ew[i]*sum(cov[i][j]*ew[j] for j in range(n)) for i in range(n)]
    return {
        'mode':'HISTORICAL_DESCRIPTIVE_ANALYSIS','currency':datasets[0]['currency'],
        'interval_seconds':datasets[0]['interval_seconds'],'overlapping_bars':len(shared),
        'start_at':shared[0],'end_at':shared[-1],
        'instruments':[{'dataset_id':d['id'],'symbol':d['symbol'],'venue':d['venue'],'sha256':d['checksum']} for d in datasets],
        'per_bar_volatility':std,'covariance':cov,'correlation':[[cov[i][j]/(std[i]*std[j]) if std[i]*std[j]>0 else None for j in range(n)] for i in range(n)],
        'equal_weight':{'weights':ew,'per_bar_volatility':risk_ew,'variance_contributions':contributions},
        'long_only_minimum_variance':{'weights':mw,'per_bar_volatility':risk_mv,'method':'projected_gradient_simplex'},
        'alpha_claim':'NOT_VALIDATED','warning':'Historical in-sample covariance only. No forecast, no recommended allocation or financial advice.'
    }


def explore_factors(store,id):
    ds=store.get_dataset(id,'algorithmic_backtesting');b=store.bars(ds)
    if len(b)<60:raise InputError('At least 60 rows required')
    close=[x['close'] for x in b]
    changes=[close[i]/close[i-1]-1 for i in range(1,len(close))]
    lag20=close[-1]/close[-21]-1
    lag50=close[-1]/close[-51]-1
    recent=changes[-20:];vol=pstdev(recent) if len(recent)>1 else None
    return {'mode':'HISTORICAL_DESCRIPTIVE_FACTOR_EXPLORATION','symbol':ds['symbol'],'currency':ds['currency'],
            'dataset_sha256':ds['checksum'],'as_of':b[-1]['t'],'observations':len(b),
            'return_20_bars':lag20,'return_50_bars':lag50,'realized_volatility_per_bar_20':vol,
            'alpha_claim':'NOT_VALIDATED','warning':'Historical returns and volatility are descriptions, not predictive trading signals.'}
