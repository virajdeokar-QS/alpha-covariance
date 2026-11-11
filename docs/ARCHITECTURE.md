# Alpha Covariance — design and architecture

## Design thesis

Not a retail-trading dashboard. The public site uses an editorial approach: warm paper, deep forest, almost-black typography, acid-yellow as a functional signal, and coral as a sparse analytic annotation. The display serif is used for emphasis, not body copy; monospaced labels carry metadata.

## Structure

```
alpha-covariance-site/
├── build.py                 # Dependency-free page generator
├── site/                    # Deployment root; generated HTML committed
│   ├── index.html
│   ├── research/index.html
│   ├── systems/index.html
│   ├── lab/index.html
│   ├── notes/index.html
│   ├── about/index.html
│   ├── contact/index.html
│   ├── privacy/index.html
│   ├── assets/              # CSS tokens, JS modules, local SVGs
│   └── _headers
├── functions/api/inquiry.js # Cloudflare Pages Function
├── db/001_create_inquiries.sql
└── docs/
```

## Future-proofing without premature complexity

- `styles.css` uses documented global tokens. Preserve tokens and typographic system when migrating to Astro, React or a documentation renderer.
- Public content is static by design; it deploys cheaply and is easy to crawl.
- The interactive lab is client-side JavaScript. It can later become a React/Vue island **without** changing the design system.
- Heavy quant services should run separately (for example, `apps.alphacovariance.com`), with authentication, isolated compute, observability and limits. Don't host untrusted code execution inside public Pages Functions.
- The visitor inquiry route is independent of research compute and has its own database. A future database/service layer can replace it without redesigning the contact UI.
- As research publications multiply, move structured content into a content collection / MDX or CMS as appropriate, keeping URLs and CSS components stable.

## Research and claims policy

No backtest results or claims of verified performance are presented. All project statuses are explicit. The interactive model uses synthetic seeded points only. Analytical portfolio volatility is computed using the exact two-asset variance equation.

## Form status

The visitor inquiry section remains visibly disabled by default until both D1 and Turnstile are provisioned and the public Turnstile site key is entered. The server endpoint refuses to accept submissions until its bindings are configured. There is no public read API.

## Operational needs for future launch

Legal pages, research terms, accessibility audits, retention controls, and disclosure policy should be periodically reviewed as functionality expands. The current privacy note describes the current, limited collection behavior; adapt it if adding analytics, subscriptions or user accounts.
