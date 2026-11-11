# Alpha Covariance Research Desk · release architecture

## Non-negotiable invariants

1. Unapproved accounts cannot access workspace assets, endpoints or stored research data.
2. Every market datum has provenance: provider, venue, symbol, exchange timestamp, received timestamp, adjustment/currency, freshness and license.
3. No fabricated quotes, candles, news, orders, strategy counts or alpha performance. Missing means missing.
4. No broker connection until risk controls, safe paper simulation and auditability are validated.
5. Backtest and paper strategies share signal calculations where practical but maintain separate execution models and reconcile differences.
6. A strategy is never “positive alpha” because of a single profitable backtest. Independent, out-of-sample, costs-aware evidence and governance are required.
7. Every trade/order decision has immutable event lineage, replay id, stable strategy version, dataset version and reproducible parameters.

## Stage gates

| Release | Scope | Exit criterion |
| --- | --- | --- |
| 0.1 · Access + Markets | Separate authenticated workspace, market session indicators, real crypto snapshots and near-live OHLC chart, empty strategy states | Access bypass tests pass; live source, no dummy charts; public Worker unaffected |
| 0.2 · Strategy Registry | Account roles, D1 tables, strategy versions, paper references, configurable signal definition format, approval states, feedback | CRUD and role tests, migrations and audit trail pass |
| 0.3 · Backtest Studio | Background job queue, local Python research worker, deterministic data snapshots, costs-aware backtest reports, walk-forward/OOS checks | Can close browser and still retrieve persisted completed/failed run |
| 0.4 · Paper Engine | Persistent state machine, idempotent manual/automatic paper orders, fills, risk checks, STOPPED kill-switch, no broker | Restart/recovery, duplicate-order and risk-limit tests pass |
| 0.5 · Journal & Monitoring | Trades/positions, win/loss filtering, realised and unrealised P&L, slippage and latency observed in metrics, reconciliation | End-to-end event replay and balance/P&L checks pass |
| 0.6 · Multi-asset | Licensed equities/FX feeds, official calendars, corporate actions, market-hours-aware data and attributable ticker news | Provider rights, timestamp correctness and freshness tests pass |

## Planned architecture

```text
public site (alphacovariance.com)       private desk (desk.alphacovariance.com)
               |                                    |
               |                              Cloudflare Access
               |                                    |
       Public Cloudflare Worker               Desk Cloudflare Worker
                                                     |
                                      authenticated control-plane API
                                             /                 \
                                   D1 metadata               Job dispatcher
                            (users, strategies, runs,         (durable queue)
                              orders, audit indexes)               |
                                                          Local WSL2 Python worker
                                                          (initial zero cloud cost)
                                                            |          |
                                                          kdb+/q    DuckDB/Parquet
                                                        (time series) (snapshots)
                                                            |          |
                                                        Immutable run artifacts
                                                        + event ledger / backups
```

Cloudflare Workers Free is not an always-on Python backtest engine. Heavy calculations run in a separately managed WSL2 worker that pulls authenticated jobs from a queue and persists results. If the local machine is off, queued jobs remain pending. Genuine 24/7 operation later requires reliable always-on compute, which may cost money.

D1 Free can store small strategy/configuration metadata and run indexes, subject to its read/write/storage quotas. Price/tick-scale datasets belong in compressed Parquet/kdb+/DuckDB (local at first) rather than D1. R2 can be evaluated for offsite artifacts within relevant free-tier limits; backups are mandatory before moving critical data off local storage.

## Strategy states

`draft` → `ready_for_review` → `backtesting` → `under_testing` → `validated` → `paper_approved` → `paper_running` → `paper_stopped`

Any state may enter `rejected`/`archived` with reason. Only documented validation may produce a **candidate** positive-alpha classification; never use it as a profitability promise. `paper_stopped` requires new explicit owner action to restart.

## Backtest job lifecycle

API creates an immutable job spec with seed, code revision, dataset version, fees, timestamp rules, universe and parameter schema → queue receives job id → Python worker claims job idempotently → runs outside browser → checkpoints/records result → D1 indexes status/artifact location → UI polls status or subscribes to updates.

## Latency reporting

Never fabricate “expected trade latency.” Record measured distributions for: feed receive delay, signal calculation, decision, simulated order acknowledgement and fill-model delay. Paper latency is **modelled**, not actual broker execution. Show p50/p95/p99 when enough observations exist, with hardware/clock-source notes.
