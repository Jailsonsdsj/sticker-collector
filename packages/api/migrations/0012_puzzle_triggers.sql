-- Custom SQL migration file, put your code below! --
-- The puzzle's half of the invariants (architecture.md §4.1). In its own
-- --custom migration for the same reason 0002 is: drizzle-kit owns the
-- generated files and would wipe a trigger appended to one on the next
-- `db:generate`. It never touches a --custom migration.

-- A sealed puzzle's economics are immutable, exactly as a sealed album's are.
-- "There is no edit, only delete" has to be enforced where the money is, not
-- merely respected by the routes: a price rewritten after pieces were bought
-- would make the ledger disagree with what the board charges.
--
-- `unlocked_at`, `completed_at` and `deleted_at` are deliberately absent — they
-- are the three things that MUST still move.
CREATE TRIGGER puzzle_frozen BEFORE UPDATE ON puzzle
WHEN old.sealed_at IS NOT NULL AND (
     new.unlock_price <> old.unlock_price
  OR new.piece_price  <> old.piece_price
  OR new.rows         <> old.rows
  OR new.cols         <> old.cols
  OR new.image_key    <> old.image_key
  OR new.hide_locked  <> old.hide_locked)
BEGIN SELECT RAISE(ABORT, 'sealed puzzle economics are immutable'); END;
--> statement-breakpoint
-- Owning a piece is a fact with no fields to revise: there is no quantity to
-- increment the way a sticker holding has, so every UPDATE is a mistake.
-- Matches `sticker_frozen`, which blocks updates and leaves deletes to the
-- foreign keys.
CREATE TRIGGER puzzle_piece_frozen BEFORE UPDATE ON puzzle_piece
BEGIN SELECT RAISE(ABORT, 'puzzle piece rows are immutable'); END;
