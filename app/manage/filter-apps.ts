import type { ManagedApp, ManagedProject } from "@/lib/motes/types";

export type AppFilters = { query: string; projectId: string; tagId: string; starred: boolean; archived: string; sort: string };
export function filterApps(apps: ManagedApp[], projects: ManagedProject[], filters: AppFilters) {
  const needle = filters.query.trim().toLocaleLowerCase();
  const archivedProjects = new Set(projects.filter(p => p.archived).map(p => p.id));
  return apps.filter(app => {
    const isArchived = app.archived || archivedProjects.has(app.projectId);
    return (!filters.projectId || app.projectId === filters.projectId)
      && (!filters.tagId || app.tagIds.includes(filters.tagId))
      && (!filters.starred || app.starred)
      && (filters.archived === "all" || isArchived === (filters.archived === "archived"))
      && (!needle || `${app.name} ${app.description}`.toLocaleLowerCase().includes(needle));
  }).sort((a, b) => filters.sort === "name" ? a.name.localeCompare(b.name, "zh-CN") : filters.sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt));
}
