CREATE TABLE `token_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`job_id` text,
	`file_id` text,
	`note` text,
	`actor_email` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `token_ledger_userId_idx` ON `token_ledger` (`user_id`);--> statement-breakpoint
CREATE INDEX `token_ledger_createdAt_idx` ON `token_ledger` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `token_ledger_file_reason_idx` ON `token_ledger` (`file_id`,`reason`);--> statement-breakpoint
CREATE TABLE `vector_file` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'awaiting_upload' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`source_key` text NOT NULL,
	`svg_key` text,
	`eps_key` text,
	`leased_at` integer,
	`lease_by` text,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `vector_job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vector_file_jobId_idx` ON `vector_file` (`job_id`);--> statement-breakpoint
CREATE INDEX `vector_file_userId_idx` ON `vector_file` (`user_id`);--> statement-breakpoint
CREATE INDEX `vector_file_status_idx` ON `vector_file` (`status`);--> statement-breakpoint
CREATE INDEX `vector_file_expiresAt_idx` ON `vector_file` (`expires_at`);--> statement-breakpoint
CREATE TABLE `vector_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`files_total` integer DEFAULT 0 NOT NULL,
	`files_done` integer DEFAULT 0 NOT NULL,
	`files_failed` integer DEFAULT 0 NOT NULL,
	`tokens_charged` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vector_job_userId_idx` ON `vector_job` (`user_id`);--> statement-breakpoint
CREATE INDEX `vector_job_createdAt_idx` ON `vector_job` (`created_at`);