ALTER TABLE motes_candidate_groups ADD COLUMN candidate_count integer NOT NULL DEFAULT 2 CHECK(candidate_count IN (2,3,4));
--> statement-breakpoint
ALTER TABLE motes_candidate_groups ADD COLUMN generation_context text;
