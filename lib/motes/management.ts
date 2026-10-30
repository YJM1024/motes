import { database, json, payload } from '../forma/server';
import { HttpError, owner } from '../forma/security';
import type { ManagedApp, ManagedProject, Tag, WorkspaceFilters, WorkspaceSnapshot } from './types';

export const LIMITS = { projects: 50, tags: 50, tagsPerApp: 10, apps: 100 };
const defaultWorkspace = (who: string) => `workspace:${who}`;
const defaultProject = (who: string) => `project:${who}`;
type Row = Record<string, string | number>;
function text(value: unknown, label: string, max = 80, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new HttpError(400, `${label}须为${allowEmpty ? '0' : '1'}–${max}字。`);
  return value.trim();
}
function id(value: unknown) { return text(value, '编号', 128); }
function flag(value: unknown) { if (typeof value !== 'boolean') throw new HttpError(400, '状态必须是布尔值。'); return value ? 1 : 0; }
function color(value: unknown) { if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new HttpError(400, '标签颜色须为六位十六进制颜色。'); return value.toUpperCase(); }
function fields(body: Record<string, unknown>, permitted: string[]) {
  if (Object.keys(body).some(key => !['action', 'workspaceId', ...permitted].includes(key))) throw new HttpError(400, '包含不支持的字段。');
}

/** This fills metadata only: no existing HTML, version, ownership or pointer changes. */
export async function initializeWorkspace(who: string) {
  const db = database(), now = new Date().toISOString(), wid = defaultWorkspace(who), pid = defaultProject(who);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO motes_profiles(owner,display_name,created_at,updated_at) VALUES(?,?,?,?)').bind(who, '测试用户', now, now),
    db.prepare('INSERT OR IGNORE INTO motes_workspaces(id,owner,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(wid, who, '我的测试空间', now, now),
    db.prepare('INSERT OR IGNORE INTO motes_projects(id,workspace_id,name,is_default,created_at,updated_at) VALUES(?,?,?,1,?,?)').bind(pid, wid, '默认项目', now, now),
    db.prepare('INSERT OR IGNORE INTO motes_apps(app_id,workspace_id,project_id,updated_at) SELECT id,?,?,updated_at FROM forma_projects WHERE owner=?').bind(wid, pid, who),
  ]);
  return wid;
}

async function scope(who: string, requested: unknown) {
  const wid = await initializeWorkspace(who);
  if (requested !== undefined && id(requested) !== wid) throw new HttpError(404, '工作空间不存在或不属于当前访客。');
  return wid;
}
async function requireProject(wid: string, projectId: unknown) {
  const row = await database().prepare('SELECT * FROM motes_projects WHERE id=? AND workspace_id=?').bind(id(projectId), wid).first<Row>();
  if (!row) throw new HttpError(404, '项目不存在或不属于当前工作空间。');
  return row;
}
async function requireTag(wid: string, tagId: unknown) {
  const row = await database().prepare('SELECT id FROM motes_tags WHERE id=? AND workspace_id=?').bind(id(tagId), wid).first<Row>();
  if (!row) throw new HttpError(404, '标签不存在或不属于当前工作空间。');
  return row;
}
async function requireApp(who: string, wid: string, appId: unknown) {
  const row = await database().prepare('SELECT a.* FROM motes_apps a JOIN forma_projects p ON p.id=a.app_id WHERE a.app_id=? AND a.workspace_id=? AND p.owner=?').bind(id(appId), wid, who).first<Row>();
  if (!row) throw new HttpError(404, '应用不存在或不属于当前工作空间。');
  return row;
}

