-- Additive owner-only monitoring. No puzzle, inquiry or backup data is changed.
-- A scheduled job removes pseudonym days older than 35 days; totals have no IDs.
CREATE TABLE IF NOT EXISTS visit_sessions (
  day TEXT NOT NULL, session TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(day, session)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visit_browsers (
  day TEXT NOT NULL, visitor TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(day, visitor)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visit_days (
  day TEXT PRIMARY KEY NOT NULL, browsers INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS owner_usage_snapshots (
  id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS inquiry_status_count ON inquiries(status);
