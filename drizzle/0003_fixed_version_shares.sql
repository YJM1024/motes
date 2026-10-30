CREATE TABLE `motes_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`version_id` text NOT NULL,
	`title` text NOT NULL,
	`token` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`app_id`) REFERENCES `forma_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `forma_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `motes_share_token` ON `motes_shares` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `motes_share_request` ON `motes_shares` (`request_id`);--> statement-breakpoint
CREATE INDEX `motes_share_app` ON `motes_shares` (`app_id`,`revoked_at`);