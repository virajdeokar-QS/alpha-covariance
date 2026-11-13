> NOTE: This guide accompanies the Stage 2 candidate; for the complete bundle including public unlisted mode, read `docs/STAGE2_COMBINED_RELEASE.md` first.

# Alpha Covariance · Stage 2 candidate — review and deployment runbook

**State:** Candidate source, locally tested. NOT deployed or production-verified.
**Domain:** desk.alphacovariance.com (private) · alphacovariance.com (public, unlisted in combined release)
**Owner:** research operator. **Do not merge into `main` until signed off in deployment chat.**

## Why a combined Stage 1 repair + Stage 2 release

GitHub `main` at `a3cb7b4ed137902da286011f7d809dc5b3b4ab63` contains the original Binance REST service and Binance/USDT frontend. A subsequent owner-only Coinbase patch was deployed directly to Cloudflare, according to the 2026-11-11 deployment handover, **but was not committed to GitHub**. Deploying `main` unmodified risks reverting to Binance 403 and mismatched chart validation. This release replaces the source contract with internally consistent Coinbase Exchange/USD quote and candle objects.

**Critical:** The actual Cloudflare hotfix source cannot be reconstructed from GitHub. Export/back up the CURRENT production Worker and its config and compare to this candidate before deployment. Review/merge any legitimate local fixes (including `html_handling: none`, FEED_OWNER_EMAIL). Never copy secrets into Git.

## Included

- New `desk/studio.html`, `desk/assets/studio.css`, `desk/assets/studio.js`: independent private Strategy Research Studio UI (desktop/tablet/mobile).
- `migrations/0001_strategy_registry.sql`: D1 tables for strategy drafts, immutable revisions, append-only audit events.
- Worker GET/list/create/revise/archive endpoints (`/api/strategies`); checks a verified Cloudflare Access JWT and owner email for **all** metadata operations.
- Owner-restricted Coinbase ticker and OHLC API. No Binance fallback, no fictitious candle filling, no fabricated 24-hour change.
- Symbol and provider labels updated consistently (`BTC-USD`, `ETH-USD`, `SOL-USD`; USD; Coinbase Exchange).
- UTC timestamps are normalized, OHLC validity checked, newest data freshness enforced; candles are explicitly REST **polled** every ~30s, not described as exchange tick streaming.
- Fail-closed when D1 binding, identity or market feed is unavailable. Provider terms require access restrictions until reviewed.
- `x-ac-surface: private-research-desk` header to help identify incorrect Cloudflare route mappings.

## Excluded / intentionally NOT represented as functional

No Python strategy execution, backtest job orchestration, paper orders, fills, autonomous trading, wallet, latency benchmarks, positive alpha, multi-venue equity/FX data or attributable news feed. These must come from verified independent services and legitimate entitlements in later stages. The registry cannot promote a draft to `validated` without evidence. Expert Reviewer Programme remains deferred until later.

## Required before private production rollout

1. Preserve a copy of the CURRENT deployed Desk Worker source and custom-domain/Access configuration (live Coinbase hotfix not in GitHub).
2. Verify Cloudflare Access currently protects `desk.alphacovariance.com/*` and excludes anonymous private assets and API. Confirm `workers.dev` and preview hostnames are disabled.
3. Review Coinbase Exchange market-data usage rights for the intended user population. Until clarified, retain `FEED_OWNER_EMAIL` server enforcement and do not share or cache data for invited friends.
4. Configure `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `FEED_OWNER_EMAIL` as Worker secrets. The owner-only Coinbase market feed also requires `MARKET_DATA_OWNER_DISPLAY=enabled` **only after confirming viewing rights**; without it, the feed is deliberately blocked. **Do not add real secret values to source.**
5. Create Cloudflare D1 DB `ac-research` (or other verified name):

   ```bash
   npx wrangler d1 create ac-research
   ```

   Record the returned UUID. Add a binding in `wrangler.desk.jsonc` without removing `assets` or changing host routing:

   ```json
   "d1_databases": [{
     "binding": "RESEARCH_DB",
     "database_name": "ac-research",
     "database_id": "<actual UUID from Cloudflare>",
     "migrations_dir": "migrations"
   }]
   ```

   The placeholder is NOT deployable. Avoid a public dummy database ID.

6. Apply schema remotely (after reviewing the SQL), from the repository root:

   ```bash
   npx wrangler d1 migrations apply ac-research --remote --config wrangler.desk.jsonc
   ```

7. Run local tests (`Node >=22` is required for the SQLite integration test):

   ```bash
   node --test tests/desk.test.mjs tests/studio.test.mjs
   ```

8. Confirm `wrangler.desk.jsonc` retains `workers_dev: false`, `run_worker_first: true`, `html_handling: none`. Preview is disabled in production through the previously configured Cloudflare settings. Ensure the deployed `alpha-covariance-desk` is the same Worker linked to the custom domain.
9. Deploy with `npx wrangler deploy --config wrangler.desk.jsonc` **only after** reviewing the expected diff and taking a rollback point. Do NOT deploy the public Worker or change BigRock/Titan MX/TXT records.

## Smoke checks — run with an approved OWNER browser session

- `GET /api/whoami`: `role:"owner"` and expected email.
- `GET /api/status`: `source:"Coinbase Exchange"`, `storage_configured:true`, execution disabled.
- `GET /api/markets`: three supported USD products, positive prices, provider timestamps, no synthetic or stale values.
- `GET /api/candles?symbol=BTC-USD&interval=1m`: source Coinbase Exchange, strictly increasing Unix **milliseconds**, valid OHLC, missing-interval count, newest candle genuinely fresh.
- Desk chart visibly renders bars. Check console/network errors and actual last candle time, especially after changing interval or instrument.
- The UI displays Coinbase Exchange / USD everywhere, including instrument selectors, footer and source metadata. `grep` for stale Binance/USDT references.
- `GET /api/strategies`: `[]` on a new D1 database, not a fabricated test registry.
- Create a clearly named INTERNAL RESEARCH DRAFT only when ready; reload browser; verify persistence, edit produces V2 without overwriting V1, archive requires reason and records audit.
- Anonymous requests and unapproved identity return a 403 or Access denial for HTML/assets/APIs; `workers.dev` and preview hostnames return no data.
- The `/studio.html` page has a distinctly PRIVATE research interface; public homepage remains its independent editorial experience.
- Public `/` and `/lab/`, public inquiries, DNS, and Titan send/receive remain unaffected.
- Run `curl -I https://desk.alphacovariance.com/studio.html` after owner session via browser-devtools (without credentials it should deny or redirect). Look for `x-ac-surface: private-research-desk` on authenticated responses.

## Rollback and change management

- Do not merge into `main` or change production routes until tests pass.
- Back up current Worker source and document its current deployment ID before deploying candidate.
- If market endpoints regress, roll back the private Worker deployment in Cloudflare, not the public Worker. Keep D1 migration (non-destructive); never blindly drop tables.
- Keep all source in GitHub after verification so production never depends on uncommitted dashboard edits.
- Avoid putting `FEED_OWNER_EMAIL`, API secrets, Access audience, or CF account IDs into PR comments or logs. Env variable names alone are fine.

**Distinct project tracks:** This conversation owns code and system design; deployment/debugging chat owns Cloudflare configuration, migrations and production validation.
