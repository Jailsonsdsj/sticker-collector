CREATE TABLE `puzzle` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`image_key` text NOT NULL,
	`unlock_price` integer NOT NULL,
	`piece_price` integer NOT NULL,
	`rows` integer NOT NULL,
	`cols` integer NOT NULL,
	`hide_locked` integer DEFAULT 0 NOT NULL,
	`unlocked_at` text,
	`completed_at` text,
	`sealed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "puzzle_grid_min_1" CHECK("puzzle"."rows" >= 1 AND "puzzle"."cols" >= 1),
	CONSTRAINT "puzzle_prices_non_negative" CHECK("puzzle"."unlock_price" >= 0 AND "puzzle"."piece_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE `puzzle_piece` (
	`id` text PRIMARY KEY NOT NULL,
	`puzzle_id` text NOT NULL,
	`piece_index` integer NOT NULL,
	`acquired_at` text NOT NULL,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `puzzle_piece_unique` ON `puzzle_piece` (`puzzle_id`,`piece_index`);--> statement-breakpoint
ALTER TABLE `ledger` ADD `puzzle_id` text REFERENCES puzzle(id);