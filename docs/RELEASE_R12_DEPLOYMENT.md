# Alpha Covariance · R1.2 integrated research candidate

**Release state:** SOURCE CANDIDATE; NOT DEPLOYED. Built from the R0.5 integrated source and the configuration that was confirmed during deployment. Do not merge into `main` or replace production without smoke-testing. Never include `deployment-backups/`, private tokens, generated datasets or `.git` in a package.

## Implemented and locally tested

| Surface | R1.2 behavior |
|---|---|
| Strategy Studio | Persisted D1 revisions; direct **Run backtest** and **Create paper replay** links after saving a supported draft; relevant D1 job links and attributed reviewer notes display on strategy detail |
| Market directory | Dedicated `/markets.html` with 8 categories × 25 **reference instruments**. Live quotes only for three owner-licensed Coinbase instruments when explicitly enabled; any connected, authorized local historical dataset plots true OHLC with provenance. Unpriced instruments do not receive fabricated data. |
| Historical chart | Owner's registered historical CSV bars, rendered with provider + SHA-256 provenance from `/api/engine/datasets/{id}/bars`; browser may view last 180 bars, no interpolation. |
| Local backtest | Existing local `research_engine` job store persists full results, metrics, equity curves, virtual fills and its SQLite-WAL job queue across browser closes. Studio shortcuts select the strategy and a venue/dataset in the Lab, then submit through authenticated Worker proxy. |
| Paper replay | Existing virtual-wallet, stop/resume, automatic signals and virtual fill journal retained in local SQLite; new Start/Stop controls in market directory require an already created, persisted historical replay. Never touches a real broker. |
| Cloud run index | R1.2 Worker records linked local job/session IDs, dataset IDs and immutable strategy versions in D1; local SQLite remains the authoritative result/fill store. If D1 link write fails, do not misreport the engine job as missing; reconcile its local job record. |
| Expert review | Five inactive slots in D1, owner-only assignment with 1–168 hour expiry and revocation. Only **Cloudflare Access-authenticated** allowed emails with active D1 slot get read-only strategy access and can post attributed reviews. Owners get a new `/review.html` roster and feedback ledger. No local password tables. |
| Public site | `build.py` privacy copy includes reviewer records; public website remains separate and link-accessible with `noindex`. No DNS or Titan mail changes. |

## Deliberately NOT enabled by this source package

- **No 25 live quotes per market**: coverage requires a source with express viewing, storage, automated-research and redistribution rights as applicable. Listing 25 symbols is NOT 25 live observations. Yahoo/yfinance explicitly defers to Yahoo's terms and describes the Yahoo Finance API as intended for personal use only; do not feed a five-reviewer platform with it without appropriate permission.
- **No invented chart prices, trades, returns, market-hours guarantees, fill prices or performance claims**. Actual chart availability requires entitled Coinbase owner display or imported authorised OHLC.
- **No automatically connected local engine**: on Windows/WSL it requires a running Python API and worker daemon, secret and a tested private Cloudflare Tunnel. When PC is off, backtest/paper controls are not available.
- **No five manufactured email inboxes/passwords**. Five appointment slots are created, not Titan or Cloudflare identities. Actual mailbox ownership plus Cloudflare Access allowlisting are required. Never insert reusable plaintext passwords in D1.
- **No brokerage connectivity, real autonomous trading or validated alpha**, even though virtual stop/resume exists.

## Safe Windows upgrade sequence

1. **Back up** the known-good private Worker version `7e8586ae-b0df-46f4-b5e4-755bd08fd384`; preserve production secrets and the existing Cloudflare Access application. Export D1 data/backups as appropriate before migration. Do not touch public or mail DNS.
2. From the existing project repository on `release/r05-integration`, create a NEW feature branch: `git switch -c feature/r12-terminal-review`.
3. Extract only the **overlay** ZIP onto the repository root, not over `.git`. The overlay deliberately does **not** contain `wrangler.desk.jsonc`; keep its real custom route and D1 database ID `24bc70d9-ca0b-4dae-849e-7ad0bbd3ccff`.
4. Run checks:
   ```powershell
   python build.py
   node --test (Get-ChildItem .\tests\*.test.mjs | ForEach-Object FullName)
   python -m unittest discover -s tests_engine -q
   python -m research_engine check
   python scripts/audit_research_links.py
   git diff --check
   npx.cmd wrangler deploy --config .\wrangler.desk.jsonc --dry-run
   ```
