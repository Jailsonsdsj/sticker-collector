-- Custom SQL migration file, put your code below! --
-- A week's report is evidence, so it is append-only like day_score.
--
-- Built once, the first time it is read after Sunday 22:00, and never again:
-- the route only ever inserts (`INSERT OR IGNORE`), so any UPDATE or DELETE
-- here is a bug.
CREATE TRIGGER week_report_no_update BEFORE UPDATE ON week_report
BEGIN SELECT RAISE(ABORT, 'week_report is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER week_report_no_delete BEFORE DELETE ON week_report
BEGIN SELECT RAISE(ABORT, 'week_report is append-only'); END;
