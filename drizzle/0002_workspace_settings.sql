CREATE TABLE `motes_settings` (
	`workspace_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`setting_key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `motes_workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `motes_setting_scope_key` ON `motes_settings` (`workspace_id`,`scope_type`,`scope_id`,`setting_key`);