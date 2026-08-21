CREATE TABLE `routine_slot` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_slot_task_weekday_unique` ON `routine_slot` (`task_id`,`weekday`);