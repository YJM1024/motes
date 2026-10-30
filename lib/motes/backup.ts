import { database, json, modelName } from '../forma/server';
import { assertOrigin, digest, HttpError, owner } from '../forma/security';
import { initializeWorkspace, LIMITS } from './management';
import { readSettings } from './settings';
import { BACKUP_LIMITS, validateBackup } from './backup-format';
import type { BackupDocument, BackupPreview, BackupVersion, ImportResult } from './backup-format';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function invalid(message: string): never { throw new HttpError(400, message); }
function identifier(value: unknown) { if (typeof value !== 'string' || !value || value.length > 128) invalid('备份对象编号无效。'); return value as string; }
function validated(value: unknown) { try { return validateBackup(value); } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : '备份格式无效。'); } }

/** Bound stream bytes before assembling JSON; no unbounded request.text(). */
async function bodyFor(request: Request) {
  assertOrigin(request);
  const max = BACKUP_LIMITS.bytes;
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, '备份超过 2 MiB，请分批导出。');
  const reader = request.body?.getReader(); if (!reader) invalid('请选择备份文件。');
  let size = 0, text = ''; const decoder = new TextDecoder();
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new HttpError(413, '备份超过 2 MiB，请分批导出。'); } text += decoder.decode(value, { stream: true }); }
  text += decoder.decode();
  let body: Record<string, unknown>; try { body = JSON.parse(text); } catch { invalid('备份 JSON 无法解析。'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['action', 'backup', 'previewHash', 'requestId'].includes(k))) invalid('备份请求字段无效。');
  return body;
}

export async function exportBackup(request: Request) {
  const who = await owner(request), db = database(), params = new URL(request.url).searchParams;
  if (Array.from(params.keys()).some(k => !['appId', 'projectId'].includes(k)) || params.has('appId') === params.has('projectId')) invalid('请选择一个应用或一个项目导出。');
  const wid = await initializeWorkspace(who);
  let projectId: string;
  if (params.has('appId')) {
    const app = await db.prepare('SELECT a.project_id FROM motes_apps a JOIN forma_projects p ON p.id=a.app_id WHERE a.app_id=? AND a.workspace_id=? AND p.owner=?').bind(identifier(params.get('appId')), wid, who).first<{project_id:string}>();
    if (!app) throw new HttpError(404, '应用不存在或不属于当前访客。'); projectId = app.project_id;
  } else projectId = identifier(params.get('projectId'));
  const group = await db.prepare('SELECT name,description FROM motes_projects WHERE id=? AND workspace_id=?').bind(projectId, wid).first<{name:string;description:string}>();
  if (!group) throw new HttpError(404, '项目不存在或不属于当前访客。');
  const condition = 'p.owner=? AND a.workspace_id=? AND a.project_id=?' + (params.has('appId') ? ' AND p.id=?' : '');
  const args = [who, wid, projectId, ...params.has('appId') ? [identifier(params.get('appId'))] : []];
  const apps = await db.prepare(`SELECT p.id,p.title,p.current_version_id,a.description,a.starred,a.archived FROM forma_projects p JOIN motes_apps a ON a.app_id=p.id WHERE ${condition} ORDER BY p.id LIMIT 11`).bind(...args).all<{id:string;title:string;current_version_id:string;description:string;starred:number;archived:number}>();
  if (!apps.results.length || apps.results.length > BACKUP_LIMITS.apps) throw new HttpError(413, '每份备份须含 1–10 个应用，请分批导出。');
  const total = await db.prepare(`SELECT count(*) AS n,coalesce(sum(length(CAST(v.html AS BLOB))+length(CAST(v.prompt AS BLOB))+length(CAST(v.summary AS BLOB))),0) AS bytes FROM forma_versions v JOIN forma_projects p ON p.id=v.project_id JOIN motes_apps a ON a.app_id=p.id WHERE ${condition}`).bind(...args).first<{n:number;bytes:number}>();
  if (total!.n > BACKUP_LIMITS.versions || total!.bytes > BACKUP_LIMITS.bytes - 128 * 1024) throw new HttpError(413, '备份超过 200 个版本或 2 MiB 附近的安全预算，请分批导出。');
  const tagRows = await db.prepare(`SELECT DISTINCT t.id,t.name,t.color FROM motes_tags t JOIN motes_app_tags link ON link.tag_id=t.id JOIN motes_apps a ON a.app_id=link.app_id JOIN forma_projects p ON p.id=a.app_id WHERE t.workspace_id=? AND ${condition} ORDER BY t.name,t.id`).bind(wid, ...args).all<{id:string;name:string;color:string}>();
  const tags = tagRows.results.map((t, i) => ({ key: `tag-${i}`, name: t.name, color: t.color }));
  const links = await db.prepare(`SELECT link.app_id,link.tag_id FROM motes_app_tags link JOIN motes_apps a ON a.app_id=link.app_id JOIN forma_projects p ON p.id=a.app_id WHERE ${condition}`).bind(...args).all<{app_id:string;tag_id:string}>();
  const document: BackupDocument = { format: 'motes-backup', version: 1, exportedAt: new Date().toISOString(), project: { ...group, settings: (await readSettings(db, who, modelName(), { projectId })).effective }, tags, apps: [] };
  for (const app of apps.results) {
    const versions = await db.prepare('SELECT v.id,v.number,v.prompt,v.summary,v.html,v.created_at,v.mode,v.model,coalesce(n.name,\'\') AS name,coalesce(n.important,0) AS important FROM forma_versions v LEFT JOIN motes_version_annotations n ON n.version_id=v.id WHERE v.project_id=? ORDER BY v.number LIMIT 61').bind(app.id).all<{id:string;number:number;prompt:string;summary:string;html:string;created_at:string;mode:BackupVersion['mode'];model:string|null;name:string;important:number}>();
    const current = versions.results.find(v => v.id === app.current_version_id); if (!current) throw new HttpError(409, '应用状态已变化，请刷新后重新导出。');
    document.apps.push({ name: app.title, description: app.description, starred: !!app.starred, archived: !!app.archived, tagKeys: links.results.filter(l => l.app_id === app.id).map(l => tags[tagRows.results.findIndex(t => t.id === l.tag_id)]?.key).filter((key):key is string => !!key), settings: (await readSettings(db, who, modelName(), { appId: app.id })).effective, currentVersion: current.number, versions: versions.results.map(v => ({ number:v.number,prompt:v.prompt,summary:v.summary,html:v.html,createdAt:v.created_at,mode:v.mode,model:v.model,name:v.name,important:!!v.important })) });
    if (bytes(document) > BACKUP_LIMITS.bytes - 2048) throw new HttpError(413, '备份超过 2 MiB，请分批导出。');
  }
  return json(validated(document), 200, { 'Content-Disposition': 'attachment; filename="motes-backup.json"', 'X-Content-Type-Options': 'nosniff' });
}

