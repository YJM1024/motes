import { env } from 'cloudflare:workers';
import { database, json, modelName, modelNames, payload, readProject } from '../forma/server';
import { digest, HttpError, owner } from '../forma/security';
import { discussModel } from '../forma/discussion-model';
import { ModelError, type ModelObservation } from '../forma/model';
import { initializeWorkspace } from './management';
import { readSettings } from './settings';
import { budgetReservation, usageReservation, usageCompletion } from './usage';
import {stageDiscussionResult,readDiscussionResult,commitDiscussionResult} from './discussion-results';
import {selectDiscussionContext} from './discussion-context';
import { DISCUSSION_LIMITS, type DiscussionContext, type DiscussionSnapshot, type DiscussionThread, type DiscussionTurn } from './discussion-types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const lockId = (id: string) => 'discussion:' + id;
type ThreadRow = { id:string;title:string;app_id:string|null;managed_project_id:string|null;created_at:string;updated_at:string };
const threadDto = (r: ThreadRow): DiscussionThread => ({ id:r.id,title:r.title,appId:r.app_id,managedProjectId:r.managed_project_id,createdAt:r.created_at,updatedAt:r.updated_at });
function id(value: unknown): string { if (typeof value !== 'string' || !value || value.length > 128) throw new HttpError(400, '讨论作用范围无效。'); return value; }
function fields(body: Record<string,unknown>, names: string[]) { if (Object.keys(body).some(k => !names.includes(k))) throw new HttpError(400, '包含不支持的讨论字段。'); }
async function context(who: string, value: DiscussionContext) {
  if (value.appId && value.managedProjectId) throw new HttpError(400, '应用和构建前项目不能同时指定。');
  const db = database(), wid = await initializeWorkspace(who);
  if (value.appId && !await db.prepare('SELECT id FROM forma_projects WHERE id=? AND owner=?').bind(id(value.appId),who).first()) throw new HttpError(404, '应用不存在或不属于当前访客。');
  if (value.managedProjectId && !await db.prepare('SELECT id FROM motes_projects WHERE id=? AND workspace_id=?').bind(id(value.managedProjectId),wid).first()) throw new HttpError(404, '项目不存在或不属于当前访客。');
  return wid;
}
async function threadFor(who: string, threadId: string): Promise<ThreadRow> {
  const row = await database().prepare('SELECT t.* FROM motes_discussion_threads t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.id=? AND w.owner=?').bind(id(threadId),who).first<ThreadRow>();
  if (!row) throw new HttpError(404, '讨论不存在或不属于当前访客。'); return row;
}
export async function discussionSnapshot(who: string, selected: DiscussionContext = {}): Promise<DiscussionSnapshot> {
  const db = database(), wid = await context(who, selected);
  const rows = await db.prepare('SELECT t.* FROM motes_discussion_threads t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE w.owner=? AND t.workspace_id=? AND t.app_id IS ? AND (? IS NOT NULL OR t.managed_project_id IS ?) ORDER BY t.updated_at DESC,t.id').bind(who,wid,selected.appId || null,selected.appId || null,selected.managedProjectId || null).all<ThreadRow>();
  const thread = selected.threadId ? await threadFor(who, selected.threadId) : rows.results[0] || null;
  if (thread && (thread.app_id !== (selected.appId || null) || (!selected.appId && thread.managed_project_id !== (selected.managedProjectId || null)))) throw new HttpError(400, '讨论不属于当前页面上下文。');
  let turns: DiscussionTurn[] = [];
  if (thread) {
    const result = await db.prepare("SELECT t.*,r.status,r.mode AS request_mode,u.requested_model,s.reply AS pending_reply,s.expires_at AS result_expires_at,s.committed_at AS result_committed_at,EXISTS(SELECT 1 FROM forma_locks l WHERE l.project_id=r.project_id AND l.request_id=r.id AND l.expires_at>?) AS live FROM motes_discussion_turns t JOIN forma_requests r ON r.id=t.request_id LEFT JOIN motes_model_usage u ON u.request_id=r.id AND u.owner=r.owner LEFT JOIN motes_discussion_results s ON s.request_id=r.id AND s.owner=r.owner WHERE t.thread_id=? AND r.owner=? AND r.mode IN ('model','discussion-import') AND r.project_id=? ORDER BY t.created_at,t.request_id").bind(Date.now(),thread.id,who,lockId(thread.id)).all<{request_id:string;prompt:string;reply:string|null;error:string|null;created_at:string;completed_at:string|null;context_version_id:string|null;status:'running'|'done'|'failed';request_mode:string;requested_model:string|null;pending_reply:string|null;result_expires_at:string|null;result_committed_at:string|null;live:number}>();
    turns = result.results.map(r => ({ requestId:r.request_id,prompt:r.prompt,reply:r.reply,error:r.error,status:r.pending_reply&&!r.result_committed_at&&r.result_expires_at!>new Date().toISOString()?'save_pending':r.status === 'running' && !r.live ? 'expired' : r.status,createdAt:r.created_at,completedAt:r.completed_at,contextVersionId:r.context_version_id,model:r.requested_model,imported:r.request_mode==='discussion-import',pendingReply:r.pending_reply&&!r.result_committed_at&&r.result_expires_at!>new Date().toISOString()?r.pending_reply:null,resultExpiresAt:r.result_expires_at }));
  }
  return { workspaceId:wid,thread:thread ? threadDto(thread) : null,threads:rows.results.map(threadDto),turns,limits:DISCUSSION_LIMITS };
}
export async function getDiscussions(request: Request) {
  const who = await owner(request), p = new URL(request.url).searchParams;
  if ([...p.keys()].some(k => !['appId','managedProjectId','threadId'].includes(k))) throw new HttpError(400, '讨论查询参数无效。');
  return json(await discussionSnapshot(who,Object.fromEntries(p) as DiscussionContext));
}
export async function createDiscussionThread(request: Request) {
  const who = await owner(request), body = await payload(request); fields(body,['threadId','appId','managedProjectId']);
  if (typeof body.threadId !== 'string' || !uuid.test(body.threadId)) throw new HttpError(400, '讨论编号无效。');
  const selected: DiscussionContext = { ...(body.appId !== undefined ? { appId:id(body.appId) } : {}),...(body.managedProjectId !== undefined ? { managedProjectId:id(body.managedProjectId) } : {}) };
  const wid = await context(who,selected), db = database();
  const existing = await db.prepare('SELECT t.*,w.owner FROM motes_discussion_threads t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.id=?').bind(body.threadId).first<ThreadRow & {owner:string}>();
  if (existing) { if (existing.owner !== who || existing.app_id !== (selected.appId || null) || existing.managed_project_id !== (selected.managedProjectId || null)) throw new HttpError(404, '讨论不存在或不属于当前页面。'); return json(await discussionSnapshot(who,{...selected,threadId:existing.id})); }
  if (selected.appId) { const current = await discussionSnapshot(who,selected); if (current.thread) return json(current); }
  const now = new Date().toISOString();
  try {
    const inserted = await db.prepare('INSERT INTO motes_discussion_threads(id,workspace_id,app_id,managed_project_id,title,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM motes_workspaces WHERE id=? AND owner=?) AND (? IS NOT NULL OR (SELECT count(*) FROM motes_discussion_threads WHERE workspace_id=? AND app_id IS NULL)<?) AND (? IS NULL OR EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=?)) AND (? IS NULL OR EXISTS(SELECT 1 FROM motes_projects WHERE id=? AND workspace_id=?))').bind(body.threadId,wid,selected.appId || null,selected.managedProjectId || null,'新的讨论',now,now,wid,who,selected.appId || null,wid,DISCUSSION_LIMITS.preThreads,selected.appId || null,selected.appId || null,who,selected.managedProjectId || null,selected.managedProjectId || null,wid).run();
    if (!inserted.meta.changes) throw new HttpError(429, '构建前讨论最多保留 50 个，请继续已有讨论。');
  } catch(error) { if (selected.appId) { const current = await discussionSnapshot(who,selected); if (current.thread) return json(current); } throw error; }
  return json(await discussionSnapshot(who,{...selected,threadId:body.threadId}),201);
}
export async function attachDiscussion(request: Request, threadId: string) {
  const who = await owner(request), body = await payload(request); fields(body,['appId']); const appId = id(body.appId), db = database(), thread = await threadFor(who,threadId);
  await context(who,{appId});
  if (thread.app_id === appId) return json(await discussionSnapshot(who,{appId,threadId}));
  if (thread.app_id) throw new HttpError(409, '此讨论已关联其他应用。');
  try {
    const result = await db.prepare('UPDATE motes_discussion_threads SET app_id=?,managed_project_id=NULL,updated_at=? WHERE id=? AND app_id IS NULL AND EXISTS(SELECT 1 FROM motes_workspaces w WHERE w.id=motes_discussion_threads.workspace_id AND w.owner=?) AND EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=?) AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND expires_at>?)').bind(appId,new Date().toISOString(),threadId,who,appId,who,lockId(threadId),Date.now()).run();
    if (!result.meta.changes) throw new HttpError(409, '讨论仍在处理或状态已变化，请稍后重试关联。');
  } catch(error) { if (error instanceof HttpError) throw error; throw new HttpError(409, '应用已有独立讨论，原构建前讨论仍保留。'); }
  return json(await discussionSnapshot(who,{appId,threadId}));
}
export async function discussionRequestStatus(request: Request, requestId: string) {
  const who = await owner(request); if (!uuid.test(requestId)) throw new HttpError(400, '请求编号无效。');
  const row = await database().prepare("SELECT t.thread_id FROM motes_discussion_turns t JOIN forma_requests r ON r.id=t.request_id WHERE r.id=? AND r.owner=? AND r.mode IN ('model','discussion-import') AND r.project_id='discussion:'||t.thread_id").bind(requestId,who).first<{thread_id:string}>();
  if (!row) throw new HttpError(404, '讨论请求不存在或不属于当前访客。');
  const thread = await threadFor(who,row.thread_id), snapshot = await discussionSnapshot(who,{threadId:thread.id,...thread.app_id?{appId:thread.app_id}:thread.managed_project_id?{managedProjectId:thread.managed_project_id}:{}}), turn = snapshot.turns.find(t => t.requestId === requestId)!;
  return json({ requestId,threadId:thread.id,status:turn.status,...turn.status==='save_pending'?{retry:'save'}:['failed','expired'].includes(turn.status)?{retry:'new'}:{},snapshot });
}
export async function sendDiscussion(request: Request) {
  const who = await owner(request), body = await payload(request); fields(body,['threadId','requestId','prompt','baseVersionId','model']);
  const threadId = id(body.threadId); if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) throw new HttpError(400, '请求编号无效。');
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) throw new HttpError(400, '请输入 1–4000 字的问题。');
  if (body.baseVersionId !== undefined) id(body.baseVersionId); if (body.model !== undefined) id(body.model);
  const prompt = body.prompt.trim(), requestId = body.requestId, namespace = lockId(threadId), db = database();
  const fingerprint = await digest(JSON.stringify(['discussion',threadId,prompt,body.baseVersionId || null,body.model || null]));
  const thread = await threadFor(who,threadId), selected: DiscussionContext = {threadId,...thread.app_id?{appId:thread.app_id}:thread.managed_project_id?{managedProjectId:thread.managed_project_id}:{}};
  const prior = await db.prepare('SELECT owner,project_id,fingerprint,status FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;project_id:string;fingerprint:string;status:string}>();
  if (prior) {
    if (prior.owner !== who || prior.project_id !== namespace || prior.fingerprint !== fingerprint) throw new HttpError(409, '该请求编号已被使用。');
    if (prior.status === 'done') return json(await discussionSnapshot(who,selected));
    if(await readDiscussionResult(db,who,requestId)){await commitDiscussionResult(db,who,requestId);return json(await discussionSnapshot(who,selected));}
    const live = await db.prepare('SELECT request_id FROM forma_locks WHERE project_id=? AND request_id=? AND expires_at>?').bind(namespace,requestId,Date.now()).first();
    throw new HttpError(409,prior.status === 'running' && live ? '讨论仍在处理中，请先核对状态。' : '本次讨论未完成，可重新发送。',prior.status === 'failed' || !live ? 'new' : undefined);
  }
  if(await db.prepare('SELECT request_id FROM motes_discussion_results WHERE thread_id=? AND owner=? AND committed_at IS NULL AND expires_at>?').bind(threadId,who,new Date().toISOString()).first())throw new HttpError(409,'此讨论已有回复暂存，请先仅重试保存，不会重新调用模型。');
  const available = modelNames(), fallback = modelName(); if (!fallback) throw new HttpError(503, '尚未连接模型，讨论无法生成回答；可以使用示例构建或保存草稿。');
  if (body.model !== undefined && !available.includes(body.model as string)) throw new HttpError(400, '该模型未在服务端白名单中。');
  const settings = await readSettings(db,who,fallback,thread.app_id?{appId:thread.app_id}:thread.managed_project_id?{projectId:thread.managed_project_id}:{},available), model = typeof body.model === 'string' ? body.model : settings.effective.model || fallback;
  const snapshot = await discussionSnapshot(who,selected); if (snapshot.turns.length >= 100) throw new HttpError(429, '此讨论已达到 100 轮上限，请开启新的构建前讨论。');
  const app = thread.app_id ? await readProject(who,thread.app_id) : null;
  if (!app && body.baseVersionId !== undefined) throw new HttpError(400, '构建前讨论没有应用基础版本。');
  const base = app?.versions.find(v => v.id === (body.baseVersionId || app.currentVersionId)); if (app && !base) throw new HttpError(404, '讨论上下文版本不存在。');
  const history = selectDiscussionContext(snapshot.turns).text, now = new Date().toISOString();
  await db.prepare('DELETE FROM forma_locks WHERE project_id=? AND expires_at<=?').bind(namespace,Date.now()).run();
  const reservationFence = "EXISTS(SELECT 1 FROM motes_discussion_threads t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.id=? AND w.owner=? AND t.app_id IS ? AND t.managed_project_id IS ? AND (t.app_id IS NULL OR EXISTS(SELECT 1 FROM forma_projects p WHERE p.id=t.app_id AND p.owner=?))) AND (SELECT count(*) FROM motes_discussion_turns WHERE thread_id=?)<100 AND NOT EXISTS(SELECT 1 FROM motes_discussion_results s WHERE s.thread_id=? AND s.owner=? AND s.committed_at IS NULL AND s.expires_at>?)";
  const scopeBindings = [threadId,who,thread.app_id,thread.managed_project_id,who,threadId,threadId,who,new Date().toISOString()] as (string|null)[];
  let reserved: D1Result[];
  try {
    reserved = await db.batch([
      db.prepare(`INSERT INTO forma_locks(project_id,request_id,expires_at) SELECT ?,?,? WHERE ${reservationFence}`).bind(namespace,requestId,Date.now()+150000,...scopeBindings),
      budgetReservation(db,{id:requestId,owner:who,projectId:namespace,fingerprint,mode:'model',createdAt:now,fence:{sql:'EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND request_id=?)',bindings:[namespace,requestId]}}),
      usageReservation(db,requestId,who,model,'discuss',now),
      db.prepare("INSERT INTO motes_discussion_turns(request_id,thread_id,prompt,context_version_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forma_requests WHERE id=? AND owner=? AND status='running') AND EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND request_id=?)").bind(requestId,threadId,prompt,base?.id || null,now,requestId,who,namespace,requestId),
    ]);
    if (!reserved[1].meta.changes || !reserved[3].meta.changes) { await db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(namespace,requestId).run(); throw new HttpError(429,'讨论与构建共用的今日额度已用完，或讨论状态已变化。'); }
  } catch(error) { if (error instanceof HttpError) throw error; throw new HttpError(409,'此讨论正在处理其他问题，请稍后核对。'); }
  let observation: ModelObservation | null = null;
  try {
    const reply = await discussModel(prompt,history,base?.html,env.OPENAI_API_KEY!,model,value => { observation = value; });
    await stageDiscussionResult(db,who,requestId,thread,reply,observation);
    await commitDiscussionResult(db,who,requestId,true);
  } catch(error) {
    if(await readDiscussionResult(db,who,requestId)){if(error instanceof HttpError)throw error;throw new HttpError(503,'讨论回复已暂存，请仅重试保存。');}
    const message = error instanceof ModelError || error instanceof HttpError ? error.message : '讨论未完成，原问题已保留，请核对后重试。';
    const cleaned = await db.batch([
      db.prepare("UPDATE forma_requests SET status='failed' WHERE id=? AND owner=? AND status='running'").bind(requestId,who),
      db.prepare('UPDATE motes_discussion_turns SET error=?,completed_at=? WHERE request_id=? AND reply IS NULL AND EXISTS(SELECT 1 FROM motes_discussion_threads t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.id=motes_discussion_turns.thread_id AND w.owner=?)').bind(message,new Date().toISOString(),requestId,who),
      usageCompletion(db,requestId,who,'failed',observation,error instanceof HttpError?'state_changed':(observation as ModelObservation|null)?.errorCode || 'storage'),
      db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(namespace,requestId),
    ]);
    throw new HttpError(error instanceof ModelError || error instanceof HttpError ? error.status : 502,message,cleaned[0].meta.changes?'new':undefined);
  }
  return json(await discussionSnapshot(who,selected));
}

export async function saveDiscussionResult(request:Request,requestId:string){const who=await owner(request),body=await payload(request);if(Object.keys(body).length||!uuid.test(requestId))throw new HttpError(400,'讨论保存请求无效。');const threadId=await commitDiscussionResult(database(),who,requestId),thread=await threadFor(who,threadId);return json(await discussionSnapshot(who,{threadId,...thread.app_id?{appId:thread.app_id}:thread.managed_project_id?{managedProjectId:thread.managed_project_id}:{}}));}
