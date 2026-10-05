CREATE TABLE `day_score` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`scheduled` integer NOT NULL,
	`done` integer NOT NULL,
	`scheduled_minutes` integer NOT NULL,
	`done_minutes` integer NOT NULL,
	`frozen_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
