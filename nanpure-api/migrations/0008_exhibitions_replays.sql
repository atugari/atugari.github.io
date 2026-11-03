CREATE TABLE exhibition_entries (
 id TEXT PRIMARY KEY, event TEXT NOT NULL, owner TEXT NOT NULL,
 room_id TEXT NOT NULL REFERENCES galleries(id), slot INTEGER NOT NULL,
 content TEXT NOT NULL, fingerprint TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 revision INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, updated INTEGER NOT NULL,
 UNIQUE(event,owner,slot), UNIQUE(event,owner,fingerprint)
);
CREATE INDEX exhibition_entries_event ON exhibition_entries(event,active,created,id);
CREATE TABLE exhibition_reactions (
 entry_id TEXT NOT NULL REFERENCES exhibition_entries(id), owner TEXT NOT NULL,
 kind TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(entry_id,owner,kind)
);
CREATE TABLE gallery_replays (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, entry_id TEXT,
 content TEXT NOT NULL, title TEXT NOT NULL, name TEXT NOT NULL, fingerprint TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1,
 created INTEGER NOT NULL, updated INTEGER NOT NULL, bytes INTEGER NOT NULL
);
CREATE INDEX gallery_replays_entry ON gallery_replays(entry_id,active,created,id);
CREATE INDEX gallery_replays_owner ON gallery_replays(owner,active,created,id);
