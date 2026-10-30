CREATE TABLE motes_publications (
 app_id text PRIMARY KEY NOT NULL REFERENCES forma_projects(id),
 version_id text NOT NULL REFERENCES forma_versions(id),
 title text NOT NULL,
 token text NOT NULL,
 published_at text NOT NULL,
 updated_at text NOT NULL,
 enabled integer NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000001),
 last_request_id text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX motes_publication_token ON motes_publications(token);
