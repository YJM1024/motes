CREATE TABLE `motes_app_runtime_data` (
  `app_id` text NOT NULL,
  `data_key` text NOT NULL,
  `value_json` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`app_id`, `data_key`),
  FOREIGN KEY (`app_id`) REFERENCES `forma_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `motes_runtime_data_updated` ON `motes_app_runtime_data` (`app_id`,`updated_at`);
--> statement-breakpoint
ALTER TABLE `forma_requests` ADD `visitor_id` text;
--> statement-breakpoint
CREATE INDEX `forma_requests_visitor_quota` ON `forma_requests` (`day`,`mode`,`visitor_id`);