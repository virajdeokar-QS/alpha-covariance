# Alpha Covariance — Consolidated Research Release R0.5

**Prepared 12 November 2026. Source package only. NOT DEPLOYED.**

This is an integrated, educational-only code release covering the Stage 1 fixes, Stage 2 Strategy Studio and runnable components of Stages 3–5. **It is not a claim that global live feeds, always-on cloud processing, low-latency real execution, expert accounts or unrestricted market data have been delivered.** Those require additional work and appropriate permissions. Read `docs/INTEGRATED_RELEASE_DEPLOYMENT.md` before changing any production configuration.

## What is present and executable

| Module | Implementation | Where it runs | Data rights | Status |
|---|---|---|---|---|
| Public unlisted website | Existing editorial site, noindex, sitemap removed | Existing public Cloudflare Worker | No external live feed | Source tested; site deployment pending |
| Private Desk | Cloudflare Access signed JWT, distinct technical UI, owner restrictions | Existing private Worker | Coinbase owner-display disabled by default | Source tested; live regressions need verification |
| Stage 1 candle patch | Coinbase USD, sorted timestamps, missing interval report, no fake fills | Private Worker, owner-view gate | Manual owner rights must be checked | Tests pass; production unverified |
| Stage 2 Strategy Studio | Owner-authored hypotheses, versioning, archival, audit | Private Worker + D1 | No price data stored in D1 | Tests pass; remote D1 pending |
| Licensed historical data register | Upload CSV with stated source and rights reference, SHA256 checks, no gap filling | Local Python engine + SQLite | Must be explicitly authorised | Local tests pass |
| Persistent background backtests | Deterministic next-bar-open long-only orders, fee/slippage assumptions, performance and fills | Local Python daemon + SQLite | Eligible historical dataset only | Local tests pass |
| Virtual paper execution | Owner-only, manual and rule-based virtual fills, STOP/RESUME, idempotency, ledger and simulated wallet | Local Python daemon + SQLite | Eligible historical dataset only | Local tests pass |
| Journal and attribution | Strategy and manual fill origin, transaction cost, realised/unrealised P&L | Local Python engine | No real broker | Local tests pass |
| Factors / portfolio risk | Historical momentum, volatility, covariance, correlation, long-only minimum variance | Local Python engine | Eligible historical datasets | Local tests pass |
| Research report | Reproducibility markdown export from saved completed job | Local Python CLI | Do not publish restricted data | Local tests pass |
| CPU order-book microbenchmark | C++ price-level update local execution latency from user-authorised event CSV | Local terminal | Rights for imported events | Compiles; not network latency |
| Desk UI | Data provenance, backtests, virtual execution, journal, risk/factors | Private Worker static assets + engine gateway | Owner-only | JS syntax and API mocks tested; live browser review pending |
| Financial news | Clearly disconnected empty state | Private Desk | News licence needed | Not implemented |
| Global real-time equities/FX/options | No false data or fake market-session holiday calendar | Future integrations | Venue-specific licences needed | Not implemented |
| Expert review accounts / guide agent | Deliberately deferred per owner instruction | Future | External data rights and privacy review | Not deployed |

**Live orders cannot be sent**: no brokerage credentials, endpoints, connections or APIs exist in this release. All orders are historical virtual events.

## Three components; two hosting environments

1. `site/`, `build.py`: public editorial website, accessible by direct link, `noindex`; not confidential.
2. `desk/`, `wrangler.desk.jsonc`, `migrations/`: private authenticated Cloudflare application, owner-only strategy and gateway endpoints.
3. `research_engine/`, `tests_engine/`, `benchmarks/`: local Python/SQLite worker and C++ benchmark. Local `127.0.0.1:8790` API reached from Desk only via an authenticated Worker proxy + internal secret + optional Cloudflare Tunnel. **If the PC is off, these features are offline.**

No external dataset or fabricated trading result is distributed in the ZIP. Synthetic price observations are used only as **unit-test fixtures** in the tests, never as live site data.

## Quick local tests (from repository root)

```sh
python build.py
node --test tests/*.test.mjs
python -m unittest discover -s tests_engine -v
python -m research_engine check
node --check desk/assets/laboratory.js
node --check desk/worker/index.js
# optional C++ benchmark compilation
c++ -std=c++20 -O3 -Wall -Wextra benchmarks/orderbook_replay.cpp -o /tmp/ac-orderbook-replay
```

> Node 22+ required to run the SQLite-backed D1 emulation tests.

## Start local engine (two separate terminals)

Run from repository root, with one **private, strong secret** in both the Cloudflare Worker and local service. The data directory should be outside the Git checkout.

```sh
# In WSL/Ubuntu, for EACH engine terminal:
export AC_ENGINE_HOME="$HOME/alpha-covariance-private-data"
# Set ENGINE_SHARED_SECRET securely from a private secrets file, never commit it.
python -m research_engine api       # terminal A; loopback:8790
python -m research_engine worker    # terminal B; headless queued jobs and replay
```

The engine refuses startup if `ENGINE_SHARED_SECRET` is not set to a long value. Set the Cloudflare `RESEARCH_ENGINE_TOKEN` secret to **exactly the same value**. Do not share it in the deployment chat.

## Important before real release

- First save/export the **current production Desk Worker source**. Coinbase/hotfix changes have previously been deployed directly and are not necessarily present on GitHub `main`.
- Do not push this ZIP directly onto `main`. Create a feature branch, review the diff, run tests and stage the deployment.
- Add a Cloudflare D1 database and the `RESEARCH_DB` binding with the **actual** generated database UUID; apply `migrations/0001_strategy_registry.sql` before Studio testing.
- A Cloudflare Tunnel for `engine.alphacovariance.com` is optional; without it, local engine features will be **unavailable in the cloud Desk**. If using Tunnel, set the backend secret and verify public unauthenticated requests to the tunnel return 403; never expose the SQLite directory or an unprotected port.
- Cloudflare Access private Desk applies independently to all static assets and APIs. A signed JWT check in Worker must stay on every route.
- Keep `MARKET_DATA_OWNER_DISPLAY` disabled until the owner's Coinbase manual-display entitlement is verified. That feed is not used by the backtesting/paper engine.
- The `noindex` public site remains link-accessible by anyone; to make it truly confidential, put Cloudflare Access on the *public* Worker too (changes the requirement).
- No financial-data licence is granted by being non-commercial or educational. Dataset-rights declarations are owner-provided and **not independently audited**.
- Never present in-sample backtesting success as independently validated positive alpha. The Strategy Studio has no automatic promotion to "validated".

See `docs/INTEGRATED_RELEASE_DEPLOYMENT.md` for the detailed deployment checklist and `docs/ARCHITECTURE_RELEASE_R05.md` for data flows and limitations.
