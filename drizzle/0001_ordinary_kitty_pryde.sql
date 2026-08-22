CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`target_label` text,
	`detail` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_createdAt_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actorId_idx` ON `audit_log` (`actor_id`);