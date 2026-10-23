-- Opaque, expiring sessions for the author's Wado trial. Never store the owner key.
CREATE TABLE IF NOT EXISTS wado_owner_sessions (
  token_hash TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wado_owner_sessions_expiry ON wado_owner_sessions(expires);
