DROP INDEX `holding_sticker_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `holding_sticker_idx` ON `holding` (`sticker_id`);