CREATE TABLE `week_report` (
	`user_id` text NOT NULL,
	`week_start` text NOT NULL,
	`body` text NOT NULL,
	`generated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `week_start`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
