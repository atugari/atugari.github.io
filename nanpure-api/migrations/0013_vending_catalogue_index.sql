-- The old eight-profile table remains intact during Worker deployments.
-- All new scheduling state lives here, separate from the historical ledger.
CREATE TABLE vending_catalogue (
  profile TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL,
  level INTEGER NOT NULL,
  complexity INTEGER,
  multi_shape TEXT,
  linked_shape TEXT,
  target INTEGER NOT NULL DEFAULT 1 CHECK(target BETWEEN 1 AND 30),
  verification TEXT NOT NULL CHECK(verification IN ('server','device')),
  expanded INTEGER NOT NULL DEFAULT 1 CHECK(expanded IN (0,1)),
  available INTEGER NOT NULL DEFAULT 0,
  waiting INTEGER NOT NULL DEFAULT 0,
  last_job INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0
);

INSERT INTO vending_catalogue (
  profile,kind,n,level,complexity,multi_shape,linked_shape,target,verification,expanded,available,waiting,last_job
)
SELECT p.profile,p.kind,p.n,p.level,p.complexity,p.multi_shape,p.linked_shape,p.target,'server',0,
  (SELECT COUNT(*) FROM vending_puzzles s WHERE s.profile=p.profile AND s.order_id IS NULL AND s.payload IS NOT NULL),
  (SELECT COALESCE(SUM(o.count-o.assigned),0) FROM vending_orders o
    WHERE o.profile=p.profile AND o.cancelled IS NULL AND o.assigned<o.count),p.last_job
FROM vending_profiles p;

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

-- These deltas compose with the older allocation/admission triggers in either
-- execution order. Counts are only read outside the atomic write statement.
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