export function readFilters(url: URL): WorkspaceFilters {
  const p = url.searchParams;
  const filters: WorkspaceFilters = { archived: 'active', sort: 'updated' };
  for (const field of ['workspaceId', 'projectId', 'tagId'] as const) if (p.has(field)) filters[field] = id(p.get(field));
  if (p.has('q')) filters.q = text(p.get('q'), '搜索词', 100, true);
  if (p.has('archived')) { const value = p.get('archived'); if (!['active', 'archived', 'all'].includes(value!)) throw new HttpError(400, '归档筛选无效。'); filters.archived = value as WorkspaceFilters['archived']; }
  if (p.has('sort')) { const value = p.get('sort'); if (!['updated', 'created', 'name'].includes(value!)) throw new HttpError(400, '排序无效。'); filters.sort = value as WorkspaceFilters['sort']; }
  for (const field of ['starred', 'listOnly'] as const) if (p.has(field)) { const value = p.get(field); if (value !== 'true' && value !== 'false') throw new HttpError(400, '筛选状态无效。'); filters[field] = value === 'true'; }
  return filters;
}

export async function workspaceSnapshot(who: string, wid: string, filters: WorkspaceFilters = {}): Promise<WorkspaceSnapshot> {
  const db = database();
  if (filters.projectId) await requireProject(wid, filters.projectId);
  if (filters.tagId) await requireTag(wid, filters.tagId);
  const profile = (await db.prepare('SELECT display_name,created_at,updated_at FROM motes_profiles WHERE owner=?').bind(who).first<Row>())!;
  const workspace = (await db.prepare('SELECT * FROM motes_workspaces WHERE id=? AND owner=?').bind(wid, who).first<Row>())!;
  const groups = await db.prepare('SELECT g.*,count(a.app_id) AS app_count,max(g.updated_at,coalesce(max(max(p.updated_at,a.updated_at)),g.updated_at)) AS effective_updated FROM motes_projects g LEFT JOIN motes_apps a ON a.project_id=g.id AND a.workspace_id=g.workspace_id LEFT JOIN forma_projects p ON p.id=a.app_id AND p.owner=? WHERE g.workspace_id=? GROUP BY g.id ORDER BY g.is_default DESC,effective_updated DESC,g.id').bind(who, wid).all<Row>();
  const projects: ManagedProject[] = groups.results.map(r => ({ id: String(r.id), workspaceId: wid, name: String(r.name), description: String(r.description), archived: !!r.archived, starred: !!r.starred, isDefault: !!r.is_default, createdAt: String(r.created_at), updatedAt: String(r.effective_updated), appCount: Number(r.app_count) }));
  const tagRows = await db.prepare('SELECT * FROM motes_tags WHERE workspace_id=? ORDER BY name,id').bind(wid).all<Row>();
  const tags: Tag[] = tagRows.results.map(r => ({ id: String(r.id), workspaceId: wid, name: String(r.name), color: String(r.color), createdAt: String(r.created_at), updatedAt: String(r.updated_at) }));
  const clauses = ['a.workspace_id=?', 'p.owner=?'], values: (string | number)[] = [wid, who];
  if (filters.projectId) { clauses.push('a.project_id=?'); values.push(filters.projectId); }
  const archived = filters.archived ?? 'active';
  if (archived === 'active') clauses.push('a.archived=0 AND g.archived=0');
  if (archived === 'archived') clauses.push('(a.archived=1 OR g.archived=1)');
  if (filters.starred !== undefined) { clauses.push('a.starred=?'); values.push(filters.starred ? 1 : 0); }
  if (filters.tagId) { clauses.push('EXISTS(SELECT 1 FROM motes_app_tags at WHERE at.app_id=a.app_id AND at.tag_id=?)'); values.push(filters.tagId); }
  if (filters.q) {
    clauses.push("(instr(lower(p.title),lower(?))>0 OR instr(lower(a.description),lower(?))>0 OR EXISTS(SELECT 1 FROM motes_app_tags at JOIN motes_tags t ON t.id=at.tag_id WHERE at.app_id=a.app_id AND t.workspace_id=a.workspace_id AND instr(lower(t.name),lower(?))>0))");
    values.push(filters.q, filters.q, filters.q);
  }
  const order = filters.sort === 'name' ? 'p.title COLLATE NOCASE ASC' : filters.sort === 'created' ? 'p.created_at DESC' : 'max(p.updated_at,a.updated_at) DESC';
  const rows = filters.listOnly ? { results: [] as Row[] } : await db.prepare(`SELECT a.*,p.title,p.created_at,p.current_version_id,max(p.updated_at,a.updated_at) AS effective_updated FROM motes_apps a JOIN forma_projects p ON p.id=a.app_id JOIN motes_projects g ON g.id=a.project_id AND g.workspace_id=a.workspace_id WHERE ${clauses.join(' AND ')} ORDER BY ${order},a.app_id LIMIT 100`).bind(...values).all<Row>();
  const links = await db.prepare('SELECT at.app_id,at.tag_id FROM motes_app_tags at JOIN motes_apps a ON a.app_id=at.app_id JOIN motes_tags t ON t.id=at.tag_id WHERE a.workspace_id=? AND t.workspace_id=?').bind(wid, wid).all<Row>();
  const apps: ManagedApp[] = rows.results.map(r => ({ id: String(r.app_id), workspaceId: wid, projectId: String(r.project_id), name: String(r.title), description: String(r.description), archived: !!r.archived, starred: !!r.starred, tagIds: links.results.filter(t => t.app_id === r.app_id).map(t => String(t.tag_id)), currentVersionId: String(r.current_version_id), createdAt: String(r.created_at), updatedAt: String(r.effective_updated) }));
  return { profile: { displayName: String(profile.display_name), kind: 'test', createdAt: String(profile.created_at), updatedAt: String(profile.updated_at) }, workspace: { id: wid, name: String(workspace.name), defaultProjectId: defaultProject(who), createdAt: String(workspace.created_at), updatedAt: String(workspace.updated_at) }, projects, tags, apps, filters: { archived, sort: 'updated', ...filters }, limits: LIMITS };
}

