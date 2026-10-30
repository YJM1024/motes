import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("forma_projects", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), title: text("title").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), currentVersionId: text("current_version_id").notNull(),
}, t => [index("forma_projects_owner").on(t.owner)]);
export const versions = sqliteTable("forma_versions", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => projects.id),
  number: integer("number").notNull(), prompt: text("prompt").notNull(), summary: text("summary").notNull(),
  html: text("html").notNull(), createdAt: text("created_at").notNull(), mode: text("mode").notNull(), model: text("model"),
}, t => [uniqueIndex("forma_version_number").on(t.projectId, t.number)]);
export const requests = sqliteTable("forma_requests", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), projectId: text("project_id").notNull(),
  fingerprint: text("fingerprint").notNull(), day: text("day").notNull(), mode: text("mode").notNull(),
  status: text("status").notNull(), createdAt: text("created_at").notNull(), resultVersionId: text("result_version_id"),
}, t => [index("forma_requests_quota").on(t.day, t.mode, t.owner)]);
export const locks = sqliteTable("forma_locks", {
  projectId: text("project_id").primaryKey(), requestId: text("request_id").notNull(), expiresAt: integer("expires_at").notNull(),
});

export const profiles = sqliteTable("motes_profiles", {
  owner: text("owner").primaryKey(), displayName: text("display_name").notNull().default("测试用户"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const workspaces = sqliteTable("motes_workspaces", {
  id: text("id").primaryKey(), owner: text("owner").notNull().references(() => profiles.owner),
  name: text("name").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("motes_workspace_owner").on(t.owner)]);
export const managedProjects = sqliteTable("motes_projects", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(), description: text("description").notNull().default(""),
  archived: integer("archived", {mode:"boolean"}).notNull().default(false), starred: integer("starred", {mode:"boolean"}).notNull().default(false),
  isDefault: integer("is_default", {mode:"boolean"}).notNull().default(false), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("motes_project_workspace").on(t.workspaceId)]);
export const managedApps = sqliteTable("motes_apps", {
  appId: text("app_id").primaryKey().references(() => projects.id),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  projectId: text("project_id").notNull().references(() => managedProjects.id), description: text("description").notNull().default(""),
  archived: integer("archived", {mode:"boolean"}).notNull().default(false), starred: integer("starred", {mode:"boolean"}).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
}, t => [index("motes_app_project").on(t.projectId),index("motes_app_workspace").on(t.workspaceId)]);
export const tags = sqliteTable("motes_tags", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(), color: text("color").notNull().default("#7895B2"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("motes_tag_name").on(t.workspaceId,t.name)]);
export const appTags = sqliteTable("motes_app_tags", {
  appId: text("app_id").notNull().references(() => managedApps.appId), tagId: text("tag_id").notNull().references(() => tags.id),
}, t => [uniqueIndex("motes_app_tag").on(t.appId,t.tagId)]);
