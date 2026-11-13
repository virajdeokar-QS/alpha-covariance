Alpha Covariance Stage 1 — owner-only real Coinbase spot-data patch, Nov 11 2026

Updates only:
 desk/worker/index.js
 desk/assets/desk.js
 desk/index.html
 tests/desk.test.mjs

Protects private Access JWTs, and restricts market-data API to an exact owner email defined
by the FEED_OWNER_EMAIL Worker secret. A different approved Desk user can open the UI
but cannot access Coinbase market data. This avoids unauthorized redistribution.
Coinbase data use remains subject to its current market data terms.

No source files of the public website, build.py, Cloudflare DNS, Titan mail, or wrangler config
are changed by this patch. BNB was removed because its Coinbase USD market is not verified.
BTC/USD, ETH/USD, and SOL/USD are attempted with Coinbase Exchange attribution.
24-hour percent change is displayed as N/A (not fabricated). Candle timestamps are sorted,
validated and checked for freshness. The owner should check live responses after deployment.

PowerShell from existing alpha-covariance-site folder:
  Expand-Archive -Path '.\ac-owner-feed-patch.zip' -DestinationPath . -Force
  node --test tests/desk.test.mjs
  npx.cmd wrangler secret put FEED_OWNER_EMAIL --config wrangler.desk.jsonc
    Enter the SAME email address approved in Cloudflare Access.
  npx.cmd wrangler deploy --config wrangler.desk.jsonc

DO NOT push to Github until live verification; inspect git diff first.
Only the verified owner can retrieve the market feed. Do not invite friends to use
Coinbase data without appropriate permission.