export async function getWorkspace(request: Request) {
  const who = await owner(request), filters = readFilters(new URL(request.url)), wid = await scope(who, filters.workspaceId);
  return json(await workspaceSnapshot(who, wid, filters));
}

export async function manageWorkspace(request: Request) {
  const who = await owner(request), body = await payload(request), wid = await scope(who, body.workspaceId), db = database(), now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const update = (table: string, key: string, identifier: string, changes: Record<string, string | number>) => {
    if (!Object.keys(changes).length) throw new HttpError(400, '请提供要修改的字段。');
    changes.updated_at = now;
    statements.push(db.prepare(`UPDATE ${table} SET ${Object.keys(changes).map(k => `${k}=?`).join(',')} WHERE ${key}=? AND workspace_id=?`).bind(...Object.values(changes), identifier, wid));
  };
  switch (body.action) {
    case 'profile.update': {
      fields(body, ['displayName']);
      statements.push(db.prepare('UPDATE motes_profiles SET display_name=?,updated_at=? WHERE owner=?').bind(text(body.displayName, '显示名称', 40), now, who)); break;
    }
    case 'project.create': {
      fields(body, ['name', 'description']);
      statements.push(db.prepare('INSERT INTO motes_projects(id,workspace_id,name,description,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM motes_projects WHERE workspace_id=?)<?').bind(crypto.randomUUID(), wid, text(body.name, '项目名称'), body.description === undefined ? '' : text(body.description, '简介', 1000, true), now, now, wid, LIMITS.projects)); break;
    }
    case 'project.update': {
      fields(body, ['projectId', 'name', 'description', 'archived', 'starred']);
      const project = await requireProject(wid, body.projectId), changes: Record<string, string | number> = {};
      if (body.name !== undefined) changes.name = text(body.name, '项目名称');
      if (body.description !== undefined) changes.description = text(body.description, '简介', 1000, true);
      if (body.starred !== undefined) changes.starred = flag(body.starred);
      if (body.archived !== undefined) { changes.archived = flag(body.archived); if (project.is_default && changes.archived) throw new HttpError(409, '默认项目用于收纳新应用，不能归档。'); }
      update('motes_projects', 'id', String(project.id), changes); break;
    }
    case 'app.update': {
      fields(body, ['appId', 'projectId', 'name', 'description', 'archived', 'starred', 'tagIds']);
      const app = await requireApp(who, wid, body.appId), appId = String(app.app_id), changes: Record<string, string | number> = {};
      if (body.projectId !== undefined) { const project = await requireProject(wid, body.projectId); if (project.archived) throw new HttpError(409, '请先恢复目标项目，再移动应用。'); changes.project_id = String(project.id); }
      if (body.description !== undefined) changes.description = text(body.description, '简介', 1000, true);
      if (body.starred !== undefined) changes.starred = flag(body.starred);
      if (body.archived !== undefined) changes.archived = flag(body.archived);
      if (body.name !== undefined) { const name = text(body.name, '应用名称'); statements.push(db.prepare('UPDATE forma_projects SET title=?,updated_at=? WHERE id=? AND owner=?').bind(name, now, appId, who)); changes.updated_at = now; }
      if (body.tagIds !== undefined) {
        if (!Array.isArray(body.tagIds) || body.tagIds.length > LIMITS.tagsPerApp) throw new HttpError(400, `每个应用最多${LIMITS.tagsPerApp}个标签。`);
        const ids = body.tagIds.map(id); if (new Set(ids).size !== ids.length) throw new HttpError(400, '标签不能重复。');
        for (const tagId of ids) await requireTag(wid, tagId);
        statements.push(db.prepare('DELETE FROM motes_app_tags WHERE app_id=?').bind(appId));
        for (const tagId of ids) statements.push(db.prepare('INSERT INTO motes_app_tags(app_id,tag_id) VALUES(?,?)').bind(appId, tagId));
        changes.updated_at = now;
      }
      update('motes_apps', 'app_id', appId, changes); break;
    }
    case 'tag.create': {
      fields(body, ['name', 'color']);
      statements.push(db.prepare('INSERT INTO motes_tags(id,workspace_id,name,color,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM motes_tags WHERE workspace_id=?)<?').bind(crypto.randomUUID(), wid, text(body.name, '标签名称', 40), body.color === undefined ? '#7895B2' : color(body.color), now, now, wid, LIMITS.tags)); break;
    }
    case 'tag.update': {
      fields(body, ['tagId', 'name', 'color']);
      const tag = await requireTag(wid, body.tagId), changes: Record<string, string | number> = {};
      if (body.name !== undefined) changes.name = text(body.name, '标签名称', 40);
      if (body.color !== undefined) changes.color = color(body.color);
      update('motes_tags', 'id', String(tag.id), changes); break;
    }
    case 'tag.delete': {
      fields(body, ['tagId']); const tag = await requireTag(wid, body.tagId);
      statements.push(db.prepare('DELETE FROM motes_app_tags WHERE tag_id=?').bind(tag.id), db.prepare('DELETE FROM motes_tags WHERE id=? AND workspace_id=?').bind(tag.id, wid)); break;
    }
    default: throw new HttpError(400, '不支持的管理操作。');
  }
  statements.push(db.prepare('UPDATE motes_workspaces SET updated_at=? WHERE id=? AND owner=?').bind(now, wid, who));
  try {
    const result = await db.batch(statements);
    if ((body.action === 'project.create' || body.action === 'tag.create') && !result[0].meta.changes) throw new HttpError(429, '已达到工作空间数量上限，请整理已有项目或标签。');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && /unique constraint|motes_tag_name/i.test(error.message)) throw new HttpError(409, '该工作空间已有同名标签。');
    throw error;
  }
  return json(await workspaceSnapshot(who, wid, { archived: 'all' }));
}
