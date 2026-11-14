-- Alpha Covariance R1.2: five inactive reviewer slots and auditable research links.
-- No passwords, auth tokens, market bars or live orders are stored in D1.
CREATE TABLE IF NOT EXISTS reviewer_slots (
  slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 5),
  reviewer_email TEXT UNIQUE,
  expires_at TEXT,
  assigned_at TEXT,
  CHECK ((reviewer_email IS NULL AND expires_at IS NULL) OR
         (reviewer_email IS NOT NULL AND expires_at IS NOT NULL))
);
INSERT OR IGNORE INTO reviewer_slots(slot) VALUES (1),(2),(3),(4),(5);
CREATE TABLE IF NOT EXISTS review_feedback (
  id TEXT PRIMARY KEY,
  slot INTEGER NOT NULL REFERENCES reviewer_slots(slot),
  reviewer_email TEXT NOT NULL,
  strategy_id TEXT NOT NULL REFERENCES strategy_registry(id),
  strategy_version INTEGER NOT NULL CHECK(strategy_version>0),
  recommendation TEXT NOT NULL CHECK(recommendation IN ('evaluate','revise','reject')),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 12 AND 2000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_feedback_strategy ON review_feedback(strategy_id,created_at DESC);
CREATE TABLE IF NOT EXISTS research_run_links (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategy_registry(id),
  strategy_version INTEGER NOT NULL CHECK(strategy_version>0),
  dataset_id TEXT NOT NULL,
  engine_job_id TEXT NOT NULL UNIQUE,
  run_type TEXT NOT NULL CHECK(run_type IN ('backtest','paper')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_links_strategy ON research_run_links(strategy_id,created_at DESC);
