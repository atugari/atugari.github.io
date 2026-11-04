CREATE TABLE pilot_sessions (
  token_hash TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);
CREATE INDEX pilot_session_expiry ON pilot_sessions (expires);
