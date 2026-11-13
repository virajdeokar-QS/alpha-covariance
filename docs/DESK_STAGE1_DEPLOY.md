> **Historical document:** This file describes an earlier stage. For the current consolidated source package and deployment order, follow `START_HERE.md` and `docs/INTEGRATED_RELEASE_DEPLOYMENT.md`. Do not treat this earlier feature-status table as current.

> ARCHIVED: Stage 1 instructions are preserved for history. **Do not follow them for the current release.** Use `docs/STAGE2_COMBINED_RELEASE.md`; the original Stage 1 Binance feed is superseded.

# Alpha Covariance · Stage 1 private Desk deployment

**Goal:** keep `https://alphacovariance.com` public and deploy `https://desk.alphacovariance.com` as an invite-only, read-only market monitoring workspace.

**Release status:** source implemented and locally tested. This deployment is NOT yet active until the steps below are completed in YOUR Cloudflare account. Access must be configured before inviting friends.

## A. Safety first

- The `alpha-covariance` production Worker currently serves your public site. **Do not replace it with the Desk.**
- This release intentionally adds a *second* Worker called `alpha-covariance-desk`.
- No passwords, exchange keys, broker credentials or fake market data belong in GitHub.
- `desk/worker/index.js` validates Cloudflare Access signed JWTs before serving **any** private page, JS, CSS or API response. Missing configuration returns 403.
- `workers_dev: false` in `wrangler.desk.jsonc` disables the alternate `.workers.dev` address. The Worker also only accepts `desk.alphacovariance.com` as the Host.
- The public `/access/` page is merely an entrance to the Cloudflare Access flow; it does not authenticate anyone itself.

## B. Upload repository files

Extract this update over your **existing local** `alpha-covariance-site` Git working tree (keep your `.git` folder and any existing changes). Do not run `git init` again.

The incremental ZIP adds `wrangler.desk.jsonc`, `desk/**`, `docs/DESK_STAGE1_DEPLOY.md`, `docs/DESK_ROADMAP.md`, `docs/STRATEGY_RESEARCH_CONTRACT.md`, `tests/**`, and `scripts/**`. It **does not overwrite** your existing `build.py` or README. Run the provided patch generator before committing.

In PowerShell, inside the existing local repository, commit the **private app source first**, without changing the public home navigation yet:

```powershell
git status
git add .
git commit -m "Add isolated private desk source"
git push origin main
```

Do **not** run `scripts/apply_stage1_public.py` until your private Access login works, otherwise public visitors will see a research-access link before the Desk is ready. Do not run `git init` again or use force push.

## C. Create Cloudflare Access login (approved emails only)

1. Cloudflare Dashboard → **Zero Trust**. If needed create a Zero Trust organisation, selecting the **Free** tier (currently supports up to 50 users; onboarding may ask for payment details — check before confirming).
2. Zero Trust → **Integrations → Identity providers**. Add **One-time PIN** if not already available. This avoids implementing or storing passwords ourselves.
3. Zero Trust → **Access controls → Applications → Create new application** → **Self-hosted / public hostname**.
4. Application name: `Alpha Covariance — Research Desk`.
5. Hostname: `desk.alphacovariance.com` (full hostname, no wildcard, no path).
6. Create policy with Action **Allow**, Include rule **Emails** → enter *only* your own intended email address(es) and explicitly invited friends' addresses. **Do not use** “Everyone”, “All emails ending in a public domain”, or broad email-domain rules. Do not create a Bypass policy.
7. Choose **One-time PIN** for allowed users, and a session duration such as 8 hours. Save.
8. Record the Access **Application Audience (AUD) Tag** from the app's details, and your team domain `https://YOUR-TEAM.cloudflareaccess.com`. These are configuration values, not API passwords. **Do not post them in public issue threads.**

When a visitor types an approved email, Cloudflare emails a short-lived one-time code. There is no public registration flow.

## D. Deploy the separate Worker from Windows

From PowerShell in your existing project folder (requires Node.js and npm):

```powershell
npx wrangler login
npx wrangler deploy --config wrangler.desk.jsonc
```

It will create **alpha-covariance-desk** as a second Worker, not replace `alpha-covariance`.

Configure the two required Worker secrets with your **exact** team domain and AUD tag:

