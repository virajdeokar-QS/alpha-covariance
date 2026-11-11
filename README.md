# Alpha Covariance · Website v1.0

A high-contrast, editorial quantitative research website. Six principal sections, an interactive mathematical instrument, visitor inquiry workflow, and architecture for future quant applications.

**Status:** Implemented source; not yet connected to a live domain. No fabricated research performance claims.

## Quick start

```sh
python build.py
cd site
python -m http.server 8080
```

Then visit `http://localhost:8080`. The site requires no npm install.

## Pages

- `/` — editorial homepage and live synthetic correlation illustration
- `/research/` — hypotheses, research topics, methodological standards
- `/systems/` — engineering and quant project register
- `/lab/` — live two-asset covariance & portfolio volatility playground
- `/notes/` — honest, pre-publication research and technical report register
- `/about/` — mission, scope, founder background
- `/contact/` — public email and configurable secure visitor inquiry form
- `/privacy/` — privacy note

## Update text

Edit `build.py`, then run `python build.py` to regenerate HTML. The generated `site/` folder is committed so hosting requires no build dependencies. Visual design tokens are defined in `site/assets/styles.css`.

## Deployment

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for GitHub → Cloudflare Pages → BigRock DNS and email-safe activation of the inquiry form. The CSS/UX system and architecture are described in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Important notes

- The site's **numeric playground** is real analytical math with simulated visual points, not live prices.
- Visitor messages are **not collected until** you configure Cloudflare D1 and Turnstile. A mailto alternative is displayed meanwhile.
- The website does not provide regulated investment advice, performance guarantees, or managed investment services.
- Two external Google Fonts are requested when online; local fallback fonts are used if they are unavailable. No third-party JS framework is required.
- The GitHub link in the footer leads to `github.com` until your organisation URL is known. Change it to your actual verified organisation after creation.
