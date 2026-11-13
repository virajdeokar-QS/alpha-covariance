# Alpha Covariance — Controlled single-release deployment handover (R0.5)

**Date:** 12 November 2026. **Prepared source code is NOT deployed.**
**Release goal:** Stage 1 corrections + Stage 2 Strategy Studio + initial Stage 3–5 research/paper capabilities in one reviewable integration release, without a production hotfix being overwritten or an unlicensed feed being used for algorithms.

This runbook is for the separate **Deployment & Debugging** conversation. It should be followed in this order; **do not skip gates because the deadline is today**. No credentials, DNS nameserver changes, public website login changes, or paid infrastructure are required by the source package itself.

## 0. Preserve working production configuration (critical)

1. Record Cloudflare's current deployment IDs and custom domain routes separately for `alpha-covariance` (public) and `alpha-covariance-desk` (private).
2. Export current **live Worker code** of `alpha-covariance-desk`; it reportedly contains direct Coinbase hotfixes missing from GitHub. Also export the effective `html_handling=none`, Access settings, Worker secrets **names** (not values), bindings, and preview hostname state.
3. In local Git repository, verify the working tree, fetch current `main`, and create a branch:
   ```powershell
   git status
   git fetch origin
   git switch main
   git pull --ff-only origin main
   git switch -c feature/research-release-r05
   ```
4. Only after backup and diff, **copy package contents into this branch**, excluding `.git` and `runtime/` files. Compare Stage 1 local+production hotfixes, reconcile manual changes. Do not copy `.env`, secrets or historical datasets to GitHub.
5. Run all local checks. If anything fails, **hold deployment**.

## 1. Required local testing

From repository root in a shell with Python 3.11+ and Node.js 22+:

```sh
python build.py
node --test tests/*.test.mjs
python -m unittest discover -s tests_engine -v
python -m research_engine check
node --check desk/assets/desk.js
node --check desk/assets/studio.js
node --check desk/assets/laboratory.js
node --check desk/worker/index.js
# Optional local C++ order-book benchmark (data file not included)
g++ -std=c++20 -O3 -Wall -Wextra benchmarks/orderbook_replay.cpp -o orderbook-replay
```

Never interpret synthetic `tests_engine` fixture data as a production/live market feed. Test setup uses synthetic fixture histories only in isolated unit tests.

## 2. Apply Stage 2 D1 research registry first (cloud only)

- Identify whether `ac-research` D1 already exists; do not create a duplicate. Back up existing data before migration.
- If not yet present: `npx wrangler d1 create ac-research` and save the **real** database ID from the Cloudflare output. The package intentionally includes no fabricated UUID.
- Add `d1_databases` to `wrangler.desk.jsonc`, for example:
  ```jsonc
  "d1_databases": [{
    "binding": "RESEARCH_DB",
    "database_name": "ac-research",
    "database_id": "PASTE_REAL_UUID_FROM_CLOUDFLARE",
    "migrations_dir": "migrations"
  }]
  ```
- Apply `migrations/0001_strategy_registry.sql` with the migration workflow. If an initial migration was previously applied, inspect existing table and migration state before running it again. The SQL has `IF NOT EXISTS` but schema differences must still be reviewed.
- All strategy records stay in D1; owner-only API access remains enforced in Worker.

## 3. Prepare the local research engine (Windows WSL2, free storage)

From WSL Ubuntu in repo root:

```bash
python3 --version
# In this release, the engine has no third-party Python package dependency.
python3 -m unittest discover -s tests_engine -v
mkdir -p "$HOME/alpha-covariance-private-data"
chmod 700 "$HOME/alpha-covariance-private-data"
python3 -c 'import secrets;print(secrets.token_urlsafe(48))'
```

The last command prints a **new strong random secret**. Store it **privately** on the owner's machine in an environment-variable manager or a `chmod 600` local secrets file **outside Git**. Do **not** copy it into the deployment chat, screenshots, GitHub, README or a public file.

