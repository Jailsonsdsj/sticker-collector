-- Custom SQL migration file, put your code below! --
-- `random_price` joins the sealed economics.
--
-- The trigger has to be replaced rather than added to: SQLite has no ALTER
-- TRIGGER, and a second trigger guarding one column would leave two places to
-- read when asking what a sealed puzzle may change. Dropping and recreating is
-- the whole edit, and it is safe — a trigger holds no data.
--
-- Without this the one price added after 0012 would be the one price a sealed
-- puzzle could rewrite, which is precisely the hole the trigger exists to close.
DROP TRIGGER IF EXISTS puzzle_frozen;
--> statement-breakpoint
CREATE TRIGGER puzzle_frozen BEFORE UPDATE ON puzzle
WHEN old.sealed_at IS NOT NULL AND (
     new.unlock_price <> old.unlock_price
  OR new.piece_price  <> old.piece_price
  OR new.random_price <> old.random_price
  OR new.rows         <> old.rows
  OR new.cols         <> old.cols
  OR new.image_key    <> old.image_key
  OR new.image_width  <> old.image_width
  OR new.image_height <> old.image_height
  OR new.hide_locked  <> old.hide_locked)
BEGIN SELECT RAISE(ABORT, 'sealed puzzle economics are immutable'); END;
