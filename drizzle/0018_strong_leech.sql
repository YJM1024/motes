ALTER TABLE `motes_model_usage` ADD `call_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `motes_model_usage` ADD `usage_complete` integer DEFAULT 1 NOT NULL;