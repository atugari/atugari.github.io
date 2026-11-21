-- Dedicated database for the Pareasobi promotional publisher.
-- This schema is NOT applied to the existing puzzle-db used by "今日の4問".
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS promo_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO promo_settings(id, enabled, updated_at)
VALUES (1, 0, 0);

CREATE TABLE IF NOT EXISTS promo_posts (
  id TEXT PRIMARY KEY,
  locale TEXT NOT NULL CHECK (locale IN (
    'ja','en','zh-hans','zh-hant','ko','es','fr','de','pt','it',
    'nl','sv','pl','cs','ru','id','vi','th','hi','ar'
  )),
  copy_variant INTEGER NOT NULL CHECK (copy_variant BETWEEN 0 AND 2),
  puzzle_focus TEXT NOT NULL CHECK (puzzle_focus IN (
    'general','wado','sudoku','crossword','shirupure'
  )),
  text TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  media_key TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/png','image/jpeg','video/mp4')),
  media_sha256 TEXT NOT NULL CHECK (length(media_sha256) = 64),
  media_bytes INTEGER NOT NULL CHECK (media_bytes > 0),
  status TEXT NOT NULL CHECK (status IN (
    'queued','uploading','processing','posting','sent','failed','needs_review','cancelled'
  )),
  media_id TEXT,
  next_check_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  post_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sent_at INTEGER,
  UNIQUE (scheduled_at)
);
CREATE INDEX IF NOT EXISTS promo_posts_due
  ON promo_posts(status, scheduled_at, next_check_at);

CREATE TABLE IF NOT EXISTS promo_oauth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token_cipher TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  refresh_token_cipher TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT NOT NULL,
  account_username TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS promo_oauth_states (
  state TEXT PRIMARY KEY,
  verifier_cipher TEXT NOT NULL,
  verifier_iv TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS promo_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT,
  event TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES promo_posts(id)
);
CREATE INDEX IF NOT EXISTS promo_events_by_post
  ON promo_events(post_id, created_at);
