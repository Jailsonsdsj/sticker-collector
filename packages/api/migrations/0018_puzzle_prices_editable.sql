-- Custom SQL migration file, put your code below! --
-- The three prices leave the sealed set, by explicit decision.
--
-- `puzzle_frozen` has guarded `unlock_price`, `piece_price` and `random_price`
-- since 0012, on the reasoning that a price rewritten after pieces were bought
-- makes the board disagree with what was paid. That reasoning still holds and
-- is worth stating plainly, because nothing below repeals it: `puzzleSpend`
-- derives "spent" as `unlockPrice + piecePrice * owned` from the CURRENT
-- prices, never from the ledger. Re-price a puzzle halfway through and the info
-- dialog's "time spent" reports minutes nobody spent. The ledger itself is
-- untouched and still records what was actually charged — it is the derived
-- figure that goes soft.
--
-- Editing was wanted anyway, so the guard goes rather than being quietly
-- worked around in a route: a rule enforced by a trigger and bypassed by the
-- code above it is worse than no rule.
--
-- **The grid and the image stay frozen.** They are not economics: `rows`,
-- `cols` and the image define where every owned `puzzle_piece` index sits, so
-- re-cutting a puzzle that already has pieces bought would move them. That is
-- corruption rather than a revised price. `hide_locked` stays with them, as it
-- decides what a locked board is allowed to show.
--
-- Dropped and recreated, not altered: SQLite has no ALTER TRIGGER, and 0015
-- set the precedent. A trigger holds no data, so this is safe to replace.
DROP TRIGGER IF EXISTS puzzle_frozen;
--> statement-breakpoint
CREATE TRIGGER puzzle_frozen BEFORE UPDATE ON puzzle
WHEN old.sealed_at IS NOT NULL AND (
     new.rows         <> old.rows
  OR new.cols         <> old.cols
  OR new.image_key    <> old.image_key
  OR new.image_width  <> old.image_width
  OR new.image_height <> old.image_height
  OR new.hide_locked  <> old.hide_locked)
BEGIN SELECT RAISE(ABORT, 'a sealed puzzle''s grid and image are immutable'); END;
