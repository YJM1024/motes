CREATE TABLE `motes_model_usage` (
	`request_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`operation` text NOT NULL,
	`requested_model` text NOT NULL,
	`response_model` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`elapsed_ms` integer,
	`http_status` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`error_code` text,
	FOREIGN KEY (`request_id`) REFERENCES `forma_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `motes_usage_owner_started` ON `motes_model_usage` (`owner`,`started_at`);