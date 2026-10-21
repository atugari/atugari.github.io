-- Additive migration. Existing attempts, inquiries and daily assignments remain.
CREATE INDEX IF NOT EXISTS daily_assignment_day ON daily_assignments(day,level);
CREATE INDEX IF NOT EXISTS attempt_ranking ON attempts(day,level,elapsed,finished);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_expiration ON rate_limits(expires);
CREATE TABLE IF NOT EXISTS contact_images(id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS cloud_uploads(revision TEXT PRIMARY KEY, owner TEXT NOT NULL, expected TEXT, created INTEGER NOT NULL, expires INTEGER NOT NULL, bytes INTEGER NOT NULL, chunks INTEGER NOT NULL, puzzles INTEGER NOT NULL, digest TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS upload_owner ON cloud_uploads(owner,expires);
CREATE TABLE IF NOT EXISTS cloud_chunks(owner TEXT NOT NULL, revision TEXT NOT NULL, position INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(revision,position));
CREATE INDEX IF NOT EXISTS chunk_owner ON cloud_chunks(owner,revision);
ALTER TABLE cloud_saves ADD COLUMN chunks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cloud_saves ADD COLUMN digest TEXT;
