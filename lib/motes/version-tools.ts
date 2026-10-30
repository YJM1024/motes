import { database, json, payload, readProject } from '../forma/server';
import { digest, HttpError, owner } from '../forma/security';
import { initializeWorkspace, LIMITS } from './management';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function identifier(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new HttpError(400, '版本或项目编号无效。');
  return value;
}

/** Copy an immutable version, never generate HTML or alter the source pointer. */
export async function forkVersion(request: Request, sourceId: string) {
  const who = await owner(request), body = await payload(request), db = database();
  identifier(sourceId);
  if (Object.keys(body).some(k => !['versionId', 'targetProjectId', 'title', 'requestId'].includes(k))) throw new HttpError(400, '包含不支持的字段。');
  const versionId = identifier(body.versionId);
  if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) throw new HttpError(400, '请求编号无效，请重试。');
  const requestId = body.requestId;
  if (body.targetProjectId !== undefined) identifier(body.targetProjectId);
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 80)) throw new HttpError(400, '副本名称须为 1–80 字。');
  const fingerprint = await digest(JSON.stringify(['fork', sourceId, versionId, body.targetProjectId ?? null, body.title ?? null]));
  const priorResult = async () => {
    const prior = await db.prepare('SELECT owner,project_id,fingerprint,mode,status FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;project_id:string;fingerprint:string;mode:string;status:string}>();
    if (!prior) return null;
    if (prior.owner !== who || prior.fingerprint !== fingerprint || prior.mode !== 'fork' || prior.status !== 'done') throw new HttpError(409, '该请求编号已被使用。');
    return json({ project: await readProject(who, prior.project_id), copied: true });
  };
  const existing = await priorResult(); if (existing) return existing;
  const source = await db.prepare('SELECT p.title,v.number,v.html,v.mode,v.model FROM forma_projects p JOIN forma_versions v ON v.project_id=p.id WHERE p.id=? AND p.owner=? AND v.id=?').bind(sourceId, who, versionId).first<{title:string;number:number;html:string;mode:string;model:string|null}>();
  if (!source) throw new HttpError(404, '应用或历史版本不存在，或不属于当前访客。');
  if (!source.html || source.html.length > 180000 || !['demo','model','manual'].includes(source.mode) || (source.model?.length ?? 0) > 200) throw new HttpError(422, '该历史版本内容超出复制限制。');
  const wid = await initializeWorkspace(who), target = typeof body.targetProjectId === 'string' ? body.targetProjectId : `project:${who}`;
  const targetRow = await db.prepare('SELECT id,archived FROM motes_projects WHERE id=? AND workspace_id=?').bind(target, wid).first<{id:string;archived:number}>();
  if (!targetRow) throw new HttpError(404, '目标项目不存在或不属于当前访客。');
  if (targetRow.archived) throw new HttpError(409, '请先恢复目标项目，再创建副本。');
  const busy = () => db.prepare('SELECT project_id FROM forma_locks WHERE project_id=? AND expires_at>?').bind(sourceId, Date.now()).first();
  if (await busy()) throw new HttpError(409, '原应用正在生成，请完成后再创建副本。');
  const count = async () => (await db.prepare('SELECT count(*) AS n FROM forma_projects WHERE owner=?').bind(who).first<{n:number}>())!.n;
  if (await count() >= LIMITS.apps) {
    const retry = await priorResult(); if (retry) return retry;
    throw new HttpError(429, '当前访客最多创建 100 个应用。');
  }
  const id = crypto.randomUUID(), copyVersion = crypto.randomUUID(), now = new Date().toISOString();
  const title = typeof body.title === 'string' ? body.title.trim() : `${source.title.slice(0,55)} · v${source.number} 副本`.slice(0,80);
  const description = `从「${source.title.slice(0,80)}」v${source.number} 创建的历史副本；未调用模型。`;
  // D1 batch is one transaction. Recheck source ownership, the immutable version,
  // live generation lease, target scope and capacity inside the first insert.
  // Every following insert depends on that new row; none may become an orphan.
  let result: D1Result[];
  try {
    result = await db.batch([
      db.prepare(`INSERT INTO forma_projects(id,owner,title,created_at,updated_at,current_version_id)
        SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forma_projects p JOIN forma_versions v ON v.project_id=p.id WHERE p.id=? AND p.owner=? AND v.id=? AND length(v.html)<=180000)
        AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND expires_at>?)
        AND EXISTS(SELECT 1 FROM motes_projects g JOIN motes_workspaces w ON w.id=g.workspace_id WHERE g.id=? AND w.id=? AND w.owner=? AND g.archived=0)
        AND (SELECT count(*) FROM forma_projects WHERE owner=?)<?`).bind(id,who,title,now,now,copyVersion,sourceId,who,versionId,sourceId,Date.now(),target,wid,who,who,LIMITS.apps),
      db.prepare('INSERT INTO forma_versions(id,project_id,number,prompt,summary,html,created_at,mode,model) SELECT ?,?,1,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=?)').bind(copyVersion,id,description,description,source.html,now,source.mode,source.model,id,who),
      db.prepare('INSERT INTO motes_apps(app_id,workspace_id,project_id,description,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=?)').bind(id,wid,target,description,now,id,who),
      db.prepare("INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at,result_version_id) SELECT ?,?,?,?,?,'fork','done',?,? WHERE EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=?)").bind(requestId,who,id,fingerprint,now.slice(0,10),now,copyVersion,id,who),
    ]);
  } catch (error) {
    // A concurrent retry may have committed the same request. Its fingerprint
    // must still match, and its response must reconcile the existing copy.
    const retry = await priorResult(); if (retry) return retry;
    throw error;
  }
  if (!result[0].meta.changes) {
    const retry = await priorResult(); if (retry) return retry;
    if (await count() >= LIMITS.apps) throw new HttpError(429, '当前访客最多创建 100 个应用。');
    throw new HttpError(409, '应用或目标项目状态已变化，请刷新后重试。');
  }
  return json({ project: await readProject(who,id), copied: true }, 201);
}
