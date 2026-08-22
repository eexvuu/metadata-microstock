CREATE TABLE `usage_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`runs` integer DEFAULT 0 NOT NULL,
	`files` integer DEFAULT 0 NOT NULL
);
