CREATE TABLE `motes_discussion_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text,
	`managed_project_id` text,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `motes_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `forma_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`managed_project_id`) REFERENCES `motes_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `motes_discussion_app` ON `motes_discussion_threads` (`workspace_id`,`app_id`);--> statement-breakpoint
CREATE INDEX `motes_discussion_workspace` ON `motes_discussion_threads` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `motes_discussion_turns` (
	`request_id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`prompt` text NOT NULL,
	`reply` text,
	`error` text,
	`context_version_id` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`request_id`) REFERENCES `forma_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `motes_discussion_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`context_version_id`) REFERENCES `forma_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `motes_discussion_turn_thread` ON `motes_discussion_turns` (`thread_id`);