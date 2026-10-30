CREATE TABLE motes_candidate_attempts (
 request_id text PRIMARY KEY NOT NULL REFERENCES forma_requests(id),
 candidate_id text NOT NULL REFERENCES motes_candidates(id),
 previous_request_id text NOT NULL,
 fingerprint text NOT NULL,
 created_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX motes_candidate_attempt_lane ON motes_candidate_attempts(candidate_id,created_at);
