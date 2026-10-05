-- Custom SQL migration file, put your code below! --
-- A closed day's grade is evidence, so it is append-only like the ledger.
--
-- Once a day has a row, an edit to a routine — its weekdays, its effort, its
-- deletion — must not be able to rewrite how that day went. The report only
-- ever inserts (`INSERT OR IGNORE`), so any UPDATE or DELETE here is a bug.
CREATE TRIGGER day_score_no_update BEFORE UPDATE ON day_score
BEGIN SELECT RAISE(ABORT, 'day_score is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER day_score_no_delete BEFORE DELETE ON day_score
BEGIN SELECT RAISE(ABORT, 'day_score is append-only'); END;
