CREATE TABLE `vector_account` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`email` text NOT NULL,
	`ciphertext` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_claim_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vector_account_email_idx` ON `vector_account` (`email`);--> statement-breakpoint
CREATE INDEX `vector_account_status_idx` ON `vector_account` (`status`);--> statement-breakpoint
ALTER TABLE `vector_file` ADD `account_id` text;