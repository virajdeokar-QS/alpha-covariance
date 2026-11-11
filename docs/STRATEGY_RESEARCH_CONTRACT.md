# Strategy specification / contract (planning draft, not implemented)

Every proposed strategy will specify:

- `strategy_id`, `strategy_version`, `owner`, `created_at`, descriptive objective and research-paper references.
- `universe` (venue, symbol ids, asset class, tradable calendars, corporate actions, minimum liquidity).
- `data_contract` (vendor, entitlement, granularity, snapshot checksum, adjusted/unadjusted, lookahead prevention).
- `signal_definition` (implementation module or approved DSL, configurable parameters, fixed instrument list, expected runtime).
- `execution_policy` (frequency, fill model, participation cap, slippage, shorting constraints, transaction costs, latency assumption).
- `risk_policy` (position notional limits, gross/net exposure, drawdown cutoff, max concurrent orders, global stop, restart permission).
- `validation_policy` (train/test split, embargo, walk-forward schedule, random seeds, baselines, robustness and multiple-testing adjustments).
- `transition_approval` (who approved draft→backtest, backtest→paper, recorded evidence, rejection reason).

Metrics to persist for every immutable backtest include number of trades/fills, time-weighted returns, P&L, fees, slippage, turnover, holding time, Sharpe, Sortino, drawdown, exposure, IC/rank-IC when applicable, alpha relative to an explicit benchmark, and uncertainty intervals. A strategy with zero trades reports insufficient evidence rather than a false Sharpe or zero alpha.

Results must link to every input dataset, parameter, source revision, calculation version and log artifact. Store structured event records so manual trades and automated paper trades can use the same journal schema with a reliable `origin` attribute.

**Nothing in this document grants a live brokerage permission or asserts that these systems are complete.**
