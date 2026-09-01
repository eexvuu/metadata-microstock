CREATE TABLE `run_media` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'image' NOT NULL,
	`object_key` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `generation_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_media_runId_idx` ON `run_media` (`run_id`);--> statement-breakpoint
CREATE INDEX `run_media_userId_idx` ON `run_media` (`user_id`);--> statement-breakpoint
CREATE INDEX `run_media_createdAt_idx` ON `run_media` (`created_at`);