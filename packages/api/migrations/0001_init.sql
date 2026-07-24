CREATE TABLE `album` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`cover_key` text NOT NULL,
	`derived_from_album_id` text,
	`unlock_price` integer NOT NULL,
	`random_price` integer NOT NULL,
	`price_common` integer NOT NULL,
	`price_rare` integer NOT NULL,
	`price_epic` integer NOT NULL,
	`price_legendary` integer NOT NULL,
	`odds_common` integer NOT NULL,
	`odds_rare` integer NOT NULL,
	`odds_epic` integer NOT NULL,
	`odds_legendary` integer NOT NULL,
	`unlocked_at` text,
	`completed_at` text,
	`sealed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`edition_number` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`derived_from_album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "album_odds_sum_100" CHECK("album"."odds_common" + "album"."odds_rare" + "album"."odds_epic" + "album"."odds_legendary" = 100)
);
--> statement-breakpoint
CREATE TABLE `auth_attempt` (
	`ip_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`ip_hash`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `epic` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`accent` text NOT NULL,
	`coin_goal_album_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coin_goal_album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `holding` (
	`id` text PRIMARY KEY NOT NULL,
	`sticker_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`first_acquired_at` text NOT NULL,
	FOREIGN KEY (`sticker_id`) REFERENCES `sticker`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "holding_quantity_min_1" CHECK("holding"."quantity" >= 1)
);
--> statement-breakpoint
CREATE INDEX `holding_sticker_idx` ON `holding` (`sticker_id`);--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount_coins` integer NOT NULL,
	`reason` text NOT NULL,
	`occurrence_id` text,
	`album_id` text,
	`sticker_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`occurrence_id`) REFERENCES `occurrence`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sticker_id`) REFERENCES `sticker`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ledger_user_created_idx` ON `ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `mutation` (
	`key` text PRIMARY KEY NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `occurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`scheduled_on` text NOT NULL,
	`status` text NOT NULL,
	`completed_at` text,
	`reward_snapshot_coins` integer,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_task_scheduled_unique` ON `occurrence` (`task_id`,`scheduled_on`);--> statement-breakpoint
CREATE TABLE `sticker` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`image_key` text NOT NULL,
	`tier` text NOT NULL,
	`slot_index` integer NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sticker_album_slot_unique` ON `sticker` (`album_id`,`slot_index`);--> statement-breakpoint
CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`epic_id` text,
	`title` text NOT NULL,
	`description` text,
	`url` text,
	`effort_minutes` integer NOT NULL,
	`reward_coins` integer NOT NULL,
	`priority` text NOT NULL,
	`type` text NOT NULL,
	`weekdays` integer,
	`starts_on` text,
	`ends_on` text,
	`due_at` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`epic_id`) REFERENCES `epic`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_user_type_deleted_idx` ON `task` (`user_id`,`type`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_key_hash` text NOT NULL,
	`kdf_salt` text NOT NULL,
	`kdf_iterations` integer NOT NULL,
	`timezone` text NOT NULL,
	`created_at` text NOT NULL
);
