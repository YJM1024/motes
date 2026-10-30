CREATE TABLE motes_generation_results (
 request_id text PRIMARY KEY NOT NULL REFERENCES forma_requests(id),
 owner text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('generation','candidate')),
 result_json text NOT NULL CHECK(length(result_json)<=400000),
 created_at text NOT NULL,
 expires_at text NOT NULL,
 committed_at text
);
--> statement-breakpoint
CREATE INDEX motes_result_owner_expiry ON motes_generation_results(owner,expires_at);
