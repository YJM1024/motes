CREATE TABLE `motes_generation_progress` (
	`request_id` text PRIMARY KEY NOT NULL,
	`progress_json` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `forma_requests`(`id`) ON UPDATE no action ON DELETE no action
);
