CREATE TABLE `run_rows` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`folder_name` text NOT NULL,
	`rows` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `generation_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_rows_userId_idx` ON `run_rows` (`user_id`);--> statement-breakpoint
CREATE INDEX `run_rows_expiresAt_idx` ON `run_rows` (`expires_at`);