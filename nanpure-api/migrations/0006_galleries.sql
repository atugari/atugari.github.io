-- A gallery is independent of the retiring backup service. Never stores owner keys.
CREATE TABLE IF NOT EXISTS galleries (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL UNIQUE,
 content TEXT NOT NULL,
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated INTEGER NOT NULL,
 bytes INTEGER NOT NULL
);
