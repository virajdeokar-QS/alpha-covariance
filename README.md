# Alpha Covariance — Consolidated Educational Research Release R0.5

Independent quantitative research and engineering, non-commercial and educational. Source package includes the existing public website, private research Desk, Cloudflare D1 strategy registry and owner-only local historical research engine.

**Read [START_HERE.md](START_HERE.md) before any deployment.** The package is **not deployed**; historical dataset processing and virtual paper replay require a running WSL/local machine and optional authenticated Cloudflare Tunnel. The public site is directly link-accessible but requests `noindex`, while the private Desk remains Cloudflare Access protected.

## Verify source

```sh
python build.py
node --test tests/*.test.mjs
python -m unittest discover -s tests_engine -v
python -m research_engine check
```

The package contains no invented live prices, trades, validated alpha results or exchange/broker connection. Quantitative tests use clearly isolated synthetic fixtures only in `tests_engine/`.

## Main directories

- `site/`, `build.py`: unlisted public information site and mathematical demonstrations.
- `desk/`, `wrangler.desk.jsonc`: private Worker's signed Access verification, Coinbase owner-only/manual display gate, Research Studio and integrated Lab UI.
- `migrations/0001_strategy_registry.sql`: Cloudflare D1 owner strategy/version/audit metadata.
- `research_engine/`: standard-library Python engine for importing owner-entitled real historical bars, durable backtest jobs, historical paper replay, factor/portfolio risk, trade journal and markdown reports. No real execution.
- `benchmarks/`: C++ local CPU order-book update benchmark, not network/exchange latency.
- `tests/`, `tests_engine/`: Cloudflare Worker/JS and Python data/execution/security integration tests.
- `docs/INTEGRATED_RELEASE_DEPLOYMENT.md`: operational runbook with rollback and market-data compliance gates.

**Never publish credentials, research CSVs or the local SQLite runtime directory to GitHub.** Keep market-data rights specific to each provider and use. The expert review programme remains deferred until core systems are reliably deployed.
