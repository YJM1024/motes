CREATE TABLE IF NOT EXISTS `motes_app_tags` (
	`app_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `motes_apps`(`app_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `motes_tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `motes_app_tag` ON `motes_app_tags` (`app_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `motes_apps` (
	`app_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `forma_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `motes_workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `motes_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `motes_app_project` ON `motes_apps` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `motes_app_workspace` ON `motes_apps` (`workspace_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `motes_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `motes_workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `motes_project_workspace` ON `motes_projects` (`workspace_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `motes_profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '测试用户' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `motes_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#7895B2' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `motes_workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `motes_tag_name` ON `motes_tags` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `motes_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `motes_profiles`(`owner`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `motes_workspace_owner` ON `motes_workspaces` (`owner`);
