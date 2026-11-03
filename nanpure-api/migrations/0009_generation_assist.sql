CREATE TABLE IF NOT EXISTS generation_relays (
  id TEXT PRIMARY KEY, session TEXT NOT NULL, capacity INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS generation_requests (
  id TEXT PRIMARY KEY, client TEXT NOT NULL, level INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, expires INTEGER NOT NULL,
  relay_session TEXT, lease TEXT, lease_until INTEGER, result TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS generation_one_pending ON generation_requests(client) WHERE state='pending';
CREATE INDEX IF NOT EXISTS generation_queue ON generation_requests(state, created);
CREATE INDEX IF NOT EXISTS generation_expiry ON generation_requests(expires);
