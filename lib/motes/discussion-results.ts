import {HttpError} from '../forma/security';
import type {ModelObservation} from '../forma/model';
import {usageCompletion} from './usage';
export const DISCUSSION_RESULT_TTL_MS=7*24*60*60*1000;
type ResultRow={request_id:string;owner:string;thread_id:string;context_app_id:string|null;context_project_id:string|null;reply:string;observation_json:string;created_at:string;expires_at:string;committed_at:string|null;request_status:string;stored_reply:string|null;prompt:string};
export async function readDiscussionResult(db:D1Database,who:string,requestId:string){return db.prepare("SELECT s.*,r.status AS request_status,d.reply AS stored_reply,d.prompt FROM motes_discussion_results s JOIN forma_requests r ON r.id=s.request_id AND r.owner=s.owner AND r.mode='model' AND r.project_id='discussion:'||s.thread_id JOIN motes_discussion_turns d ON d.request_id=r.id AND d.thread_id=s.thread_id JOIN motes_discussion_threads t ON t.id=s.thread_id JOIN motes_workspaces w ON w.id=t.workspace_id WHERE s.request_id=? AND s.owner=? AND w.owner=?").bind(requestId,who,who).first<ResultRow>();}
export async function stageDiscussionResult(db:D1Database,who:string,requestId:string,thread:{id:string;app_id:string|null;managed_project_id:string|null},reply:string,observation:ModelObservation|null){
 if(!reply||reply.length>8000)throw new HttpError(413,'讨论回复超出暂存限制。');const observed=JSON.stringify(observation);if(observed.length>4096)throw new HttpError(413,'讨论观察记录超出限制。');const now=new Date().toISOString(),expires=new Date(Date.now()+DISCUSSION_RESULT_TTL_MS).toISOString();
 await db.batch([
  db.prepare('DELETE FROM motes_discussion_results WHERE owner=? AND expires_at<?').bind(who,now),
  db.prepare("INSERT INTO motes_discussion_results(request_id,owner,thread_id,context_app_id,context_project_id,reply,observation_json,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forma_requests r JOIN motes_discussion_turns d ON d.request_id=r.id JOIN motes_discussion_threads t ON t.id=d.thread_id JOIN motes_workspaces w ON w.id=t.workspace_id WHERE r.id=? AND r.owner=? AND r.mode='model' AND r.project_id='discussion:'||t.id AND t.id=? AND w.owner=?) ON CONFLICT(request_id) DO NOTHING").bind(requestId,who,thread.id,thread.app_id,thread.managed_project_id,reply,observed,now,expires,requestId,who,thread.id,who),
  usageCompletion(db,requestId,who,'succeeded',observation,null,{sql:'EXISTS(SELECT 1 FROM motes_discussion_results WHERE request_id=? AND owner=?)',bindings:[requestId,who]}),
 ]);
}
export async function commitDiscussionResult(db:D1Database,who:string,requestId:string,currentLease=false){
 const result=await readDiscussionResult(db,who,requestId);if(!result)throw new HttpError(404,'暂存回复不存在或不属于当前访客。');if(result.request_status==='done'&&result.stored_reply===result.reply)return result.thread_id;if(result.expires_at<=new Date().toISOString())throw new HttpError(410,'讨论回复已超过7天暂存保留期，原编号不会重新调用模型。');
 const namespace='discussion:'+result.thread_id,scope="EXISTS(SELECT 1 FROM motes_discussion_threads t JOIN motes_workspaces w ON w.id=t.workspace_id WHERE t.id=? AND w.owner=? AND t.app_id IS ? AND t.managed_project_id IS ? AND (t.app_id IS NULL OR EXISTS(SELECT 1 FROM forma_projects p WHERE p.id=t.app_id AND p.owner=?)))",scopeArgs=[result.thread_id,who,result.context_app_id,result.context_project_id,who];
 if(!currentLease){const acquired=await db.batch([
  db.prepare('DELETE FROM forma_locks WHERE project_id=? AND expires_at<=?').bind(namespace,Date.now()),
  db.prepare('INSERT INTO forma_locks(project_id,request_id,expires_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=?) AND '+scope+' AND EXISTS(SELECT 1 FROM motes_discussion_results WHERE request_id=? AND owner=? AND committed_at IS NULL AND expires_at>?)').bind(namespace,requestId,Date.now()+150000,namespace,...scopeArgs,requestId,who,new Date().toISOString()),
  db.prepare("UPDATE forma_requests SET status='running' WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND request_id=? AND expires_at>?)").bind(requestId,who,namespace,requestId,Date.now()),
 ]);if(!acquired[1].meta.changes){const current=await readDiscussionResult(db,who,requestId);if(current?.request_status==='done'&&current.stored_reply===current.reply)return result.thread_id;throw new HttpError(409,'原讨论范围或处理锁已变化；回复仍暂存，请核对后仅重试保存。');}}
 const now=new Date().toISOString(),guard=scope+" AND EXISTS(SELECT 1 FROM forma_locks l JOIN forma_requests r ON r.id=l.request_id WHERE l.project_id=? AND l.request_id=? AND l.expires_at>? AND r.owner=? AND r.status='running') AND EXISTS(SELECT 1 FROM motes_discussion_results WHERE request_id=? AND owner=? AND committed_at IS NULL AND expires_at>?)",bindings=[...scopeArgs,namespace,requestId,Date.now(),who,requestId,who,now],gate='EXISTS(SELECT 1 FROM motes_discussion_turns d JOIN motes_discussion_threads t ON t.id=d.thread_id JOIN motes_workspaces w ON w.id=t.workspace_id WHERE d.request_id=? AND d.thread_id=? AND d.reply=? AND d.completed_at=? AND w.owner=?)',gateArgs=[requestId,result.thread_id,result.reply,now,who];
 try{const saved=await db.batch([
  db.prepare('UPDATE motes_discussion_turns SET reply=?,error=NULL,completed_at=? WHERE request_id=? AND thread_id=? AND reply IS NULL AND '+guard).bind(result.reply,now,requestId,result.thread_id,...bindings),
  db.prepare("UPDATE motes_discussion_threads SET title=CASE WHEN title='新的讨论' THEN ? ELSE title END,updated_at=? WHERE id=? AND "+gate).bind(result.prompt.slice(0,40),now,result.thread_id,...gateArgs),
  usageCompletion(db,requestId,who,'succeeded',JSON.parse(result.observation_json),null,{sql:gate,bindings:gateArgs}),
  db.prepare('UPDATE motes_discussion_results SET committed_at=? WHERE request_id=? AND owner=? AND '+gate).bind(now,requestId,who,...gateArgs),
  db.prepare("UPDATE forma_requests SET status='done',result_version_id=? WHERE id=? AND owner=? AND "+gate).bind(requestId,requestId,who,...gateArgs),
  db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(namespace,requestId),
 ]);if(!saved[0].meta.changes)throw new HttpError(409,'回复已暂存，但原讨论范围或执行状态已变化；请核对后仅重试保存。');}
 catch(error){const reconciled=await readDiscussionResult(db,who,requestId);if(reconciled?.request_status==='done'&&reconciled.stored_reply===reconciled.reply)return result.thread_id;await db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(namespace,requestId).run();if(error instanceof HttpError)throw error;throw new HttpError(503,'模型回复已暂存7天，保存尚未完成；请仅重试保存，不会重新调用模型。');}
 return result.thread_id;
}
