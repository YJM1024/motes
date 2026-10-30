import { database, json, payload } from '../forma/server';
import { digest, HttpError, owner } from '../forma/security';
import { initializeWorkspace } from './management';
import { BUILTIN_PROMPTS, TEMPLATE_LIMITS, type PromptTemplate, type TemplateLibrary } from './template-types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function text(value: unknown, name: string, max: number): string { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, `${name}须为 1–${max} 字。`); return value.trim(); }
export async function templateSnapshot(who: string, wid: string, query = ''): Promise<TemplateLibrary> {
  const db = database(), needle = query.toLocaleLowerCase();
  const rows = await db.prepare('SELECT t.id,t.name,t.prompt,t.created_at,t.updated_at FROM motes_prompt_templates t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.workspace_id=? AND w.owner=? AND (instr(lower(t.name),lower(?))>0 OR instr(lower(t.prompt),lower(?))>0) ORDER BY t.updated_at DESC,t.id').bind(wid,who,query,query).all<{id:string;name:string;prompt:string;created_at:string;updated_at:string}>();
  const total = await db.prepare('SELECT count(*) AS n FROM motes_prompt_templates t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.workspace_id=? AND w.owner=?').bind(wid,who).first<{n:number}>();
  const templates: PromptTemplate[] = rows.results.map(r => ({ id: r.id, name: r.name, prompt: r.prompt, createdAt: r.created_at, updatedAt: r.updated_at }));
  return { templates, builtins: BUILTIN_PROMPTS.filter(p => `${p.name} ${p.prompt}`.toLocaleLowerCase().includes(needle)), total: total?.n || 0, limits: TEMPLATE_LIMITS };
}
export async function getTemplates(request: Request) {
  const who = await owner(request), params = new URL(request.url).searchParams;
  if ([...params.keys()].some(k => k !== 'q')) throw new HttpError(400, '模板查询参数无效。');
  const query = params.get('q') ?? ''; if (query.length > 100) throw new HttpError(400, '搜索词最多 100 字。');
  const wid = await initializeWorkspace(who);
  return json(await templateSnapshot(who, wid, query.trim()));
}
/** Transactions record completed request IDs, including deletes, so retries never resurrect data. */
export async function manageTemplates(request: Request) {
  const who = await owner(request), body = await payload(request), db = database();
  if (typeof body.action !== 'string' || !['create', 'update', 'delete'].includes(body.action)) throw new HttpError(400, '模板操作无效。');
  const action = body.action, permitted = action === 'create' ? ['name','prompt'] : action === 'update' ? ['id','name','prompt'] : ['id'];
  if (Object.keys(body).some(k => !['action','requestId',...permitted].includes(k))) throw new HttpError(400, '包含不支持的模板字段。');
  if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) throw new HttpError(400, '请求编号无效，请重试。');
  if (action !== 'create' && (typeof body.id !== 'string' || !uuid.test(body.id))) throw new HttpError(400, '个人模板编号无效；内置灵感只读。');
  if (action === 'update' && body.name === undefined && body.prompt === undefined) throw new HttpError(400, '请提供模板名称或需求内容。');
  const name = action !== 'delete' && (action === 'create' || body.name !== undefined) ? text(body.name, '模板名称', TEMPLATE_LIMITS.name) : null;
  const prompt = action !== 'delete' && (action === 'create' || body.prompt !== undefined) ? text(body.prompt, '模板需求', TEMPLATE_LIMITS.prompt) : null;
  const requestId = body.requestId, mode = `template-${action}`, fingerprint = await digest(JSON.stringify([mode,body.id ?? null,name,prompt]));
  const wid = await initializeWorkspace(who);
  const priorResult = async () => {
    const prior = await db.prepare('SELECT owner,project_id,fingerprint,mode,status FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;project_id:string;fingerprint:string;mode:string;status:string}>();
    if (!prior) return null;
    if (prior.owner !== who || prior.fingerprint !== fingerprint || prior.mode !== mode || prior.status !== 'done') throw new HttpError(409, '该请求编号已被使用。');
    return json({ ...await templateSnapshot(who,wid), completed: true, templateId: prior.project_id });
  };
  const prior = await priorResult(); if (prior) return prior;
  const id = action === 'create' ? crypto.randomUUID() : body.id as string, now = new Date().toISOString();
  const exists = 'EXISTS(SELECT 1 FROM motes_prompt_templates t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.id=? AND t.workspace_id=? AND w.owner=?)';
  const receipt = db.prepare(`INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at,result_version_id) SELECT ?,?,?,?,?,?,'done',?,? WHERE ${exists}`).bind(requestId,who,id,fingerprint,now.slice(0,10),mode,now,id,id,wid,who);
  let results: D1Result[];
  try {
    if (action === 'create') results = await db.batch([
      db.prepare('INSERT INTO motes_prompt_templates(id,workspace_id,name,prompt,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM motes_workspaces WHERE id=? AND owner=?) AND (SELECT count(*) FROM motes_prompt_templates WHERE workspace_id=?)<?').bind(id,wid,name,prompt,now,now,wid,who,wid,TEMPLATE_LIMITS.templates), receipt,
    ]);
    else if (action === 'update') results = await db.batch([
      db.prepare(`UPDATE motes_prompt_templates SET name=coalesce(?,name),prompt=coalesce(?,prompt),updated_at=? WHERE id=? AND workspace_id=? AND ${exists}`).bind(name,prompt,now,id,wid,id,wid,who), receipt,
    ]);
    else results = await db.batch([receipt, db.prepare("DELETE FROM motes_prompt_templates WHERE id=? AND workspace_id=? AND EXISTS(SELECT 1 FROM forma_requests WHERE id=? AND owner=? AND mode='template-delete' AND fingerprint=? AND status='done')").bind(id,wid,requestId,who,fingerprint)]);
  } catch (error) { const retry = await priorResult(); if (retry) return retry; throw error; }
  if (!results[0].meta.changes) {
    const retry = await priorResult(); if (retry) return retry;
    if (action === 'create') throw new HttpError(429, `每个工作空间最多保存 ${TEMPLATE_LIMITS.templates} 个个人模板。`);
    throw new HttpError(404, '模板不存在或不属于当前访客。');
  }
  return json({ ...await templateSnapshot(who,wid), completed: true, templateId: id }, action === 'create' ? 201 : 200);
}
