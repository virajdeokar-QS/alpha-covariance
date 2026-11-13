-- Alpha Covariance Stage 2: private metadata only. No market data, fills, or execution.
CREATE TABLE IF NOT EXISTS strategy_registry (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 3 AND 100),
  hypothesis TEXT NOT NULL,
  universe TEXT NOT NULL,
  signal_family TEXT NOT NULL,
  entry_logic TEXT NOT NULL,
  exit_logic TEXT NOT NULL,
  risk_controls TEXT NOT NULL,
  parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json)),
  references_json TEXT NOT NULL CHECK(json_valid(references_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_strategy_owner_updated ON strategy_registry(owner_email,updated_at DESC);
CREATE TABLE IF NOT EXISTS strategy_versions (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategy_registry(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version>0),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  UNIQUE(strategy_id,version)
);
CREATE TABLE IF NOT EXISTS strategy_events (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategy_registry(id) ON DELETE RESTRICT,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','revised','archived')),
  created_at TEXT NOT NULL,
  details_json TEXT NOT NULL CHECK(json_valid(details_json))
);
CREATE INDEX IF NOT EXISTS idx_strategy_events ON strategy_events(strategy_id,created_at DESC);
