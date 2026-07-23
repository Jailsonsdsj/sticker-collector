-- Custom SQL migration file, put your code below! --
-- The five invariant triggers (architecture.md §4.1). These live in their own
-- migration, NOT appended to the generated 0001_init.sql: drizzle-kit owns and
-- regenerates that file, and would silently wipe every trigger on the next
-- `db:generate`. drizzle never touches a --custom migration.

-- INVARIANT 1: the ledger is append-only. The wallet is its sum, never a column.
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
--> statement-breakpoint
-- INVARIANT 2: a sealed album's economics never change. Editions are new rows.
CREATE TRIGGER album_sealed_frozen BEFORE UPDATE ON album
WHEN old.sealed_at IS NOT NULL AND (
     new.unlock_price   <> old.unlock_price
  OR new.random_price   <> old.random_price
  OR new.price_common   <> old.price_common   OR new.odds_common   <> old.odds_common
  OR new.price_rare     <> old.price_rare     OR new.odds_rare     <> old.odds_rare
  OR new.price_epic     <> old.price_epic     OR new.odds_epic     <> old.odds_epic
  OR new.price_legendary<> old.price_legendary OR new.odds_legendary<> old.odds_legendary)
BEGIN SELECT RAISE(ABORT, 'sealed album economics are immutable'); END;
--> statement-breakpoint
-- INVARIANT 3: a coin snapshot is written once, at completion, never recomputed.
CREATE TRIGGER occurrence_snapshot_write_once BEFORE UPDATE ON occurrence
WHEN old.reward_snapshot_coins IS NOT NULL
 AND new.reward_snapshot_coins IS NOT old.reward_snapshot_coins
BEGIN SELECT RAISE(ABORT, 'coin snapshot is write-once'); END;
--> statement-breakpoint
-- stickers are immutable after seal
CREATE TRIGGER sticker_frozen BEFORE UPDATE ON sticker
BEGIN SELECT RAISE(ABORT, 'sticker rows are immutable'); END;
