-- These triggers are attached to the other vending tables, so DROP TABLE above
-- does not remove them. Drop them explicitly before recreating their definitions.
DROP TRIGGER IF EXISTS vending_catalogue_target;
DROP TRIGGER IF EXISTS vending_catalogue_lease;
DROP TRIGGER IF EXISTS vending_catalogue_stock_insert;
DROP TRIGGER IF EXISTS vending_catalogue_stock_update;
DROP TRIGGER IF EXISTS vending_catalogue_stock_delete;
DROP TRIGGER IF EXISTS vending_catalogue_wait_insert;
DROP TRIGGER IF EXISTS vending_catalogue_wait_update;
DROP TRIGGER IF EXISTS vending_catalogue_wait_delete;

-- Raise expanded vending shelves to 100 without changing the legacy six-profile shelf.
-- Rebuild only the catalogue table because SQLite cannot alter a CHECK constraint.
-- Existing stock, reservations, leases, profile metadata and counters are copied verbatim.
CREATE TABLE vending_catalogue_new (
  profile TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL,
  level INTEGER NOT NULL,
  complexity INTEGER,
  multi_shape TEXT,
  linked_shape TEXT,
  target INTEGER NOT NULL DEFAULT 100 CHECK(target BETWEEN 1 AND 100),
  verification TEXT NOT NULL CHECK(verification IN ('server','device')),
  expanded INTEGER NOT NULL DEFAULT 1 CHECK(expanded IN (0,1)),
  available INTEGER NOT NULL DEFAULT 0,
  waiting INTEGER NOT NULL DEFAULT 0,
  last_job INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0
);

INSERT INTO vending_catalogue_new (
  profile,kind,n,level,complexity,multi_shape,linked_shape,target,verification,expanded,
  available,waiting,last_job,retry_after,failures
)
SELECT profile,kind,n,level,complexity,multi_shape,linked_shape,
  CASE WHEN expanded=1 THEN 100 ELSE target END,
  verification,expanded,available,waiting,last_job,retry_after,failures
FROM vending_catalogue;

DROP TABLE vending_catalogue;
ALTER TABLE vending_catalogue_new RENAME TO vending_catalogue;

CREATE INDEX vending_catalogue_base ON vending_catalogue (kind,n,level,profile) WHERE expanded=0;
CREATE INDEX vending_catalogue_reservations ON vending_catalogue (retry_after,last_job,profile) WHERE waiting>0;
CREATE INDEX vending_catalogue_understock ON vending_catalogue (retry_after,available*1.0/target,last_job,profile)
  WHERE available<target AND profile<>'normal:9:18:0::::';

CREATE TRIGGER vending_catalogue_target AFTER UPDATE OF target ON vending_profiles
BEGIN
  UPDATE vending_catalogue SET target=NEW.target WHERE profile=NEW.profile AND expanded=0;
END;

CREATE TRIGGER vending_catalogue_lease AFTER INSERT ON vending_jobs
BEGIN
  UPDATE vending_catalogue SET last_job=NEW.created WHERE profile=NEW.profile;
END;

CREATE TRIGGER vending_catalogue_stock_insert AFTER INSERT ON vending_puzzles
BEGIN
  UPDATE vending_catalogue SET
    available=available+(NEW.order_id IS NULL AND NEW.payload IS NOT NULL),
    retry_after=0,failures=0 WHERE profile=NEW.profile;
END;

CREATE TRIGGER vending_catalogue_stock_update AFTER UPDATE OF order_id,payload ON vending_puzzles
WHEN (NEW.order_id IS NULL AND NEW.payload IS NOT NULL)<>(OLD.order_id IS NULL AND OLD.payload IS NOT NULL)
BEGIN
  UPDATE vending_catalogue SET available=available
    +(NEW.order_id IS NULL AND NEW.payload IS NOT NULL)
    -(OLD.order_id IS NULL AND OLD.payload IS NOT NULL)
  WHERE profile=NEW.profile;
END;

CREATE TRIGGER vending_catalogue_stock_delete AFTER DELETE ON vending_puzzles
WHEN OLD.order_id IS NULL AND OLD.payload IS NOT NULL
BEGIN
  UPDATE vending_catalogue SET available=available-1 WHERE profile=OLD.profile;
END;

CREATE TRIGGER vending_catalogue_wait_insert AFTER INSERT ON vending_orders
WHEN NEW.cancelled IS NULL AND NEW.assigned<NEW.count
BEGIN
  UPDATE vending_catalogue SET waiting=waiting+NEW.count-NEW.assigned WHERE profile=NEW.profile;
END;

CREATE TRIGGER vending_catalogue_wait_update AFTER UPDATE OF count,assigned,cancelled ON vending_orders
WHEN (NEW.cancelled IS NULL)*(NEW.count-NEW.assigned)
  <> (OLD.cancelled IS NULL)*(OLD.count-OLD.assigned)
BEGIN
  UPDATE vending_catalogue SET waiting=waiting
    +(NEW.cancelled IS NULL)*(NEW.count-NEW.assigned)
    -(OLD.cancelled IS NULL)*(OLD.count-OLD.assigned)
  WHERE profile=NEW.profile;
END;

CREATE TRIGGER vending_catalogue_wait_delete AFTER DELETE ON vending_orders
WHEN OLD.cancelled IS NULL AND OLD.assigned<OLD.count
BEGIN
  UPDATE vending_catalogue SET waiting=waiting-OLD.count+OLD.assigned WHERE profile=OLD.profile;
END;
