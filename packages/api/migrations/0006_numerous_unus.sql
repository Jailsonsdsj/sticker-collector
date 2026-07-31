ALTER TABLE `album` ADD `hide_locked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `album` ADD `locked_cover_key` text;--> statement-breakpoint
ALTER TABLE `sticker` ADD `title` text;--> statement-breakpoint
ALTER TABLE `sticker` ADD `description` text;