-- Existing orders, device leases, and puzzle IDs all belong to the pilot shelf.
CREATE TABLE vending_profiles (
  profile TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL,
  level INTEGER NOT NULL,
  complexity INTEGER,
  multi_shape TEXT,
  linked_shape TEXT,
  target INTEGER NOT NULL DEFAULT 3 CHECK(target BETWEEN 1 AND 30),
  last_job INTEGER NOT NULL DEFAULT 0
);

INSERT INTO vending_profiles (profile, kind, n, level) VALUES
  ('normal:9:18:0::::', 'normal', 9, 18),
  ('normal:9:1:0::::', 'normal', 9, 1),
  ('normal:9:2:0::::', 'normal', 9, 2),
  ('normal:9:3:0::::', 'normal', 9, 3),
  ('normal:16:1:0::::', 'normal', 16, 1),
  ('normal:25:1:0::::', 'normal', 25, 1);

ALTER TABLE vending_orders ADD COLUMN profile TEXT NOT NULL DEFAULT 'normal:9:18:0::::';
ALTER TABLE vending_jobs ADD COLUMN profile TEXT NOT NULL DEFAULT 'normal:9:18:0::::';
ALTER TABLE vending_puzzles ADD COLUMN profile TEXT NOT NULL DEFAULT 'normal:9:18:0::::';
ALTER TABLE vending_devices ADD COLUMN stock_count INTEGER;
ALTER TABLE vending_devices ADD COLUMN stock_bytes INTEGER;
ALTER TABLE vending_devices ADD COLUMN stock_updated INTEGER;

CREATE INDEX vending_puzzles_profile_shelf ON vending_puzzles (profile, created, digest)
  WHERE order_id IS NULL AND payload IS NOT NULL;
CREATE INDEX vending_orders_profile_waiting ON vending_orders (profile, created)
  WHERE cancelled IS NULL AND assigned < count;
CREATE INDEX vending_jobs_profile_open ON vending_jobs (profile, lease_until) WHERE done IS NULL;

CREATE TRIGGER vending_note_lease AFTER INSERT ON vending_jobs
BEGIN
  UPDATE vending_profiles SET last_job=NEW.created WHERE profile=NEW.profile;
  UPDATE vending_devices SET last_seen=NEW.created WHERE id=NEW.device_id AND revoked IS NULL;
END;

DROP TRIGGER vending_allocate_order;
DROP TRIGGER vending_admit_puzzle;
DROP TRIGGER vending_reassign_puzzle;
DROP TRIGGER vending_cancel_order;

CREATE TRIGGER vending_allocate_order AFTER INSERT ON vending_orders
BEGIN
  UPDATE vending_puzzles SET order_id = NEW.id WHERE digest IN (
    SELECT digest FROM vending_puzzles WHERE profile=NEW.profile AND order_id IS NULL AND payload IS NOT NULL
    ORDER BY created, digest LIMIT NEW.count
  );
  UPDATE vending_orders SET assigned = (
    SELECT COUNT(*) FROM vending_puzzles WHERE order_id = NEW.id
  ) WHERE id = NEW.id;
  UPDATE vending_settings SET refilling = 1
    WHERE NEW.profile='normal:9:18:0::::' AND id=1 AND refilling=0 AND (
      SELECT COUNT(*) FROM vending_puzzles WHERE profile=NEW.profile AND order_id IS NULL AND payload IS NOT NULL
    ) < low_water;
END;

CREATE TRIGGER vending_admit_puzzle AFTER INSERT ON vending_puzzles
BEGIN
  UPDATE vending_puzzles SET order_id = (
    SELECT id FROM vending_orders
    WHERE profile=NEW.profile AND cancelled IS NULL AND assigned < count ORDER BY created, rowid LIMIT 1
  ) WHERE digest = NEW.digest;
  UPDATE vending_orders SET assigned = assigned + 1 WHERE id = (
    SELECT order_id FROM vending_puzzles WHERE digest = NEW.digest
  );
  UPDATE vending_jobs SET done = NEW.created, digest = NEW.digest WHERE id = NEW.job_id;
  UPDATE vending_settings SET refilling=0
    WHERE NEW.profile='normal:9:18:0::::' AND id=1 AND refilling=1 AND (
      SELECT COUNT(*) FROM vending_puzzles WHERE profile=NEW.profile AND order_id IS NULL AND payload IS NOT NULL
    ) >= target;
END;

CREATE TRIGGER vending_reassign_puzzle AFTER UPDATE OF order_id ON vending_puzzles
WHEN OLD.order_id IS NOT NULL AND NEW.order_id IS NULL AND NEW.payload IS NOT NULL
BEGIN
  UPDATE vending_puzzles SET order_id = (
    SELECT id FROM vending_orders
    WHERE profile=NEW.profile AND cancelled IS NULL AND assigned < count ORDER BY created, rowid LIMIT 1
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
  UPDATE vending_settings SET refilling=0
    WHERE NEW.profile='normal:9:18:0::::' AND id=1 AND refilling=1 AND (
      SELECT COUNT(*) FROM vending_puzzles WHERE profile=NEW.profile AND order_id IS NULL AND payload IS NOT NULL
    ) >= target;
END;
