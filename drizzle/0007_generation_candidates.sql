CREATE TABLE `motes_candidate_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`fingerprint` text NOT NULL,
	`prompt` text NOT NULL,
	`mode` text NOT NULL,
	`model` text,
	`app_id` text,
	`base_version_id` text,
	`managed_project_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `forma_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`base_version_id`) REFERENCES `forma_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`managed_project_id`) REFERENCES `motes_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `motes_candidate_owner_created` ON `motes_candidate_groups` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `motes_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`slot` integer NOT NULL,
	`request_id` text NOT NULL,
	`strategy` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`html` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`adopted_app_id` text,
	`adopted_version_id` text,
	`adopt_kind` text,
	FOREIGN KEY (`group_id`) REFERENCES `motes_candidate_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `forma_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adopted_app_id`) REFERENCES `forma_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adopted_version_id`) REFERENCES `forma_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `motes_candidate_slot` ON `motes_candidates` (`group_id`,`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `motes_candidate_request` ON `motes_candidates` (`request_id`);