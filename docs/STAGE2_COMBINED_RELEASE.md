> **Historical document:** This file describes an earlier stage. For the current consolidated source package and deployment order, follow `START_HERE.md` and `docs/INTEGRATED_RELEASE_DEPLOYMENT.md`. Do not treat this earlier feature-status table as current.

# Alpha Covariance — Combined Stage 1 repair + Stage 2 release

**Prepared:** 12 November 2026
**Release state:** Tested source package; **NOT deployed**.
**Audience:** Existing GitHub repository `virajdeokar-QS/alpha-covariance`; separate Cloudflare Workers `alpha-covariance` and `alpha-covariance-desk`.

## Release contents

- **Public (`site/`, `build.py`)**: directly accessible only by URL/link in the normal way, but *unlisted* from cooperative search engines through meta `noindex` on each page and `X-Robots-Tag` in `site/_headers`. Removes `sitemap.xml` and its robots.txt reference. There is **no root-domain login**: link-only is not confidentiality. The public website stays light/editorial, independent of the dark private research terminal. Includes an updated privacy explanation for the private Desk. No artificial market prices.
- **Private Desk (`desk/`)**: Cloudflare Access JWT signature verification, approved-owner market-feed API, accurate Coinbase Exchange/USD metadata, and repaired candle parsing (Coinbase reverse chronological seconds → ascending milliseconds; rejects malformed/stale bars; missing intervals are explicitly reported, never filled with imaginary data). Fixes `BTCUSD` initial state to `BTC-USD` and queues refreshes after in-flight instrument changes.
- **Stage 2 Studio (`desk/studio.html`, `desk/assets/studio.*`)**: real owner-only strategy drafting, revisions, archival reasons and audit log. D1 migration included. **No strategy execution, paper wallet, order placement, returns, backtest jobs, or claimed validated alpha.**
- **Data rights**: the Coinbase market APIs require *both* a verified owner identity (`FEED_OWNER_EMAIL`) and explicit `MARKET_DATA_OWNER_DISPLAY=enabled`; default is off. The flag does not establish legal permission—it must only be set after checking the owner's permitted viewing use. It does not enable ML/algorithm development, backtests, friend access or redistribution.
- **Private routing**: `wrangler.desk.jsonc` uses `html_handling: none`, `workers_dev: false`, and `assets.run_worker_first: true`. Preview hostnames and Cloudflare Access allowlist must also be independently checked.
- **Public/private fingerprints**: `X-AC-Surface: public-unlisted` is added through static `_headers`, and `X-AC-Surface: private-research-desk` by the private Worker; use the headers to detect routing mistakes.

## Important caveat — before deployment

The user's currently deployed Cloudflare Desk Worker reportedly contains a Coinbase hotfix that is **not in GitHub `main`**. The source in this release is based on the previously reviewed Stage 2 candidate and Stage 1 GitHub source, NOT an export of current Cloudflare production. **Back up and diff the LIVE Worker source/configuration, and preserve any valid uncommitted hotfixes.** Do not push this complete snapshot directly onto the production branch without a diff and review. The package preserves old source files as a cohesive repository snapshot; it is not a blind overwrite command.

## Apply and verify via the deployment/debugging chat

1. Save a snapshot of the production deployment ID and export the live private Worker code/config, route mapping, domain bindings, and Access policy. Do not share secrets in chat/GitHub.
2. In your local repo, `git status`, `git pull --ff-only`, then create `git switch -c feature/stage2-combined-unlisted`. Compare each file in the release against HEAD. Merge carefully; do not replace `main` or public Worker automatically.
3. Run tests from repo root with Node.js **22 or later**:
   ```sh
   python build.py
   node --test tests/desk.test.mjs tests/studio.test.mjs tests/public-unlisted.test.mjs
   node --check desk/worker/index.js
   node --check desk/assets/desk.js
   node --check desk/assets/studio.js
   ```
