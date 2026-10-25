CREATE TABLE IF NOT EXISTS x_four_posts (
  key TEXT PRIMARY KEY, day TEXT NOT NULL, slot TEXT NOT NULL, due INTEGER NOT NULL,
  status TEXT NOT NULL, meta TEXT NOT NULL, created INTEGER NOT NULL,
  sent_at INTEGER, post_id TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS x_four_posts_due ON x_four_posts(due);
CREATE TABLE IF NOT EXISTS x_four_images (
  post_key TEXT NOT NULL, position INTEGER NOT NULL, media TEXT NOT NULL,
  sha256 TEXT NOT NULL, PRIMARY KEY(post_key,position)
);
CREATE TABLE IF NOT EXISTS x_four_fingerprints (hash TEXT PRIMARY KEY, post_key TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS x_four_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL);
INSERT OR IGNORE INTO x_four_settings(id,enabled) VALUES(1,0);
