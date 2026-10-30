CREATE TABLE `motes_version_annotations` (
	`version_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`important` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `forma_versions`(`id`) ON UPDATE no action ON DELETE no action
);
