-- Anonymous opt-in title collection. Tokens are hashed; only title IDs leave the browser.
CREATE TABLE IF NOT EXISTS achievement_members (
 identity TEXT PRIMARY KEY,
 catalog_version INTEGER NOT NULL,
 joined_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS achievement_owned (
 identity TEXT NOT NULL REFERENCES achievement_members(identity),
 title_id TEXT NOT NULL,
 catalog_version INTEGER NOT NULL,
 received_at INTEGER NOT NULL,
 PRIMARY KEY(identity,title_id)
);
CREATE INDEX IF NOT EXISTS achievement_owned_catalog_title ON achievement_owned(catalog_version,title_id);
