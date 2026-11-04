-- Public claims can select a board after a local notebook lookup. Existing
-- reservations and legacy public clients keep their first-in-stock allocation.
ALTER TABLE vending_orders ADD COLUMN public_digest TEXT
  CHECK (public_digest IS NULL OR (length(public_digest) = 64 AND public_digest NOT GLOB '*[^0-9a-f]*'));

DROP TRIGGER vending_allocate_order;
CREATE TRIGGER vending_allocate_order AFTER INSERT ON vending_orders
BEGIN
  UPDATE vending_puzzles SET order_id = NEW.id WHERE digest IN (
    SELECT digest FROM vending_puzzles
    WHERE profile=NEW.profile AND order_id IS NULL AND payload IS NOT NULL
      AND (NEW.public_digest IS NULL OR digest=NEW.public_digest)
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
