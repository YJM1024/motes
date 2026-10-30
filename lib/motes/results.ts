import { HttpError } from '../forma/security';
import type { Version } from '../forma/types';
import type { ModelObservation } from '../forma/model';
import { usageCompletion } from './usage';

export const RESULT_TTL_MS=7*24*60*60*1000;
export type GenerationResult={projectId:string;isNew:boolean;title:string;version:Version;expectedCurrentVersionId:string|null;managedProjectId:string|null;observation:ModelObservation|null;config?:{operation:import('./version-config').VersionOperation;baseVersionId:string|null;settings:import('./settings').Preferences|null}};
export async function stageResult(db:D1Database,who:string,requestId:string,kind:'generation'|'candidate',value:unknown){
 const serialized=JSON.stringify(value);if(serialized.length>400000)throw new HttpError(413,'生成结果超出暂存容量。');
 const now=new Date().toISOString(),expires=new Date(Date.now()+RESULT_TTL_MS).toISOString();
 // Cleanup is bounded to this owner; durable request receipts and quota are retained.
 await db.batch([
  db.prepare('DELETE FROM motes_generation_results WHERE owner=? AND expires_at<?').bind(who,now),
  db.prepare('INSERT INTO motes_generation_results(request_id,owner,kind,result_json,created_at,expires_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forma_requests WHERE id=? AND owner=?) ON CONFLICT(request_id) DO NOTHING').bind(requestId,who,kind,serialized,now,expires,requestId,who),
  usageCompletion(db,requestId,who,'succeeded',(value as {observation?:ModelObservation|null}).observation??null,null,{sql:'EXISTS(SELECT 1 FROM motes_generation_results WHERE request_id=? AND owner=?)',bindings:[requestId,who]}),
 ]);
}
export async function stagedResult<T>(db:D1Database,who:string,requestId:string,kind:'generation'|'candidate'){
 const row=await db.prepare('SELECT result_json,expires_at,committed_at FROM motes_generation_results WHERE request_id=? AND owner=? AND kind=?').bind(requestId,who,kind).first<{result_json:string;expires_at:string;committed_at:string|null}>();
 if(!row)return null;if(!row.committed_at&&row.expires_at<=new Date().toISOString())throw new HttpError(410,'暂存结果已超过7天保留期，无法继续保存。');return {...row,value:JSON.parse(row.result_json) as T};
}
export async function commitGenerationResult(db:D1Database,who:string,requestId:string,currentLease=false){
 const receipt=await db.prepare('SELECT project_id,status,result_version_id FROM forma_requests WHERE id=? AND owner=?').bind(requestId,who).first<{project_id:string;status:string;result_version_id:string|null}>();
 if(!receipt)throw new HttpError(404,'原请求不存在或不属于当前访客。');
 const staged=await stagedResult<GenerationResult>(db,who,requestId,'generation');if(!staged)throw new HttpError(404,'尚无可保存的暂存结果。');
 const value=staged.value,{projectId,version}=value;
 if(receipt.status==='done'&&receipt.result_version_id===version.id)return projectId;
 if(receipt.project_id!==projectId)throw new HttpError(409,'暂存结果归属发生变化。');
 if(!currentLease){
  const acquired=await db.batch([
   db.prepare('DELETE FROM forma_locks WHERE project_id=? AND expires_at<=?').bind(projectId,Date.now()),
   db.prepare('INSERT INTO forma_locks(project_id,request_id,expires_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=?) AND EXISTS(SELECT 1 FROM motes_generation_results WHERE request_id=? AND owner=? AND committed_at IS NULL AND expires_at>?)').bind(projectId,requestId,Date.now()+210000,projectId,requestId,who,new Date().toISOString()),
   db.prepare("UPDATE forma_requests SET status='running' WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND request_id=? AND expires_at>?)").bind(requestId,who,projectId,requestId,Date.now()),
  ]);if(!acquired[1].meta.changes)throw new HttpError(409,'当前应用仍有有效处理锁，请先核对原请求并稍后仅重试保存。');
 }
 const now=new Date().toISOString();
 const target=value.managedProjectId?" AND EXISTS(SELECT 1 FROM motes_projects g JOIN motes_workspaces w ON w.id=g.workspace_id WHERE g.id=? AND w.owner=? AND g.archived=0)":'';
 const guard="EXISTS(SELECT 1 FROM forma_locks l JOIN forma_requests r ON r.id=l.request_id WHERE l.project_id=? AND l.request_id=? AND l.expires_at>? AND r.owner=? AND r.status='running') AND EXISTS(SELECT 1 FROM motes_generation_results WHERE request_id=? AND owner=? AND committed_at IS NULL AND expires_at>?)"+target;
 const bindings=[projectId,requestId,Date.now(),who,requestId,who,now,...value.managedProjectId?[value.managedProjectId,who]:[]];
 const admitted=guard+(value.isNew?' AND (SELECT count(*) FROM forma_projects WHERE owner=?)<100':' AND EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=? AND current_version_id=?) AND (SELECT count(*) FROM forma_versions WHERE project_id=?)<60');
 const admittedBindings=[...bindings,...value.isNew?[who]:[projectId,who,value.expectedCurrentVersionId,projectId]];
 const gate='EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=? AND current_version_id=?)',gateBindings=[projectId,who,version.id];
 try{
 const saved=await db.batch([
  value.isNew?db.prepare('INSERT INTO forma_projects(id,owner,title,created_at,updated_at,current_version_id) SELECT ?,?,?,?,?,? WHERE '+admitted).bind(projectId,who,value.title,version.createdAt,version.createdAt,version.id,...admittedBindings):db.prepare('UPDATE forma_projects SET current_version_id=?,updated_at=? WHERE id=? AND owner=? AND '+admitted).bind(version.id,version.createdAt,projectId,who,...admittedBindings),
  db.prepare('INSERT INTO forma_versions(id,project_id,number,prompt,summary,html,created_at,mode,model) SELECT ?,?,coalesce((SELECT max(number) FROM forma_versions WHERE project_id=?),0)+1,?,?,?,?,?,? WHERE '+gate).bind(version.id,projectId,projectId,version.prompt,version.summary,version.html,version.createdAt,version.mode,version.model??null,...gateBindings),
  ...value.config?[db.prepare('INSERT INTO motes_version_config(version_id,operation,base_version_id,settings_json,created_at) SELECT ?,?,?,?,? WHERE '+gate).bind(version.id,value.config.operation,value.config.baseVersionId,value.config.settings?JSON.stringify(value.config.settings):null,version.createdAt,...gateBindings)]:[],
  ...value.isNew&&value.managedProjectId?[db.prepare('INSERT INTO motes_apps(app_id,workspace_id,project_id,updated_at) SELECT ?,g.workspace_id,g.id,? FROM motes_projects g WHERE g.id=? AND '+gate).bind(projectId,version.createdAt,value.managedProjectId,...gateBindings)]:[],
  ...version.mode==='model'?[usageCompletion(db,requestId,who,'succeeded',value.observation,null,{sql:gate,bindings:gateBindings})]:[],
  db.prepare("UPDATE forma_requests SET status='done',result_version_id=? WHERE id=? AND owner=? AND "+gate).bind(version.id,requestId,who,...gateBindings),
  db.prepare('UPDATE motes_generation_results SET committed_at=? WHERE request_id=? AND owner=? AND '+gate).bind(now,requestId,who,...gateBindings),
  db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(projectId,requestId),
 ]);
 if(!saved[0].meta.changes)throw new HttpError(409,'结果已暂存，基准版本、目标项目或容量已变化；请核对后仅重试保存。');
 }catch(error){
  // Reconcile an ambiguous committed response before releasing anything.
  const done=await db.prepare('SELECT status,result_version_id FROM forma_requests WHERE id=? AND owner=?').bind(requestId,who).first<{status:string;result_version_id:string|null}>();
  if(done?.status==='done'&&done.result_version_id===version.id)return projectId;
  await db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(projectId,requestId).run();
  if(error instanceof HttpError)throw error;throw new HttpError(503,'结果已暂存7天，保存暂未完成；请仅重试保存，不会重新调用模型。');
 }
 return projectId;
}
