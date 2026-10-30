/** Anonymous visitors receive separate test profiles and a private default workspace. */
export type TestProfile = { displayName: string; kind: 'test'; createdAt: string; updatedAt: string };
export type Workspace = { id: string; name: string; defaultProjectId: string; createdAt: string; updatedAt: string };
export type ManagedProject = { id: string; workspaceId: string; name: string; description: string; archived: boolean; starred: boolean; isDefault: boolean; createdAt: string; updatedAt: string; appCount: number };
export type Tag = { id: string; workspaceId: string; name: string; color: string; createdAt: string; updatedAt: string };
/** id/currentVersionId are the existing forma project/application identifiers. No HTML or versions are returned. */
export type ManagedApp = { id: string; workspaceId: string; projectId: string; name: string; description: string; archived: boolean; starred: boolean; tagIds: string[]; currentVersionId: string; createdAt: string; updatedAt: string };
export type WorkspaceFilters = { workspaceId?: string; projectId?: string; q?: string; tagId?: string; archived?: 'active' | 'archived' | 'all'; starred?: boolean; sort?: 'updated' | 'created' | 'name'; listOnly?: boolean };
export type WorkspaceSnapshot = { profile: TestProfile; workspace: Workspace; projects: ManagedProject[]; tags: Tag[]; apps: ManagedApp[]; filters: WorkspaceFilters; limits: { projects: number; tags: number; tagsPerApp: number; apps: number } };
export type WorkspaceAction = (
  | { action: 'profile.update'; displayName: string }
  | { action: 'project.create'; name: string; description?: string }
  | { action: 'project.update'; projectId: string; name?: string; description?: string; archived?: boolean; starred?: boolean }
  | { action: 'app.update'; appId: string; projectId?: string; name?: string; description?: string; archived?: boolean; starred?: boolean; tagIds?: string[] }
  | { action: 'tag.create'; name: string; color?: string }
  | { action: 'tag.update'; tagId: string; name?: string; color?: string }
  | { action: 'tag.delete'; tagId: string }
) & { workspaceId?: string };
// GET filters affect apps; project/tag metadata remains complete for navigation.
// listOnly=true returns project/tag navigation without the app list.
// POST returns an unfiltered snapshot so clients can update their local filters.
