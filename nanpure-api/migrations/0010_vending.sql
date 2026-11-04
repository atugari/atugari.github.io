CREATE TABLE vending_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  low_water INTEGER NOT NULL DEFAULT 10 CHECK (low_water > 0),
  target INTEGER NOT NULL DEFAULT 30 CHECK (target >= low_water),
  refilling INTEGER NOT NULL DEFAULT 1 CHECK (refilling IN (0, 1))
);
INSERT INTO vending_settings (id) VALUES (1);

CREATE TABLE vending_devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked INTEGER
);

CREATE TABLE vending_pairs (
  code_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  device_id TEXT REFERENCES vending_devices(id)
);
CREATE INDEX vending_pairs_expiry ON vending_pairs (expires);

CREATE TABLE vending_orders (
  id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 10),
  original_count INTEGER NOT NULL CHECK (original_count BETWEEN 1 AND 10),
  reserve INTEGER NOT NULL CHECK (reserve IN (0, 1)),
  assigned INTEGER NOT NULL DEFAULT 0 CHECK (assigned BETWEEN 0 AND count),
  received INTEGER NOT NULL DEFAULT 0 CHECK (received BETWEEN 0 AND assigned),
  created INTEGER NOT NULL,
  cancelled INTEGER,
  closed INTEGER
);
CREATE INDEX vending_orders_client ON vending_orders (client, created DESC);
CREATE INDEX vending_orders_waiting ON vending_orders (created, id) WHERE cancelled IS NULL AND assigned < count;
CREATE INDEX vending_orders_closed ON vending_orders (closed) WHERE closed IS NOT NULL;
CREATE INDEX vending_orders_open ON vending_orders (created) WHERE closed IS NULL;

CREATE TABLE vending_jobs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES vending_devices(id),
  lease TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  created INTEGER NOT NULL,
  done INTEGER,
  digest TEXT
);
CREATE INDEX vending_jobs_open ON vending_jobs (lease_until, device_id) WHERE done IS NULL;
CREATE INDEX vending_jobs_device ON vending_jobs (device_id, lease_until) WHERE done IS NULL;
CREATE INDEX vending_jobs_expiry ON vending_jobs (lease_until);

CREATE TABLE vending_puzzles (
  digest TEXT PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL UNIQUE,
  payload BLOB,
  created INTEGER NOT NULL,
  order_id TEXT REFERENCES vending_orders(id),
  collected INTEGER
);
CREATE INDEX vending_puzzles_shelf ON vending_puzzles (created, digest) WHERE order_id IS NULL AND payload IS NOT NULL;
CREATE INDEX vending_puzzles_order ON vending_puzzles (order_id, collected, created) WHERE order_id IS NOT NULL;

-- One row insertion claims its existing stock and switches replenishment on
-- atomically. A simultaneous caller sees only the unclaimed remainder.
CREATE TRIGGER vending_allocate_order AFTER INSERT ON vending_orders
BEGIN
  UPDATE vending_puzzles SET order_id = NEW.id WHERE digest IN (
    SELECT digest FROM vending_puzzles WHERE order_id IS NULL AND payload IS NOT NULL
    ORDER BY created, digest LIMIT NEW.count
  );
  UPDATE vending_orders SET assigned = (
    SELECT COUNT(*) FROM vending_puzzles WHERE order_id = NEW.id
  ) WHERE id = NEW.id;
  UPDATE vending_settings SET refilling = 1 WHERE id = 1 AND refilling = 0 AND (
    SELECT COUNT(*) FROM vending_puzzles WHERE order_id IS NULL AND payload IS NOT NULL
  ) < low_water;
END;

-- Newly admitted stock serves outstanding orders before the public shelf.
-- Job completion and admission are committed together.
CREATE TRIGGER vending_admit_puzzle AFTER INSERT ON vending_puzzles
BEGIN
  UPDATE vending_puzzles SET order_id = (
    SELECT id FROM vending_orders WHERE cancelled IS NULL AND assigned < count ORDER BY created, rowid LIMIT 1
  ) WHERE digest = NEW.digest;
  UPDATE vending_orders SET assigned = assigned + 1 WHERE id = (
    SELECT order_id FROM vending_puzzles WHERE digest = NEW.digest
  );
  UPDATE vending_jobs SET done = NEW.created, digest = NEW.digest WHERE id = NEW.job_id;
  UPDATE vending_settings SET refilling = 0 WHERE id = 1 AND refilling = 1 AND (
    SELECT COUNT(*) FROM vending_puzzles WHERE order_id IS NULL AND payload IS NOT NULL
  ) >= target;
END;

-- A cancelled order releases only puzzles the user has not collected. Each
-- returned puzzle goes to the oldest waiting reservation, if there is one.
CREATE TRIGGER vending_reassign_puzzle AFTER UPDATE OF order_id ON vending_puzzles
WHEN OLD.order_id IS NOT NULL AND NEW.order_id IS NULL AND NEW.payload IS NOT NULL
BEGIN
  UPDATE vending_puzzles SET order_id = (
    SELECT id FROM vending_orders WHERE cancelled IS NULL AND assigned < count ORDER BY created, rowid LIMIT 1
  ) WHERE digest = NEW.digest;
  UPDATE vending_orders SET assigned = assigned + 1 WHERE id = (
    SELECT order_id FROM vending_puzzles WHERE digest = NEW.digest
  );
END;

CREATE TRIGGER vending_cancel_order AFTER UPDATE OF cancelled ON vending_orders
WHEN OLD.cancelled IS NULL AND NEW.cancelled IS NOT NULL
BEGIN
  UPDATE vending_puzzles SET order_id = NULL WHERE order_id = NEW.id AND collected IS NULL;
  UPDATE vending_orders SET assigned = (
    SELECT COUNT(*) FROM vending_puzzles WHERE order_id = NEW.id
  ) WHERE id = NEW.id;
  UPDATE vending_settings SET refilling = 0 WHERE id = 1 AND refilling = 1 AND (
    SELECT COUNT(*) FROM vending_puzzles WHERE order_id IS NULL AND payload IS NOT NULL
  ) >= target;
END;
