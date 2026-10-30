CREATE TABLE motes_app_templates (
 id text PRIMARY KEY NOT NULL,
 workspace_id text NOT NULL REFERENCES motes_workspaces(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
 html text NOT NULL CHECK(length(html)<=180000),
 source_app_id text NOT NULL,
 source_version_id text NOT NULL,
 created_at text NOT NULL,
 updated_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX motes_app_template_workspace ON motes_app_templates(workspace_id,updated_at);
