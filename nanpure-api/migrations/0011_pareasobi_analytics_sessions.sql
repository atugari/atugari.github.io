CREATE TABLE IF NOT EXISTS pare_analytics_sessions (
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  session TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(day,game,session)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS pare_analytics_sessions_day ON pare_analytics_sessions(day,game);
