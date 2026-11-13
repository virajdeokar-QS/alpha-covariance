# Alpha Covariance — Legal & Licensing Readiness Register

**Prepared:** 12 November 2026
**Jurisdiction focus:** India; additional rules can apply to users/providers abroad
**Scope:** Public landing site, authenticated Research Desk, market-data feeds, charts, custom strategies, backtesting, paper trading, news, invited users and eventual broker execution.

> Preliminary issue-spotting and engineering compliance plan, **not legal advice, a formal licence audit, or a guarantee of legal compliance**. Verify any commercial or multi-user rollout with a suitably qualified Indian securities lawyer and the relevant market-data rightsholders.

## Overall decision

**Proceed with architecture and code development. Do not declare the full planned product legally cleared.** The current owner-only manual Coinbase feed may fit limited research use subject to Coinbase terms. **Do not extend that feed to external friends, experts, trading agents, algorithm development/backtests, or published derived works without appropriately confirmed rights**. A public endpoint/API response does not establish redistribution or model-development permission.

## Issue-by-issue register

| Area | Status | Action/operating constraint | Release gate |
|---|---|---|---|
| Independent technical website | Conditionally permissible | Truthful identity; no fictional workforce, results, licensing or credentials; no tailored investment advice | Public release |
| Business/brand identity | Check before scaling | Domain ownership is not incorporation or trademark clearance. Search IP India, establish legal/tax position before selling services | Paid/commercial launch |
| Coinbase market-data feed | **Rights gap** | Keep manual viewing to entitled owner; obtain written rights before third-party displays, broad derived works or algorithm/ML use | Backtest/AI and invited-user release |
| NSE/BSE/other real-time data | **Rights gap** | Obtain vendor/exchange licence for planned use; third-party live stock paper-trading is particularly sensitive | Indian equities real-time/paper demo |
| Other markets (US, FX, EU, HK, etc.) | Provider-specific | Per-venue/vendor review for display, storage, non-display, derived works, commercial/noncommercial use, user seats | Each new market release |
| Paper trading | Conditionally permissible | Virtual-only funds; no prizes or investor deposits; no market-data redistribution without authorisation | Multi-user simulator |
| Investment research / recommendations | Regulatory boundary | Internal experimentation generally different from supplying investment advice/research services; SEBI RA/IA assessment needed before recommendations, price targets, client-facing signals or investment services | Public recommendations/client services |
| Real brokerage execution | Future regulated integration | Broker permission, SEBI/stock-exchange algo rules, user controls, account boundaries and jurisdiction-specific requirements | Real-money rollout |
| Privacy, accounts and review submissions | Build compliance | Notice, data minimisation, lawful basis/consent where required, access logs, retention/deletion, breach response, processor terms | Invited users and inquiry form |
| DPDP phased implementation | Monitor | November 13, 2025 immediate provisions; one-year provisions start November 13, 2026; principal obligations in May 2027 if no intervening changes | Each deadline |
| Cybersecurity | Implement | Server-side authentication/role gates, protected secrets, activity logs, backups, reportable-incident response; check CERT-In directions' applicability | Private launch |
| Financial news/publications | Copyright/data-rights | Link and attribute sources; do not scrape/republish protected full text or gated feeds without permission | News release |
| Chart software | Licence review | Use licensed/open-source tooling under its terms, respect required attribution, avoid copying TradingView's proprietary chart library or branding | Chart UI release |
| Research paper/code reuse | Copyright/open-source | Cite research; do not copy proprietary text, datasets, figures or incompatible code into public releases | Publications |
| Expert review programme | Deferred | Individual identities, consent, access expiry and contractual confidentiality; no restricted data supplied merely because Access login succeeds | Stage 6 |

## Coinbase conditions particularly relevant

Market Data Terms updated **August 7, 2026**:
- Clause 2: limited, revocable, personal/research-oriented licence for an individual or entity personnel; applications for unrelated end users not automatically allowed.
- Clause 3(2): no redistribution/display of market data and derived works to outside parties absent express written consent.
- Clause 3(5): no use to develop/train/validate/benchmark AI/ML models, algorithms, agents and other automated systems without consent; potentially affects strategy-backtesting plans.
- Additional clause 3 restrictions on financial-product valuations and benchmarks.

**Important:** Coinbase market-data terms are not a substitute for a negotiated developer/commercial data licence. Ask Coinbase for a written, explicit description of allowed internal backtesting, rule-based strategies, historical storage, derivative analytics and licensed user access. If not available, choose an alternative provider with appropriate rights.

## India-specific obligations and milestones

