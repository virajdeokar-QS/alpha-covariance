# Architecture — Alpha Covariance R0.5 (educational, non-commercial)

## Trust boundaries

```
     anyone with a link                            allowlisted login (Cloudflare Access)
        alphacovariance.com                               desk.alphacovariance.com
        PUBLIC UNLISTED                                  PRIVATE / ALL ROUTES AUTH
        static public Worker                             independent private Worker
        noindex META/headers                             Access JWT SIGNATURE validation
                                                        owner role from FEED_OWNER_EMAIL
                          owner-only private APIs:
                          GET /api/strategies           -> Cloudflare D1 strategy metadata
                          POST /api/strategies          -> versioned research drafts
                          GET /api/markets,candles      -> explicit owner-only feed gate
                          /api/engine/*                 -> INTERNAL SIGNED GATEWAY
                                                        X-Alpha-Engine-Token (secret)
                                                                |
                                                       engine.alphacovariance.com
                                                       Cloudflare Tunnel optional
                                                                |
                                                       localhost:8790 (WSL Linux)
                                                       PRIVATE HTTP JSON API
                                                       strict server-to-server secret
                                                                |
                                                       local SQLite WAL + CSV files
                                                       persisted research jobs
                                                       separate headless daemon
                                                       deterministic historical replay
```

The engine domain is **not a direct, public research API**; it uses a service-to-service secret and the separate Desk Worker verifies the human user first. Prefer adding Cloudflare Access service-token protection and rate limits as defense-in-depth. Confirm that Worker subrequests to this Cloudflare Tunnel hostname work in the target zone before release. If not, do not circumvent the authentication design with an unauthenticated tunnel.

## Rights architecture

An imported dataset has source, venue, instrument, quote currency, timestep, SHA-256 and rights evidence reference. The importer requires affirmative assertions that the owner has permission for historical storage, algorithmic backtesting and paper replay. **An owner checkbox or entered licence reference does not prove permission.** Confirm licence independently before importing; engineering code cannot approve a contract.

Coinbase API remains an independent **owner manual view** capability, **off by default**. Data from Coinbase API is not imported to research storage, training or automated trading. No multi-user market data redistribution is implemented. Indian market educational data should only be onboarded after rights and applicable SEBI educational-data delay conditions are verified.

## Data science and execution fidelity

- Historical bar CSV inputs: UTC `timestamp`, `open`, `high`, `low`, `close`, `volume`; 60+ rows; future/duplicate/malformed observations rejected; gaps recorded by remaining absent, never interpolated.
- Supported executable signal families: moving average cross, fixed-window momentum, mean reversion. Flexible custom research specifications exist but **are not executable** until specifically reviewed and implemented. This avoids executing arbitrary Python supplied from a website.
- Backtest: signal uses completed observations through bar *t*; simulated fill uses **next bar open**. Long-only with cap, fee and slippage assumptions, stop policy, marked-to-market equity, persisted fills. In-sample, single dataset, exploratory only. Benchmark delta vs buy-and-hold price change is **not verified statistical alpha**.
- Paper replay: only historical datasets, cash and quantity accounts in quote currency, manual/automated orders, order idempotency, stop and explicit resume, recorded origin, fees and realised P&L. No broker/API key ever present. Session initial state STOPPED; daemon ticks only RUNNING sessions.
- The daemon polls jobs and paper sessions independent of the browser. A system interruption can halt the daemon; on restart incomplete backtests are requeued. The full input checksum and result are persisted. While the local PC is off, no background work occurs.
- Portfolio analytics: overlap only exact timestamps across compatible intervals/currencies; covariance/volatility are descriptive in-sample diagnostics; projected-gradient long-only min-variance heuristic, not an investment recommendation. No FX conversion or missing-price fabrication.
- Report exporter stores reproducibility summary without copying raw licensed price records to a publication by default.
- C++ benchmark times only a local std::map update and top-level retrieval with historical order-book updates. Its per-update nanosecond measurements **are not network latency, exchange order execution, or HFT claims**.

## Privacy and data minimisation

- `site` has no private strategy or trading records; it's unlisted, not private.
- Private Access handles authenticated identity and security logs under provider controls.
- D1 holds only private strategy definitions, versions and audit events; no imported licensed price data.
- Local SQLite/CSV contains owner-supplied datasets and virtual order history; backups, file permissions, retention and deletion are the operator's responsibility.
- The API does not send permissive cross-origin responses; gateway only injects the internal service token after Access validation and role enforcement.
- `workers_dev:false`, `run_worker_first:true`, strict host match. Verify Cloudflare preview and workers.dev URLs are not reachable in production.

## Research and compliance release gates

1. Confirm Cloudflare Access route/JWT and owner-only D1 + engine APIs.
2. Compare actual production code/route metadata with this source before deployment.
3. Explicit rights for *each* provider's viewing, historical storage, algorithm development, paper simulation and external user access.
4. Security smoke test: no unapproved access to HTML/JS/API; no data in caches; no secret to the browser; no direct tunnel access without server credential.
5. Data integrity: test end-to-end imported real dataset with correct licence, symbol and currency; no stale/missing interval imputation.
6. Simulated orders: stop/resume and manual order idempotency, recorded fees and losses.
7. Public noindex HTTP response and search removal verification if already indexed; Titan DNS untouched.
8. Before inviting external users / news / live strategy signals, obtain provider rights and privacy/security review.
9. Before any broker integration or investment advice, conduct separate regulatory and contractual review.

## Deliberately not included

Market-wide real-time feed licences, options chains, official exchange holiday calendars, headline/news API agreements, institutional order matching, low-latency networking, real-money broker routing, live algo executor, external expert access, fully automated privacy deletion, third-party pen test, and independently validated alpha status. These are separate deliverables with genuine data and reliability dependencies—not features hidden behind unimplemented UI buttons.