/** Pack json_each parameters below 256 KiB, including escaped HTML. */
function chunks<T>(rows: T[]): T[][] {
  const result: T[][] = []; let current: T[] = [], size = 2;
  for (const row of rows) { const n = bytes(row) + 1; if (current.length && size + n > 256 * 1024) { result.push(current); current = []; size = 2; } current.push(row); size += n; }
  if (current.length) result.push(current); return result;
}

export async function receiveBackup(request: Request) {
  const who = await owner(request), body = await bodyFor(request), document = validated(body.backup);
  if (typeof body.action !== 'string' || !['preview', 'import'].includes(body.action)) invalid('请选择预检或确认导入。');
  const previewHash = await digest(JSON.stringify(document));
  const preview: BackupPreview = { previewHash, projectName: document.project.name, apps: document.apps.map(a => ({ name: a.name, versions: a.versions.length })), appCount: document.apps.length, versionCount: document.apps.reduce((n,a) => n+a.versions.length,0), bytes: bytes(document) };
  if (body.action === 'preview') return json(preview);
  if (body.previewHash !== previewHash) throw new HttpError(409, '备份内容已变化，请重新预检。');
  if (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) invalid('导入请求编号无效。');
  const requestId = body.requestId, db = database();
  const fingerprint = await digest(JSON.stringify(['backup-import', previewHash]));
  const prior = async (): Promise<ImportResult | null> => {
    const row = await db.prepare('SELECT owner,mode,status,fingerprint,project_id,result_version_id FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;mode:string;status:string;fingerprint:string;project_id:string;result_version_id:string}>();
    if (!row) return null;
    if (row.owner !== who || row.mode !== 'backup-import' || row.status !== 'done' || row.fingerprint !== fingerprint) throw new HttpError(409, '该请求编号已被使用。');
    return { projectId: row.project_id, appIds: JSON.parse(row.result_version_id), imported: true };
  };
  const existing = await prior(); if (existing) return json(existing);
  const wid = await initializeWorkspace(who), projectId = crypto.randomUUID(), now = new Date().toISOString();
  const existingTags = await db.prepare('SELECT name FROM motes_tags WHERE workspace_id=?').bind(wid).all<{name:string}>();
  const newTags = document.tags.filter(t => !existingTags.results.some(e => e.name === t.name)).length;
  const appIds = document.apps.map(() => crypto.randomUUID());
  const records = document.apps.map((app, i) => ({ ...app, id: appIds[i], versions: app.versions.map(v => ({ ...v, id: crypto.randomUUID(), appId: appIds[i] })) }));
  const gate = 'EXISTS(SELECT 1 FROM motes_projects WHERE id=? AND workspace_id=?)';
  const statements: D1PreparedStatement[] = [db.prepare('INSERT INTO motes_projects(id,workspace_id,name,description,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM motes_workspaces WHERE id=? AND owner=?) AND (SELECT count(*) FROM motes_projects WHERE workspace_id=?)<? AND (SELECT count(*) FROM forma_projects WHERE owner=?)+?<=? AND (SELECT count(*) FROM motes_tags WHERE workspace_id=?)+?<=?').bind(projectId,wid,`${document.project.name.slice(0,73)} · 导入`,document.project.description,now,now,wid,who,wid,LIMITS.projects,who,records.length,LIMITS.apps,wid,newTags,LIMITS.tags)];
  // Each bulk write depends on the new project gate, within one atomic D1 batch.
  const insert = (table: string, columns: string[], rows: Record<string, unknown>[], ignore = false) => {
    for (const part of chunks(rows)) statements.push(db.prepare(`INSERT ${ignore?'OR IGNORE ':''}INTO ${table}(${columns.join(',')}) SELECT ${columns.map(c => `json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE ${gate}`).bind(JSON.stringify(part),projectId,wid));
  };
  insert('forma_projects',['id','owner','title','created_at','updated_at','current_version_id'],records.map(a=>({id:a.id,owner:who,title:a.name,created_at:now,updated_at:now,current_version_id:a.versions.find(v=>v.number===a.currentVersion)!.id})));
  insert('forma_versions',['id','project_id','number','prompt','summary','html','created_at','mode','model'],records.flatMap(a=>a.versions.map(v=>({id:v.id,project_id:a.id,number:v.number,prompt:v.prompt,summary:v.summary,html:v.html,created_at:v.createdAt,mode:v.mode,model:v.model}))));
  insert('motes_version_annotations',['version_id','name','important','updated_at'],records.flatMap(a=>a.versions.filter(v=>v.name||v.important).map(v=>({version_id:v.id,name:v.name,important:v.important,updated_at:now}))));
  insert('motes_apps',['app_id','workspace_id','project_id','description','starred','archived','updated_at'],records.map(a=>({app_id:a.id,workspace_id:wid,project_id:projectId,description:a.description,starred:a.starred,archived:a.archived,updated_at:now})));
  insert('motes_tags',['id','workspace_id','name','color','created_at','updated_at'],document.tags.map(t=>({id:crypto.randomUUID(),workspace_id:wid,name:t.name,color:t.color,created_at:now,updated_at:now})),true);
  const tagLinks=records.flatMap(a=>a.tagKeys.map(key=>({appId:a.id,name:document.tags.find(t=>t.key===key)!.name})));
  for (const part of chunks(tagLinks)) statements.push(db.prepare(`INSERT INTO motes_app_tags(app_id,tag_id) SELECT json_extract(j.value,'$.appId'),t.id FROM json_each(?) j JOIN motes_tags t ON t.name=json_extract(j.value,'$.name') AND t.workspace_id=? WHERE ${gate}`).bind(JSON.stringify(part),wid,projectId,wid));
  const settings=[{scope:'project',id:projectId,settings:document.project.settings},...records.map(a=>({scope:'app',id:a.id,settings:a.settings}))].flatMap(s=>Object.entries(s.settings).map(([key,value])=>({workspace_id:wid,scope_type:s.scope,scope_id:s.id,setting_key:key,value_json:JSON.stringify(value),updated_at:now})));
  insert('motes_settings',['workspace_id','scope_type','scope_id','setting_key','value_json','updated_at'],settings);
  const result: ImportResult = { projectId, appIds, imported: true };
  statements.push(db.prepare(`INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at,result_version_id) SELECT ?,?,?,?,?,'backup-import','done',?,? WHERE ${gate}`).bind(requestId,who,projectId,fingerprint,now.slice(0,10),now,JSON.stringify(appIds),projectId,wid));
  let committed: D1Result[];
  try { committed = await db.batch(statements); } catch (error) { const retry = await prior(); if (retry) return json(retry); throw error; }
  if (!committed[0].meta.changes) { const retry = await prior(); if (retry) return json(retry); throw new HttpError(429, '项目、应用或标签数量不足以容纳备份，请整理后再试。'); }
  return json(result, 201);
}
