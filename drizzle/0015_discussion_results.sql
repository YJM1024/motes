CREATE TABLE motes_discussion_results (
 request_id text PRIMARY KEY NOT NULL REFERENCES forma_requests(id),
 owner text NOT NULL,
 thread_id text NOT NULL REFERENCES motes_discussion_threads(id),
 context_app_id text,
 context_project_id text,
 reply text NOT NULL CHECK(length(reply) BETWEEN 1 AND 8000),
 observation_json text NOT NULL CHECK(length(observation_json)<=4096),
 created_at text NOT NULL,
 expires_at text NOT NULL,
 committed_at text
);
--> statement-breakpoint
CREATE INDEX motes_discussion_result_owner_expiry ON motes_discussion_results(owner,expires_at);