In **two different WSL terminals** set the same environment variable and data path:

```bash
export AC_ENGINE_HOME="$HOME/alpha-covariance-private-data"
export ENGINE_SHARED_SECRET="<load from private secret manager>"
# Terminal A:
python3 -m research_engine api
# Terminal B:
python3 -m research_engine worker
```

The API binds **127.0.0.1:8790** only. The daemon polls queued jobs and advances historical paper sessions independently of any browser. Stop/restart persists data in SQLite WAL. Use your own supervisor/systemd to restart the daemon after PC reboot; this package does not configure permanent 24×7 hosting. Back up `AC_ENGINE_HOME` securely. **When the PC or WSL is off, the engine is offline.**

Before adding a cloud route, test the private origin with a locally supplied secret and ensure unauthenticated requests are rejected:

```bash
curl -i http://127.0.0.1:8790/api/engine/status
# Expected: 403 for missing X-Alpha-Engine-Token
```

## 4. Bridge Cloudflare Desk to the local engine (optional; must be tested)

- Configure a Cloudflare Tunnel published hostname `engine.alphacovariance.com` routing to the server accessible from the `cloudflared` process as `http://127.0.0.1:8790`. **Run cloudflared in the same network namespace as your localhost service, or verify the Windows/WSL forwarding explicitly.**
- Do not expose an arbitrary local port in the router/firewall. Do not create a public DNS A record to your private PC. Keep Tunnel token private.
- Set the private Desk Worker's environment variable (not browser JS): `RESEARCH_ENGINE_ORIGIN=https://engine.alphacovariance.com`.
- Store the identical strong service-to-service secret as a **Cloudflare Worker secret**: `RESEARCH_ENGINE_TOKEN` (matches local `ENGINE_SHARED_SECRET`). Use `npx wrangler secret put RESEARCH_ENGINE_TOKEN --config wrangler.desk.jsonc` or secure dashboard settings. Never commit it.
- The Desk Worker validates the human Access JWT and owner role before forwarding `/api/engine/*`; it strips user-provided upstream auth and inserts the secret. The engine still denies every request lacking the correct backend token. The browser is never given the backend token.
- **Test Cloudflare Worker → Tunnel routing in this zone:** same-zone subrequest/routing or Access-policy configuration may prevent this route from working. A local mock test is not proof of live connectivity. If it fails, keep this module OFF and debug before release. Do not work around a tunnel failure by opening an unprotected service.
- Add Cloudflare Access service-token protection for `engine` and rate limits if feasible; the internal shared secret remains required. No public CORS wildcard.
- If no Tunnel is configured, the public/private pages still deploy; the local Backtest/Paper UI will show a truthful `ENGINE_NOT_CONFIGURED` / unavailable state.

## 5. Private Worker deployment (keep Access and identity intact)

The file `wrangler.desk.jsonc` intentionally declares:

```json
"workers_dev": false,
"assets": { "directory": "./desk", "binding": "ASSETS", "run_worker_first": true, "html_handling": "none" }
```

Do not accidentally reintroduce redirect loops from `html_handling: auto-trailing-slash`. In Cloudflare, confirm `desk.alphacovariance.com` points to **alpha-covariance-desk**, not the public Worker. Confirm Access JWT team domain, audience, approved-email allowlist and owner email secret are still correct. Do not print their values in logs.

Only after all checks, deploy the Desk Worker separately from the public Worker:

```sh
npx wrangler deploy --config wrangler.desk.jsonc
```

If a strict owner Coinbase manual-view permission was already verified, `MARKET_DATA_OWNER_DISPLAY=enabled` may be set explicitly; otherwise **leave it disabled**. Never use Coinbase endpoint responses in this local backtester; the data may not be licensed for that algorithmic use. No multi-user Coinbase quotes/candles are provided.

## 6. Public website: unlisted, NOT confidential