4. Inspect `_headers` on the **public** Worker: Cloudflare's static asset `_headers` apply only when serving static assets, not necessarily to a custom Worker-generated `Response`. If the public Worker bypasses this, put `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` directly on all public Worker-generated responses or use the appropriate Cloudflare response-header rule. Verify with actual production HTTP response headers, not source inspection alone.
5. Confirm all public HTML pages contain `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`. `robots.txt` intentionally **allows** crawling so indexing bots can read `noindex` (a blanket `Disallow: /` can prevent deindexing). No sitemap is advertised. An already-indexed page may take time to disappear; use Google Search Console Removals if needed. Non-compliant bots can ignore hints. If you require **confidentiality**, add Cloudflare Access to the public Worker too; this is **not** done in this release because direct links must remain openly accessible.
6. Keep approved-user Cloudflare Access on the private Desk **and check anonymous + unapproved requests to HTML, JS and APIs**. Test alternative `workers.dev` and preview URLs. Owner-only routes must deny friend accounts. Avoid browser-only checks; verify server response/status, not just hiding links.
7. Review Coinbase Market Data Terms (Aug. 7, 2026) for the owner's exact manual viewing use. If authorised, set `MARKET_DATA_OWNER_DISPLAY=enabled` in the **private** Worker environment. If unapproved or uncertain, leave disabled and see a truthful unavailable state. For ML, backtesting, multi-user charts or derived data, obtain separate appropriate licence or use another provider. Never set this on the public Worker.
8. Prepare Cloudflare D1 separately from existing public inquiry storage:
   ```sh
   npx wrangler d1 create ac-research
   ```
   Keep the real generated database UUID private in your deployment environment/config, then set the binding `RESEARCH_DB` on the private Worker with `database_name: ac-research` and `migrations_dir: migrations`. Review and apply:
   ```sh
   npx wrangler d1 migrations apply ac-research --remote --config wrangler.desk.jsonc
   ```
   Do **not** use a fictional UUID. Back up an existing D1 database before a migration.
9. After review and backup, deploy only `alpha-covariance-desk` using `npx wrangler deploy --config wrangler.desk.jsonc`. Publish the public site's generated changes separately through its existing verified workflow. Do not alter BigRock DNS, Titan MX/TXT or the custom domain Worker mapping.
10. Verify real candles manually for BTC-USD/ETH-USD/SOL-USD, 1m/5m/15m/1h; source/currency accuracy, latest bar, sparse/gap handling, chart visibility, and no old Binance/USDT references. The chart is a **REST-polled** display (not tick streaming). Historical Coinbase candles should not be excessively polled; adapt frequency/provider as needed.
11. With D1 bound, register a **research specification only**, reload to ensure persistence, edit to V2, verify V1 immutability and audit events, archive with a reason. Zero real trades and zero validated models must remain honest.
12. Confirm public domain is unlisted (verify `X-Robots-Tag`), direct links load, private studio login still works, public/private CSS and routing differ, Titan mail receives/replies, and rollback is available. Merge Stage 2 PR only after smoke tests pass.

## Commands to inspect deployment without credentials

```sh
curl -I https://alphacovariance.com/
curl -I https://alphacovariance.com/research/
curl -I https://desk.alphacovariance.com/studio.html
```

Expected: root public response includes `X-Robots-Tag: noindex...`, ideally `X-AC-Surface: public-unlisted`; private anonymous request cannot fetch private content. A redirect to Cloudflare Access login is acceptable. **These commands alone do not verify all security controls.**

## Legal/compliance boundaries

- Educational/non-commercial use is **not** an automatic exemption from market-data licences, IP/copyright, privacy or applicable securities regulations.
- No real broker, customer funds, personalised investment recommendation, paid signals, external market-data display, trading agents or automated Coinbase-derived backtesting is authorised by this release.
- Keep `config/market_data_rights.json` and `docs/LEGAL_COMPLIANCE_REGISTER.md` updated per provider and per feature.
- For Indian securities educational data sharing/usage, review the **May 8, 2026 SEBI circular (effective July 1, 2026)**, which specifies a **30-day delay** in the described arrangements, subject to conditions; obtain a permitted source and do not assume delayed data is automatically free to use.
- When another exchange or dataset is enabled, verify internal/non-display use, storage, derived use, display to authorised accounts, algorithm/AI uses and geographical restrictions separately.
- Expert Review Programme remains deferred until the core platform is complete.

## Rollback

Keep known-good private and public Worker deployment IDs. On unexpected regression, roll back only the affected Worker in Cloudflare. D1 migrations are append-only and should not be blindly reversed. **Never copy any tokens, Cloudflare keys, email OTPs or service secrets into the public GitHub repo.**
