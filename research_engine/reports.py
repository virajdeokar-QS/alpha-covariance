"""Local reproducibility report, no publication of raw licensed market prices."""
from pathlib import Path
from datetime import datetime,timezone
from .store import ResearchStore
from .quant import InputError
import os,sys


def generate(store,job_id):
    job=store.job(job_id)
    if job['status']!='completed':raise InputError('Only completed backtests can be reported')
    r=job['result'];s=job['strategy'];settings=job['settings'];dataset=store.get_dataset(job['dataset_id'],'algorithmic_backtesting')
    def fmt(x):return f'{x:.4f}' if isinstance(x,(int,float)) else str(x)
    def clean(x):return str(x).replace('`','\\`').replace('|','\\|').replace('\n',' ')
    text=f'''# Alpha Covariance — Reproducible Experimental Backtest

**Status:** Educational, exploratory in-sample result; NOT a validated strategy or investment recommendation.
**Job:** `{job_id}`
**Run timestamp:** {job['updated_at']} UTC
**Dataset SHA-256:** `{dataset['checksum']}`
**Source:** {clean(dataset['provider'])} / {clean(dataset['venue'])}
**Symbol:** {clean(dataset['symbol'])} ({dataset['currency']})
**Rights evidence reference:** {clean(dataset['rights_reference'])} (owner-supplied; not independently audited)

## Reproducibility contract

- Strategy id/version: `{clean(s.get('id','unversioned'))}` / `{clean(s.get('version','unversioned'))}`
- Strategy family: `{s['signal_family']}`
- Parameter settings: `{clean(s['parameters'])}`
- Bar interval: {dataset['interval_seconds']} seconds
- Historical records: {r['bars']} between {r['start_at']} and {r['end_at']}
- Fill timing: signal at bar close, simulated execution at the **next bar open**
- Fee assumption: {settings['fee_bps']} basis points each fill
- Slippage assumption: {settings['slippage_bps']} basis points each fill
- Long-only maximum allocation: {settings['max_allocation']*100:.2f}%
- Drawdown stop threshold: {settings['max_drawdown_stop_pct']}%
- Open positions at sample end are **marked to market**, not presumed closed

## Descriptive test output (not alpha validation)

| Metric | Value |
|---|---:|
| Initial virtual cash | {fmt(r['initial_cash'])} {dataset['currency']} |
| Ending marked-to-market equity | {fmt(r['ending_equity'])} {dataset['currency']} |
| In-sample return (%) | {fmt(r['return_pct'])} |
| Price-only buy-and-hold change (%) | {fmt(r['buyhold_price_change_pct'])} |
| Difference vs price-only comparator (pp) | {fmt(r['excess_vs_price_pct_points'])} |
| Max drawdown (%) | {fmt(r['max_drawdown_pct'])} |
| Completed round trips | {r['completed_trades']} |
| Winning / losing completed trades | {r['winning_trades']} / {r['losing_trades']} |
| Fees (virtual, estimated) | {fmt(r['fees'])} |
| Per-bar Sharpe (unannualized) | {fmt(r['per_bar_sharpe_unannualized'])} |

## Limitations

This run is in-sample, subject to selection bias and data rights, and does not establish
statistical alpha. No exchange order, brokerage connection, real execution latency, market
impact or official venue fill was observed. Slippage and fee estimates may differ materially.
The baseline is a price-only comparison, not a properly risk-adjusted benchmark.
Do not publish restricted dataset records or derived data without confirming the provider's terms.

## Provenance

The full immutable job record, fill events and equity marks are persisted locally in the
research SQLite database. Dataset integrity is checked against the SHA-256 above.
'''
    folder=store.home/'reports';folder.mkdir(parents=True,exist_ok=True)
    path=folder/(job_id+'.md');path.write_text(text,encoding='utf8');return path


def cli():
    if len(sys.argv)!=2:raise SystemExit('Usage: python -m research_engine.reports JOB_ID')
    store=ResearchStore(os.environ.get('AC_ENGINE_HOME','./runtime'))
    print(generate(store,sys.argv[1]))

if __name__=='__main__':cli()