Regenerate `site/` using `python build.py` and deploy through the **existing public Worker workflow**. The build emits `noindex` HTML meta tags and `site/_headers` requests `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`; sitemap is absent. `robots.txt` must allow crawlers to inspect `noindex`. If the public application uses custom Worker responses that bypass static `_headers`, add a Worker or Cloudflare response-header rule and **check the actual HTTP response**.

- `https://alphacovariance.com` remains accessible to *anyone who has the URL*. It is not password protected, and unlisted is not a security boundary.
- Previously indexed pages may remain in third-party indexes until recrawled/removed. Search engines can ignore noindex.
- For truly private access, protect `alphacovariance.com` with Cloudflare Access as a **separate deliberate change**, which prevents direct unauthenticated link viewing. Do not silently make that change during this release.
- Do **not** modify Titan MX, SPF, DKIM, BigRock domain registration, or DNS nameservers for this release.

## 7. Post-deploy smoke tests; do not claim success until observed

1. Open `alphacovariance.com` directly and check it serves public editorial site, not Desk. Check its root and subpage `X-Robots-Tag` with `curl -I`.
2. Open `desk.alphacovariance.com`, sign in as approved owner; verify it serves the dark Desk, not the public site. Open `/studio.html` and `/laboratory.html`.
3. Check **anonymous, unapproved user and worker/preview** calls to HTML, CSS/JS and all APIs do not expose protected content.
4. Confirm `GET /api/whoami` owner identity. Verify researcher/non-owner gets 403 for `/api/strategies`, `/api/markets`, `/api/candles`, `/api/engine/status`.
5. Check D1 strategy: create draft, revise V2, archive, refresh and verify persistent audit events. Zero validated-alpha counts unless independently validated.
6. Check Coinbase owner-only viewing rights and data feed flag. If enabled, chart `BTC-USD`, `ETH-USD`, `SOL-USD`: verify chronological OHLC, source timestamps, gaps and USD labels. If disabled, chart must show genuinely unavailable, not mock values.
7. In the Lab, verify engine status; if Tunnel is configured, import only **authorised historical** CSV, confirm SHA-256, instrument and interval. Do not test with Coinbase raw data unless you have confirmed its algorithmic use rights.
8. Test a moving-average strategy in D1 with parameters `{"fast":5,"slow":15}`, data explicitly entitled for backtesting. Run a background job; close browser; re-open; verify completed status and report. The label must remain `IN_SAMPLE_EXPLORATORY_ONLY`.
9. Start a historical paper session: it should first show STOPPED. Manually resume, place BUY/SELL, observe virtual fills and origin. STOP and verify no more bars advance until RESUME. Check realised/unrealised P&L and proper quote currency.
10. Compare risk/portfolio analytics against known licensed data; do not conflate in-sample covariance with future forecasts.
11. Validate public site email and existing visitor inquiry route separately; they are independent of the research engine.
12. Record results/screenshots and known-good private/public Worker deployments. Do not merge into `main` unless no regression remains.

## Rollback

- Cloudflare: roll back **only the affected Worker** to recorded prior deployment; D1 schema migrations are not automatically rolled back, so back up the database.
- Engine: stop the headless daemon, preserve `AC_ENGINE_HOME`, and restore the prior engine source if a regression occurs. Existing historical research SQLite remains independent of Cloudflare deployment.
- Use separate feature branch/PR for review. Do not overwrite the old public site or the private Worker before preserving live edits.

## Non-negotiable legal and product conditions

This is an **independent, non-commercial educational platform**, not an advisory, regulated investment service or broker. Educational status does not waive market-data licensing, privacy, copyright or relevant securities rules. User-entered data rights are **self-attested**, not verified by software. Consult the provider's terms (including non-display, algorithm development, derived work and retention permissions) and a qualified Indian securities lawyer where appropriate before external access/commercial deployment. The Expert Review Programme is intentionally deferred until the core system and access rights are demonstrably ready. There are no customer wallets, live execution keys, crypto exchange brokerage connections or institutional trading-latency claims in the package.