5. Execute **only the new** D1 migration (the three R0.5 strategy tables must already exist):
   ```powershell
   npx.cmd wrangler d1 execute alpha-covariance-research --config .\wrangler.desk.jsonc --remote --file .\migrations\0002_review_and_run_links.sql
   npx.cmd wrangler d1 execute alpha-covariance-research --config .\wrangler.desk.jsonc --remote --command "SELECT slot,reviewer_email,expires_at FROM reviewer_slots ORDER BY slot;"
   ```
   Expect five rows, initially all emails `NULL`. Do not seed `@domain.con` or aliases that do not receive mail.
6. Only after tests, migration and the same-zone Access policy are verified, deploy the **private** Worker:
   ```powershell
   npx.cmd wrangler deploy --config .\wrangler.desk.jsonc
   npx.cmd wrangler deployments status --name alpha-covariance-desk
   ```
7. As the owner, check clean links to `/`, `/studio.html`, `/markets.html`, `/review.html`, `/laboratory.html`. Check `/api/whoami`, `/api/strategies`, `/api/reviewers`, `/api/runs`; one saved draft from R0.5 must still exist. Verify failed access to anonymous APIs and the `workers.dev` hostname.
8. **Reviewer enrollment**: first ensure each reviewer has an existing, functional email account. In Cloudflare Zero Trust → Access → Applications → desk, allow ONLY the five exact addresses, not an entire wildcard domain. Configure an OTP identity provider if needed. Then as owner open `/review.html`, assign each verified email to a slot and a short expiry, and confirm an individual reviewer can access Studio read-only, submit feedback, cannot edit strategies, cannot access market feeds or the engine, and loses access after revocation/expiry. An Access policy also has its own session duration and must be reviewed.
9. **Research engine**: start the local Python API and background worker per `docs/INTEGRATED_RELEASE_DEPLOYMENT.md`, connect via tested private Tunnel with `RESEARCH_ENGINE_ORIGIN` and `RESEARCH_ENGINE_TOKEN` Worker values. Never paste secrets in chat or Git. Only import datasets with rights to storage, algorithmic research and replay. Create a supported moving-average draft, choose an authorized venue/dataset, run a job, inspect strategy-linked metrics and start/stop a virtual historical session. Test persistence after browser refresh.
10. Rollback only the affected Cloudflare Worker on failure. Worker rollback does not undo D1 schema or SQLite data.

## Account slots prepared

| Slot | Suggested human label | Enabled at migration? |
|---|---|---|
| 01 | EXPERT-REVIEWER-01 | No; requires verified email |
| 02 | EXPERT-REVIEWER-02 | No; requires verified email |
| 03 | EXPERT-REVIEWER-03 | No; requires verified email |
| 04 | EXPERT-REVIEWER-04 | No; requires verified email |
| 05 | EXPERT-REVIEWER-05 | No; requires verified email |

No passwords are generated or stored. OTP codes are delivered by Cloudflare Access to the actual approved mailbox, not saved to the research database.

## Local validation evidence

- Node.js tests: **44/44** passed (R0.5 regression + review security + 200 reference instrument catalog).
- Python tests: **20/20** passed (existing engine + audited historical OHLC chart source).
- Static links: **229** site/Desk HTML references resolved, zero broken within source.
- Market and Review desktop layouts rendered to local screenshots for visual inspection.

These results are local checks only; Cloudflare production, third-party feeds, real review OTP, cross-domain Tunnel and external data licenses have NOT been verified for R1.2.