1. **SEBI RA/IA**: As an independent experimental software/research initiative that does not offer advice, client services or investment recommendations, the current activity may not need RA/IA registration merely because the website exists. However, the actual functionality and communications determine the boundary—not a disclaimer or the fact no fee is charged. Consider a qualified securities lawyer's written opinion before offering recommendations or services.
2. **SEBI real-time market data**: SEBI's **May 8, 2026** circular (effective July 1, 2026) amended the 2024/2025 rules to specify a **30-day lag** for sharing *and use* of Indian securities price data in the described educational arrangements, subject to legal agreements and restrictions; the one-day-lag exception is limited to NISM's simulation lab. The 30-day provision is not a universal data licence or safe harbour for all research products. Obtain provider rights and examine the intended audience and use.
3. **Algorithmic trading**: Before connecting to real brokers, review the then-current SEBI retail algorithmic trading circular and broker/exchange implementation standards.
4. **DPDP Act/Rules**: Phased commencement under **November 13, 2025 Gazette** and DPDP Rules 2025. Prepare privacy notice, access/correction/deletion processes, retention, processor arrangements and breach procedure now. Monitor changes, especially May 2027 implementation.
5. **CERT-In**: Determine whether cybersecurity reporting/log retention obligations apply to the deployed service and its operating entity.
6. **Entity/IP**: The domain and GitHub repo do not constitute a registered company or trademark. Confirm any eventual entity formation, tax registration/filing, brand clearance and ownership of contributed code before scaling.

## Engineering architecture required to finish legally

Create a provider-permission table with:
`vendor`, `venue`, `contract_uri`, `licence_version`, `permitted_research`, `historical_storage`, `internal_backtests`, `model_development`, `non_display_use`, `external_display`, `external_demo_trading`, `derived_analytics`, `market_region`, `approved_users`, `expiry`, `evidence`, and `approver`.

- Enforce **server-side rights by user and dataset**, not only by UI.
- Default to **deny** when rights/entitlement are unknown or expired.
- Separate **developer/unit-test fixtures** from production; never show fabricated live prices, P&L, or validation results on the site.
- Show unavailable/disconnected states for unsupported feeds.
- Store licence/legal proof alongside provider configuration and per-run dataset provenance.
- Require review for **data training, automated strategy logic, third-party display, and persistent storage**, because they can be separately licensable.
- Before every new venue, read the specific exchange/vendor licensing terms and applicable local regulatory restrictions.
- For publication, document methods, limitations and datasets without publishing restricted underlying prices or derived material.

## Exit criteria for final project

- [ ] Each live/historical data provider has documented rights for every actual use and user class
- [ ] Independent or licensed feeds are available for all claimed supported markets; no unsupported 'global live' claim
- [ ] RA/IA advice vs research boundary assessed by qualified counsel for intended user journey
- [ ] No broker account, customer funds, real orders or advisory service without the necessary contractual/regulatory review
- [ ] Privacy policy, notices, consent where applicable, security logging and retention reflect actual data flows
- [ ] Invited-user access and expert records have clear permission, retention and deletion policies
- [ ] Brand/trademark and third-party content/software licence checks completed
- [ ] Research performance claims trace to reproducible recorded results; none fabricated or exaggerated
- [ ] Final legal/data-rights review signed off before expanded launch

## Official sources reviewed

- Coinbase Market Data Terms (Aug 7, 2026): https://www.coinbase.com/legal/market_data
- NSE Data Sharing & Usage Policy: https://www.nseindia.com/static/market-data/nse-data-policy
- SEBI educational price-data sharing and usage update (May 8, 2026; effective July 1, 2026): https://www.sebi.gov.in/legal/circulars/may-2026/norms-for-sharing-and-usage-of-price-data-for-educational-purposes_101293.html
- Earlier SEBI real-time price-data circular (May 24, 2024, modified in 2026): https://www.sebi.gov.in/sebi_data/attachdocs/may-2024/1716559553659.pdf
- SEBI Research Analysts regulations and current listings (Oct 2026): https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=3
- SEBI Research Analysts 2026 amendment: https://www.sebi.gov.in/sebi_data/attachdocs/oct-2026/1791796596784.pdf
- SEBI Retail Algorithmic Trading (Feb 4, 2025): https://www.sebi.gov.in/legal/circulars/feb-2025/safer-participation-of-retail-investors-in-algorithmic-trading_91614.html
- DPDP phased-commencement Gazette: https://egazette.gov.in/WriteReadData/2025/267647.pdf
- DPDP Rules 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
- CERT-In 2022 security directions and FAQs: https://www.cert-in.org.in/Directions70B.jsp
- IP India trademark search: https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks
- TradingView Lightweight Charts open-source tool: https://www.tradingview.com/lightweight-charts/
