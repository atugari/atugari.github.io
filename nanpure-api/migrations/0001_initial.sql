-- Schema from the existing Nanpure application (source commit 1222640).
-- Apply to the new, empty puzzle-db. No existing data is deleted or imported.
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY NOT NULL,
  player TEXT NOT NULL,
  day TEXT NOT NULL,
  level INTEGER NOT NULL,
  started INTEGER NOT NULL,
  finished INTEGER,
  solved INTEGER,
  elapsed INTEGER,
  name TEXT,
  abandoned INTEGER,
  excluded INTEGER,
  review_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_daily_attempt ON attempts(player, day, level);

CREATE TABLE IF NOT EXISTS daily_stock (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL,
  level INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created INTEGER NOT NULL,
  retired INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS daily_stock_pool ON daily_stock(kind, n, level, retired, created);

CREATE TABLE IF NOT EXISTS daily_assignments (
  slot TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  level INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  payload TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_assignment_once ON daily_assignments(fingerprint);

CREATE TABLE IF NOT EXISTS daily_maintenance (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  expires INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  topic TEXT NOT NULL,
  detail TEXT NOT NULL,
  region TEXT,
  method TEXT,
  result TEXT,
  locale TEXT NOT NULL,
  sender TEXT NOT NULL,
  created INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  response TEXT,
  updated INTEGER,
  access_hash TEXT,
  request_id TEXT,
  context TEXT,
  image_source TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_request_once ON inquiries(sender, request_id);
CREATE INDEX IF NOT EXISTS inquiry_sender_time ON inquiries(sender, created);

CREATE TABLE IF NOT EXISTS cloud_saves (
  owner TEXT PRIMARY KEY NOT NULL,
  revision TEXT NOT NULL,
  object_key TEXT NOT NULL,
  created INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  puzzles INTEGER NOT NULL
);
