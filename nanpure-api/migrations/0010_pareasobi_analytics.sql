-- Additive, privacy-preserving analytics for PareAsobi and Nanpure.
-- Daily rotating hashes are retained only to deduplicate visitors; no IP, URL, referrer or content is stored.
CREATE TABLE IF NOT EXISTS pare_analytics_daily (
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  screen TEXT NOT NULL,
  event TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day,game,screen,event)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS pare_analytics_unique (
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  kind TEXT NOT NULL,
  visitor TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(day,game,kind,visitor)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS pare_analytics_daily_day ON pare_analytics_daily(day,game);
CREATE INDEX IF NOT EXISTS pare_analytics_unique_day ON pare_analytics_unique(day,game,kind);
