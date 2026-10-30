CREATE TABLE motes_version_config (
 version_id text PRIMARY KEY NOT NULL REFERENCES forma_versions(id),
 operation text NOT NULL CHECK(operation IN ('generate','modify','element','manual','candidate','template-copy','fork')),
 base_version_id text,
 settings_json text CHECK(settings_json IS NULL OR length(settings_json)<=4096),
 created_at text NOT NULL
);
--> statement-breakpoint
ALTER TABLE motes_candidate_groups ADD COLUMN generation_settings text CHECK(generation_settings IS NULL OR length(generation_settings)<=4096);
