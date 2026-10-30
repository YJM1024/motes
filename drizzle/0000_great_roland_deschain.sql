CREATE TABLE `forma_locks` (
	`project_id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `forma_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`current_version_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `forma_projects_owner` ON `forma_projects` (`owner`);--> statement-breakpoint
CREATE TABLE `forma_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`day` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`result_version_id` text
);
--> statement-breakpoint
CREATE INDEX `forma_requests_quota` ON `forma_requests` (`day`,`mode`,`owner`);--> statement-breakpoint
CREATE TABLE `forma_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`prompt` text NOT NULL,
	`summary` text NOT NULL,
	`html` text NOT NULL,
	`created_at` text NOT NULL,
	`mode` text NOT NULL,
	`model` text,
	FOREIGN KEY (`project_id`) REFERENCES `forma_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forma_version_number` ON `forma_versions` (`project_id`,`number`);