```powershell
npx wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.desk.jsonc
# paste https://YOUR-TEAM.cloudflareaccess.com when prompted
npx wrangler secret put ACCESS_AUD --config wrangler.desk.jsonc
# paste your Access Application Audience (AUD) Tag when prompted
```

Check `Workers & Pages → alpha-covariance-desk → Settings → Domains & Routes` and confirm `workers.dev` is **disabled**.

Add **Custom Domain → desk.alphacovariance.com** to the **Desk** Worker. Do NOT attach it to your existing public `alpha-covariance` Worker. Wait for the TLS certificate to activate.

**Important:** The custom domain must also be covered by your Cloudflare Access application policy. The Worker requires a valid signed Access application JWT with the correct team issuer and AUD tag in addition to that policy.

## E. Verification checklist — required before announcing the Desk

1. In a private/incognito browser, open `https://desk.alphacovariance.com/`. You must be prompted for Cloudflare Access identity verification rather than seeing the dashboard immediately.
2. Try an **unapproved** email in an incognito session: no usable session should be issued.
3. Complete the sign-in with an **approved** email: the Desk should load.
4. In the same authenticated browser, visit `/api/whoami` and verify that it returns your approved email.
5. In an incognito **unauthenticated** session, request `/api/markets`, `/assets/desk.js`, and `/index.html`: no private content should be returned. Cloudflare may show an Access login or a 403.
6. `https://alpha-covariance-desk.<your-account>.workers.dev/` must **not** serve the Desk; it is disabled.
7. Inspect the browser console. If Binance market data is inaccessible, the quotes and candlestick panel must clearly say **unavailable**, not draw data from another provider without attribution.
8. Open `https://alphacovariance.com/` and confirm the public site still works. Also check your Titan emails are unaffected (no MX/SPF/DKIM DNS changes are required to add this subdomain).
9. Confirm the responsive sidebar and menus on mobile. Confirm **strategy counts remain zero**.

If authentication returns 403 for an approved user, check that **ACCESS_TEAM_DOMAIN** includes `https://` and matches the team domain exactly; check **ACCESS_AUD** matches the correct application, and that the user is actually being allowed by Access.

## F. Publish the public entrance only after login passes

After you verify the Access policy, private Worker and market feed handling, return to your local repository and run:

```powershell
python scripts/apply_stage1_public.py
node --test tests/desk.test.mjs
git status
git add .
git commit -m "Add Research Access entrance to public site"
git push origin main
```

This script updates the existing `build.py` generator without replacing your README or unrelated files, creates `/access/`, and adds the public **Research access** link. Re-running it is idempotent. Check `https://alphacovariance.com/access/` after the GitHub deployment completes.

## G. Live-data scope

The first live feed uses **Binance public Spot endpoints** for BTC/USDT, ETH/USDT, SOL/USDT and BNB/USDT. Server-side Worker endpoints are `/api/markets` and `/api/candles` and accept only allowlisted symbols/intervals. The chart polls fresh OHLC values approximately every six seconds **while visible** and does not retain stale bars after request failure. This is a *near-real-time web monitor*, **not low-latency/HFT market connectivity**. Provider geography/availability and data licensing apply.

NYSE/NASDAQ and NSE windows on the overview page are **indicative weekday regular-session windows only**. Exchange holidays and halts are not yet integrated. No equity or FX price feed is connected, so no prices or candles are displayed for those markets.

**This stage DOES NOT** store price history, execute orders, run backtests, show news, collect private user research or maintain a strategy database. Later stages add these services with persisted events, audit trails, tested risk controls, proper provider agreements and a database.

## H. Frequent problems

- **Blank prices / error 502**: upstream Binance may be blocked, temporarily unavailable or rate-limited. Check authenticated `/api/markets`. The UI intentionally shows unavailable instead of samples.
- **A 403 on every request**: missing Access secrets, incorrect JWT audience, or Access policy did not grant a session.
- **You see the private homepage without logging in**: stop sharing the URL, inspect the Access hostname policy immediately, and ensure you are not testing with a previously authenticated session. The Worker still validates signed tokens.
- **Public website changed unexpectedly**: you may have deployed the private configuration to the wrong Worker. Confirm `--config wrangler.desk.jsonc` in deployment commands.
- **No historical candles**: endpoint may be blocked where the Worker runs; a second compliant feed is a follow-on task, not an excuse to fabricate bars.

References:
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md
