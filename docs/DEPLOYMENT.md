# Go live: Alpha Covariance on Cloudflare Pages

A GitHub + Cloudflare Pages deployment is recommended. The site has **no npm dependency**, no build service requirement and no hosting bill required for a basic static launch (subject to provider free-plan limits). BigRock stays your domain registrar.

## 1. Preview locally

Unzip the project. From the project root:

```sh
python build.py
cd site
python -m http.server 8080
```

Open `http://localhost:8080`. The contact form is deliberately not enabled yet; the direct email link works through the visitor's email client. Interactive covariance controls work locally in the browser.

## 2. Publish source on GitHub

Create a GitHub repo, recommended name `website` under your Alpha Covariance organisation (or your personal account temporarily). Upload **everything**, including `site/` and `functions/`.

```sh
git init
# Adjust the remote to match your actual repo:
git remote add origin https://github.com/YOUR-ORG/website.git
git add .
git commit -m "Launch Alpha Covariance research website"
git branch -M main
git push -u origin main
```

Do not commit email passwords, API keys, Turnstile secret keys, or BigRock credentials.

## 3. Deploy with Cloudflare Pages

1. Sign in at `dash.cloudflare.com`.
2. Open **Workers & Pages** → **Create** → **Pages** → connect GitHub repository (UI labels may vary).
3. Select `website`, production branch `main`.
4. Framework preset: **None**.
5. Build command: `exit 0` (or blank if accepted).
6. Build output directory: `site`.
7. Save and deploy. Test your unique `PROJECT.pages.dev` address. Every push to `main` will deploy a new version.

**Why not Astro immediately?** This launch-ready build is dependency-free and verifies in a browser today. Its editorial design tokens, routes and content structure are portable to Astro or another framework when a publication build pipeline becomes justified.

## 4. Connect your BigRock domain without breaking Titan email

**First, connect `www.alphacovariance.com` without switching nameservers:**

1. In your Pages project, open **Custom domains** and add `www.alphacovariance.com`.
2. In BigRock's DNS management (not web-hosting settings), create a **CNAME** record: host `www`, value `PROJECT.pages.dev` (replace with your real Pages project domain; don't include `https://`). If an existing `www` record conflicts, review and replace it rather than creating duplicates.
3. Allow DNS/certificate propagation and test `https://www.alphacovariance.com`.

**To also serve `https://alphacovariance.com` without `www`:** Cloudflare Pages requires the apex domain to be on Cloudflare nameservers. Add `alphacovariance.com` to Cloudflare DNS, carefully copy/check all existing BigRock DNS records first (especially Titan **MX**, **SPF**, **DKIM**, verification TXT and any DMARC records), then update nameservers at BigRock to those shown by Cloudflare. Once Cloudflare DNS is active, add `alphacovariance.com` as a custom domain in Pages. Configure a canonical redirect if desired.

**Critical:** Before any nameserver change, export/screenshot the entire BigRock DNS zone, compare each email-related DNS record in Cloudflare, and confirm both `research@` and `viraj@` still send/receive after the change. Domain Protect+ does not substitute for checking DNS records. If you're uncertain, leave nameservers at BigRock and launch on `www` first.

## 5. Enable the secure visitor inquiry form (optional but ready)

The source already contains a Cloudflare Pages Function and private D1 SQL schema. At initial launch the form is *visibly disabled*, and visitors can email directly. Enable only after all steps are complete:

1. Cloudflare dashboard → **D1** → create database `alpha-inquiries`.
2. Open its SQL console and run the statements in `db/001_create_inquiries.sql`. Verify the `inquiries` table exists.
3. Pages project → **Settings** → **Bindings** → add **D1** database binding. **Variable name must be `INQUIRIES_DB`**, select `alpha-inquiries`.
4. Cloudflare dashboard → **Turnstile** → add a widget for your verified hostnames (`www.alphacovariance.com` and/or `alphacovariance.com`; include the `pages.dev` hostname only if testing there).
5. Copy the **public site key** into `site/assets/config.js` as `turnstileSiteKey`. Never put the private secret there.
6. Pages project → **Settings** → **Variables and Secrets**: add an encrypted secret variable **`TURNSTILE_SECRET_KEY`** with the Turnstile secret key.
7. Redeploy after adding bindings and secret. Test submissions on the same hostname configured in Turnstile. Server-side verification is mandatory.
8. Confirm records are saved in D1 SQL console by running `SELECT id,name,email,topic,created_at,status FROM inquiries ORDER BY created_at DESC LIMIT 20;` (admin-only).

**Important:** This form stores inquiries privately; it does **not** send email alerts or offer a CRM. To respond, review D1 via the Cloudflare dashboard and email the sender from Titan. Add controlled alerts or an admin dashboard later. Consider retention/deletion policies and additional abuse controls before promoting the form widely.

### Form troubleshooting

- **Form disabled:** public site key is missing in `site/assets/config.js`.
- **503 / unavailable:** D1 binding or `TURNSTILE_SECRET_KEY` isn't configured, SQL table missing, or the provider is unavailable.
- **403 security challenge:** Turnstile secret/site key mismatch or hostname mismatch.
- **Local http.server:** the HTML and lab work; it cannot run the Cloudflare server function. Use a Cloudflare Pages deployment to test actual inquiry storage.

## 6. Post-launch checks

- Visit home, research, systems, lab, notes, about, contact, privacy, and a random missing URL on desktop and mobile.
- Check HTTPS and canonical domain; confirm 404 handling and all internal navigation.
- Submit a test inquiry only after enabling the form; verify it is in D1 and then delete the test row.
- Send and receive test messages on both Titan inboxes; check email DNS is healthy.
- Remove placeholders and add verified research before public announcements.

Official sources verified November 2026:
- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
