import { database, json, readProject } from '../forma/server';
import { assertOrigin, digest, HttpError, owner } from '../forma/security';
import { MAX_SOURCE_LENGTH, sourceProblem } from './source-validation';

const MAX_REQUEST_BYTES = 1200000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new HttpError(400, '应用或版本编号无效。'); return value; }
function versionName(value: unknown): string { if (typeof value !== 'string' || value.length > 80) throw new HttpError(400, '版本名称最多 80 字。'); return value.trim(); }
export function validateSource(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'HTML 源码须为字符串。');
  if (value.length > MAX_SOURCE_LENGTH) throw new HttpError(413, 'HTML 最多 180000 个字符。');
  const problem = sourceProblem(value);
  if (problem) throw new HttpError(422, problem);
  return value.trim();
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  assertOrigin(request);
  if (Number(request.headers.get('content-length') || 0) > MAX_REQUEST_BYTES) throw new HttpError(413, '源码请求过长。');
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES || new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) throw new HttpError(413, '源码请求过长。');
  try { const body = JSON.parse(text); if (!body || typeof body !== 'object' || Array.isArray(body)) throw 0; return body; } catch { throw new HttpError(400, '请求格式无效。'); }
}
/** One atomic transaction publishes a manually authored immutable version. No model calls. */
export async function saveSource(request: Request, projectId: string) {
  const who = await owner(request), body = await bodyOf(request), db = database(); id(projectId);
  if (Object.keys(body).some(k => !['baseVersionId', 'expectedCurrentVersionId', 'html', 'requestId', 'name'].includes(k))) throw new HttpError(400, '包含不支持的源码字段。');
  const baseId = id(body.baseVersionId), expected = id(body.expectedCurrentVersionId), html = validateSource(body.html);
  if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) throw new HttpError(400, '请求编号无效，请重试。');
  const requestId = body.requestId, name = body.name === undefined ? '' : versionName(body.name);
  const fingerprint = await digest(JSON.stringify(['manual', projectId, baseId, expected, html, name]));
  const priorResult = async () => {
    const prior = await db.prepare('SELECT owner,project_id,fingerprint,mode,status FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;project_id:string;fingerprint:string;mode:string;status:string}>();
    if (!prior) return null;
    if (prior.owner !== who || prior.project_id !== projectId || prior.fingerprint !== fingerprint || prior.mode !== 'manual' || prior.status !== 'done') throw new HttpError(409, '该请求编号已被使用。');
    return json({ project: await readProject(who, projectId), saved: true, source: 'manual' });
  };
  const previous = await priorResult(); if (previous) return previous;
  const project = await readProject(who, projectId), base = project.versions.find(v => v.id === baseId);
  if (!base) throw new HttpError(404, '基础版本不存在或不属于此应用。');
  if (project.currentVersionId !== expected) throw new HttpError(409, '当前版本已变化，请保留草稿并重新打开编辑器核对。');
  if (project.versions.length >= 60) throw new HttpError(429, '单个应用最多保留 60 个版本，请创建副本。');
  const now = new Date().toISOString(), versionId = crypto.randomUUID(), timestamp = Date.now();
  const guard = "EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND request_id=? AND expires_at>?)";
  const lease = [projectId, requestId, timestamp];
  const summary = `手工编辑自 v${base.number}，未调用模型。`;
  let result: D1Result[];
  try {
    result = await db.batch([
      db.prepare('DELETE FROM forma_locks WHERE project_id=? AND expires_at<=?').bind(projectId, timestamp),
      db.prepare(`INSERT INTO forma_locks(project_id,request_id,expires_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM forma_projects p JOIN forma_versions v ON v.project_id=p.id WHERE p.id=? AND p.owner=? AND p.current_version_id=? AND v.id=?) AND (SELECT count(*) FROM forma_versions WHERE project_id=?)<60 AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND expires_at>?)`).bind(projectId,requestId,timestamp+120000,projectId,who,expected,baseId,projectId,projectId,timestamp),
      db.prepare(`INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at,result_version_id) SELECT ?,?,?,?,?,'manual','done',?,? WHERE ${guard}`).bind(requestId,who,projectId,fingerprint,now.slice(0,10),now,versionId,...lease),
      db.prepare(`INSERT INTO forma_versions(id,project_id,number,prompt,summary,html,created_at,mode,model) SELECT ?,?,coalesce((SELECT max(number) FROM forma_versions WHERE project_id=?),0)+1,?,?,?,?, 'manual',NULL WHERE ${guard}`).bind(versionId,projectId,projectId,summary,summary,html,now,...lease),
      db.prepare(`INSERT INTO motes_version_annotations(version_id,name,important,updated_at) SELECT ?,?,0,? WHERE ${guard}`).bind(versionId,name,now,...lease),
      db.prepare(`UPDATE forma_projects SET current_version_id=?,updated_at=? WHERE id=? AND owner=? AND current_version_id=? AND ${guard}`).bind(versionId,now,projectId,who,expected,...lease),
      db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(projectId,requestId),
    ]);
  } catch (error) { const retry = await priorResult(); if (retry) return retry; throw error; }
  if (!result[1].meta.changes) {
    const retry = await priorResult(); if (retry) return retry;
    const current = await readProject(who, projectId);
    if (current.versions.length >= 60) throw new HttpError(429, '单个应用最多保留 60 个版本，请创建副本。');
    throw new HttpError(409, '应用正在处理其他请求或当前版本已变化。草稿已保留，请稍后核对。');
  }
  return json({ project: await readProject(who, projectId), saved: true, source: 'manual' }, 201);
}
export async function updateVersionMetadata(request: Request, projectId: string, versionId: string) {
  const who = await owner(request), body = await bodyOf(request), db = database(); id(projectId); id(versionId);
  if (!Object.keys(body).length || Object.keys(body).some(k => !['name', 'important'].includes(k))) throw new HttpError(400, '请提供版本名称或重要标记。');
  const name = body.name === undefined ? null : versionName(body.name);
  if (body.important !== undefined && typeof body.important !== 'boolean') throw new HttpError(400, '重要标记须为布尔值。');
  const important = body.important === undefined ? null : body.important ? 1 : 0;
  const result = await db.prepare(`INSERT INTO motes_version_annotations(version_id,name,important,updated_at) SELECT v.id,coalesce(?,''),coalesce(?,0),? FROM forma_versions v JOIN forma_projects p ON p.id=v.project_id WHERE p.id=? AND p.owner=? AND v.id=? ON CONFLICT(version_id) DO UPDATE SET name=coalesce(?,motes_version_annotations.name),important=coalesce(?,motes_version_annotations.important),updated_at=excluded.updated_at`).bind(name,important,new Date().toISOString(),projectId,who,versionId,name,important).run();
  if (!result.meta.changes) throw new HttpError(404, '应用或版本不存在，或不属于当前访客。');
  return json({ project: await readProject(who, projectId) });
}
