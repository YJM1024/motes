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
