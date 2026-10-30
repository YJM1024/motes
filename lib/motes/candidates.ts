import { env } from 'cloudflare:workers';
import { database, json, modelName, modelNames, payload } from '../forma/server';
import { digest, HttpError, owner } from '../forma/security';
import { generateDemo } from '../forma/demo';
import { generateModel, ModelError } from '../forma/model';
import type { ModelObservation } from '../forma/model';
import { initialAppTitle } from '../forma/app-title';
import { initializeWorkspace, LIMITS } from './management';
import { generationPreferences, readSettings } from './settings';
import { budgetReservation, GENERATION_LIMITS, usageCompletion, usageReservation } from './usage';
import type { CandidateGroup, CandidateSummary } from './candidate-types';

const MAX_GROUPS=20;
const strategies=['简洁清晰 · 操作优先','丰富层次 · 信息优先','紧凑高效 · 工作流优先','醒目直观 · 视觉优先'];
const directions=['a restrained, action-focused layout with clear primary controls','an information-focused layout with stronger visual hierarchy','a compact, efficient workflow-focused layout','a bold, visually expressive layout with clear navigation'];
function id(value:unknown){if(typeof value!=='string'||!value||value.length>128)throw new HttpError(400,'方案或应用编号无效。');return value;}
function uuid(value:unknown){const result=id(value);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))throw new HttpError(400,'方案请求编号无效。');return result;}
type GroupRow={id:string;owner:string;fingerprint:string;prompt:string;mode:'demo'|'model';model:string|null;app_id:string|null;base_version_id:string|null;managed_project_id:string;created_at:string;candidate_count:2|3|4;generation_context:string|null};
const summary=(r:GroupRow):CandidateSummary=>({id:r.id,prompt:r.prompt,mode:r.mode,model:r.model,appId:r.app_id,baseVersionId:r.base_version_id,managedProjectId:r.managed_project_id,createdAt:r.created_at,count:r.candidate_count??2,reservedModelCalls:r.mode==='model'?(r.candidate_count??2):0});
async function groupFor(who:string,groupId:string){const group=await database().prepare('SELECT * FROM motes_candidate_groups WHERE id=? AND owner=?').bind(groupId,who).first<GroupRow>();if(!group)throw new HttpError(404,'方案组不存在或不属于当前访客。');return group;}
export async function readCandidateGroup(who:string,groupId:string):Promise<CandidateGroup>{
  const group=await groupFor(who,groupId);
  const rows=await database().prepare('SELECT c.*,EXISTS(SELECT 1 FROM forma_locks l WHERE l.request_id=c.request_id AND l.expires_at>?) AS live FROM motes_candidates c WHERE c.group_id=? ORDER BY c.slot').bind(Date.now(),groupId).all<{id:string;slot:number;strategy:string;status:'running'|'ready'|'failed';html:string|null;error_code:string|null;updated_at:string;adopted_app_id:string|null;adopted_version_id:string|null;adopt_kind:'current'|'new'|null;live:number}>();
  return {...summary(group),candidates:rows.results.map(r=>({id:r.id,slot:r.slot,strategy:r.strategy,status:r.status==='running'&&!r.live?'unresolved':r.status,html:r.html,errorCode:r.error_code,updatedAt:r.updated_at,adoptedAppId:r.adopted_app_id,adoptedVersionId:r.adopted_version_id,adoptKind:r.adopt_kind}))};
}
export async function getCandidates(request:Request,groupId?:string){const who=await owner(request);if(groupId)return json({group:await readCandidateGroup(who,id(groupId))});const rows=await database().prepare('SELECT * FROM motes_candidate_groups WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 20').bind(who).all<GroupRow>();return json({groups:rows.results.map(summary),limit:MAX_GROUPS});}

export async function createCandidates(request:Request){
  const who=await owner(request),body=await payload(request),db=database();
  if(Object.keys(body).some(k=>!['requestId','prompt','mode','model','appId','baseVersionId','managedProjectId','confirmTwoCalls','count','confirmCalls'].includes(k)))throw new HttpError(400,'包含不支持的方案字段。');
  const groupId=uuid(body.requestId);
  const count=body.count===undefined?2:body.count;
  if(![2,3,4].includes(count as number)||(body.count===undefined?body.confirmTwoCalls!==true:body.confirmCalls!==count))throw new HttpError(400,'请选择2、3或4种方案并明确确认对应次数。');
  if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000||typeof body.mode!=='string'||!['demo','model'].includes(body.mode))throw new HttpError(400,'请输入1–4000字需求，并确认生成方案。');
  const prompt=body.prompt.trim(),mode=body.mode as 'demo'|'model';
  if(body.model!==undefined&&(typeof body.model!=='string'||mode!=='model'))throw new HttpError(400,'方案模型参数无效。');
  const appId=body.appId===undefined?null:id(body.appId),baseVersionId=body.baseVersionId===undefined?null:id(body.baseVersionId),requestedTarget=body.managedProjectId===undefined?null:id(body.managedProjectId);
  if((appId&&!baseVersionId)||(!appId&&baseVersionId)||(appId&&requestedTarget))throw new HttpError(400,'请选择当前应用基准版本，或为新应用选择目标项目。');
  const fingerprint=await digest(JSON.stringify([body.count===undefined?'candidates-v1':'candidates-v2',prompt,mode,appId,baseVersionId,requestedTarget,body.model??null,...body.count===undefined?[]:[count]]));
  const prior=async()=>{const old=await db.prepare('SELECT owner,fingerprint FROM motes_candidate_groups WHERE id=?').bind(groupId).first<{owner:string;fingerprint:string}>();if(!old)return null;if(old.owner!==who||old.fingerprint!==fingerprint)throw new HttpError(409,'方案请求编号已被使用。');return json({group:await readCandidateGroup(who,groupId)});};
  const existing=await prior();if(existing)return existing;
  const wid=await initializeWorkspace(who);
  const source=appId?await db.prepare('SELECT p.current_version_id,v.html,a.project_id FROM forma_projects p JOIN forma_versions v ON v.id=p.current_version_id AND v.project_id=p.id JOIN motes_apps a ON a.app_id=p.id AND a.workspace_id=? WHERE p.id=? AND p.owner=?').bind(wid,appId,who).first<{current_version_id:string;html:string;project_id:string}>():null;
  if(appId&&!source)throw new HttpError(404,'基准应用不存在或不属于当前访客。');
  if(source&&source.current_version_id!==baseVersionId)throw new HttpError(409,'应用已有新版本，请刷新基准后再生成方案。','new');
  const target=requestedTarget??source?.project_id??`project:${who}`;
  const group=await db.prepare('SELECT archived FROM motes_projects WHERE id=? AND workspace_id=?').bind(target,wid).first<{archived:number}>();
  if(!group)throw new HttpError(404,'目标项目不存在或不属于当前访客。');if(group.archived)throw new HttpError(409,'请先恢复目标项目。','new');
  const prefs=await readSettings(db,who,modelName(),appId?{appId}:{projectId:target},modelNames());
  const model=mode==='model'?(typeof body.model==='string'?body.model:prefs.effective.model??modelName()):null;
  if(mode==='model'&&(!model||!modelNames().includes(model)))throw new HttpError(503,'所选模型未连接或不在可用白名单中，请选择示例模式或有效模型。');
  let examples:string[]=[];
  if(mode==='demo'){try{const initial=generateDemo(prompt,source?.html).html;examples=['改成蓝色主题','改成绿色主题','改成深色主题','改成浅色主题'].slice(0,count as number).map(theme=>generateDemo(theme,initial).html);}catch(error){throw new HttpError(422,(error as Error).message);}}
  const now=new Date().toISOString(),ids=Array.from({length:count as number},()=>crypto.randomUUID()),requests=ids.map(()=>crypto.randomUUID()),lockIds=requests.map(r=>'candidate:'+r);
  const stateSql="EXISTS(SELECT 1 FROM motes_projects g JOIN motes_workspaces w ON w.id=g.workspace_id WHERE g.id=? AND g.workspace_id=? AND w.owner=? AND g.archived=0) AND (SELECT count(*) FROM motes_candidate_groups WHERE owner=?)<?"+(appId?" AND EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=? AND current_version_id=?) AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND expires_at>?) AND (SELECT count(*) FROM forma_versions WHERE project_id=?)<60":" AND (SELECT count(*) FROM forma_projects WHERE owner=?)<?");
  const stateBindings:(string|number)[]=[target,wid,who,who,MAX_GROUPS,...appId?[appId,who,baseVersionId!,appId,Date.now(),appId]:[who,LIMITS.apps]];
  const first=budgetReservation(db,{id:requests[0],owner:who,projectId:lockIds[0],fingerprint:await digest(fingerprint+':0'),mode,createdAt:now,units:count as 2|3|4,fence:{sql:stateSql,bindings:stateBindings}});
  const statements=[first];
  for(let slot=1;slot<(count as number);slot++)statements.push(budgetReservation(db,{id:requests[slot],owner:who,projectId:lockIds[slot],fingerprint:await digest(fingerprint+':'+slot),mode,createdAt:now,units:((count as number)-slot) as 1|2|3,fence:{sql:'EXISTS(SELECT 1 FROM forma_requests WHERE id=? AND owner=?)',bindings:[requests[0],who]}}));
  const context=generationPreferences(prefs.effective,!!source);
  statements.push(db.prepare('INSERT INTO motes_candidate_groups(id,owner,fingerprint,prompt,mode,model,app_id,base_version_id,managed_project_id,created_at,candidate_count,generation_context) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forma_requests WHERE id=? AND owner=?)').bind(groupId,who,fingerprint,prompt,mode,model,appId,baseVersionId,target,now,count,context,requests[(count as number)-1],who));
  for(let slot=0;slot<(count as number);slot++){
    statements.push(db.prepare("INSERT INTO motes_candidates(id,group_id,slot,request_id,strategy,status,created_at,updated_at) SELECT ?,?,?,?,?,'running',?,? WHERE EXISTS(SELECT 1 FROM motes_candidate_groups WHERE id=? AND owner=?)").bind(ids[slot],groupId,slot,requests[slot],mode==='demo'?['蓝色示例','绿色示例','深色示例','浅色示例'][slot]:strategies[slot],now,now,groupId,who));
    statements.push(db.prepare('INSERT INTO forma_locks(project_id,request_id,expires_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM motes_candidate_groups WHERE id=? AND owner=?)').bind(lockIds[slot],requests[slot],Date.now()+210000,groupId,who));
    if(mode==='model')statements.push(usageReservation(db,requests[slot],who,model!,'candidate',now));
  }
  let reserved:D1Result[];
  try{reserved=await db.batch(statements);}catch(error){const retry=await prior();if(retry)return retry;throw error;}
  if(!reserved[0].meta.changes){const retry=await prior();if(retry)return retry;const day=now.slice(0,10),budget=GENERATION_LIMITS[mode];const counts=await db.prepare('SELECT count(*) AS global_count,sum(CASE WHEN owner=? THEN 1 ELSE 0 END) AS own FROM forma_requests WHERE day=? AND mode=?').bind(who,day,mode).first<{global_count:number;own:number}>();if(counts!.global_count+(count as number)>budget.global||(counts!.own??0)+(count as number)>budget.visitor)throw new HttpError(429,`剩余额度不足${count}次，未调用模型；可减少候选数后重新确认。`,'new');throw new HttpError(409,'应用、目标项目、生成锁或容量状态已变化；最多保留20组方案，请检查后重试。','new');}
  const run=async(slot:number)=>{
    let observation:ModelObservation|null=null,html:string|null=null,errorCode:string|null=null;
    try{html=mode==='demo'?examples[slot]:await generateModel(prompt,source?.html,env.OPENAI_API_KEY!,model!,context+` Explore alternative ${slot+1}: ${directions[slot]}. Preserve all requested functionality; explicit user constraints take priority.`,value=>{observation=value});}catch(error){errorCode=(observation as ModelObservation|null)?.errorCode??(error instanceof ModelError?'upstream':'output');}
    const updated=new Date().toISOString(),fence={sql:"EXISTS(SELECT 1 FROM forma_requests r JOIN forma_locks l ON l.request_id=r.id WHERE r.id=? AND r.owner=? AND r.status='running' AND l.expires_at>?)",bindings:[requests[slot],who,Date.now()]};
    let saveFailure='storage';
    try { const saved=await db.batch([
      db.prepare(`UPDATE motes_candidates SET status=?,html=?,error_code=?,updated_at=? WHERE id=? AND group_id=? AND status='running' AND ${fence.sql}`).bind(html?'ready':'failed',html,errorCode,updated,ids[slot],groupId,...fence.bindings),
      ...mode==='model'?[usageCompletion(db,requests[slot],who,html?'succeeded':'failed',observation,errorCode,{sql:fence.sql,bindings:fence.bindings})]:[],
      db.prepare(`UPDATE forma_requests SET status=?,result_version_id=? WHERE id=? AND owner=? AND ${fence.sql}`).bind(html?'done':'failed',ids[slot],requests[slot],who,...fence.bindings),
      db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(lockIds[slot],requests[slot]),
    ]);
    if(!saved[0].meta.changes){saveFailure='state_changed';throw new Error('candidate lease expired');}
    } catch {
      // A failed result transaction does not retry the model or affect its peer.
      // Reconcile first: a lost response after commit must retain ready output.
      const current=await db.prepare('SELECT status FROM motes_candidates WHERE id=? AND group_id=?').bind(ids[slot],groupId).first<{status:string}>();
      if(current?.status==='running')await db.batch([
        db.prepare("UPDATE motes_candidates SET status='failed',error_code=?,updated_at=? WHERE id=? AND group_id=? AND status='running'").bind(saveFailure,updated,ids[slot],groupId),
        db.prepare("UPDATE forma_requests SET status='failed' WHERE id=? AND owner=? AND status='running'").bind(requests[slot],who),
        ...mode==='model'?[usageCompletion(db,requests[slot],who,'failed',observation,saveFailure)]:[],
        db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(lockIds[slot],requests[slot]),
      ]);
    }
  };
  // All reservations exist before either fetch starts; failures are independent.
  await Promise.allSettled(ids.map((_,slot)=>run(slot)));
  return json({group:await readCandidateGroup(who,groupId)},201);
}

export async function adoptCandidate(request:Request,groupId:string){
  const who=await owner(request),body=await payload(request),db=database(),group=await groupFor(who,id(groupId));
  if(Object.keys(body).some(k=>!['candidateId','asNew'].includes(k))||(body.asNew!==undefined&&typeof body.asNew!=='boolean'))throw new HttpError(400,'采用方案参数无效。');
  const candidateId=id(body.candidateId),asNew=body.asNew===true||!group.app_id,kind=asNew?'new':'current';
  const candidate=await db.prepare("SELECT * FROM motes_candidates WHERE id=? AND group_id=? AND status='ready'").bind(candidateId,groupId).first<{id:string;html:string;slot:number;adopted_app_id:string|null;adopted_version_id:string|null;adopt_kind:string|null}>();
  if(!candidate)throw new HttpError(409,'该方案尚未成功保存，无法采用。');
  const prior=async()=>{const row=await db.prepare('SELECT adopted_app_id,adopted_version_id,adopt_kind FROM motes_candidates WHERE id=? AND group_id=?').bind(candidateId,groupId).first<{adopted_app_id:string|null;adopted_version_id:string|null;adopt_kind:string|null}>();if(!row?.adopted_app_id)return null;if(row.adopt_kind!==kind)throw new HttpError(409,'此方案已采用，请从对应应用历史创建其他副本。');const own=await db.prepare('SELECT id FROM forma_projects WHERE id=? AND owner=?').bind(row.adopted_app_id,who).first();if(!own)throw new HttpError(404,'已采用应用不属于当前访客。');return json({appId:row.adopted_app_id,versionId:row.adopted_version_id,adopted:true});};
  const existing=await prior();if(existing)return existing;
  const wid=`workspace:${who}`,appId=asNew?crypto.randomUUID():group.app_id!,versionId=crypto.randomUUID(),now=new Date().toISOString();
  const sourceFence=group.app_id?" AND EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=?"+(asNew?'':' AND current_version_id=?')+") AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND expires_at>?)":'';
  const bindings:(string|number)[]=[candidateId,groupId,who,group.managed_project_id,wid,who,...group.app_id?[group.app_id,who,...asNew?[]:[group.base_version_id!],group.app_id,Date.now()]:[],...asNew?[who,LIMITS.apps]:[appId]];
  const guard="EXISTS(SELECT 1 FROM motes_candidates c JOIN motes_candidate_groups g ON g.id=c.group_id WHERE c.id=? AND g.id=? AND g.owner=? AND c.status='ready' AND c.adopted_app_id IS NULL) AND EXISTS(SELECT 1 FROM motes_projects p JOIN motes_workspaces w ON w.id=p.workspace_id WHERE p.id=? AND p.workspace_id=? AND w.owner=? AND p.archived=0)"+sourceFence+(asNew?' AND (SELECT count(*) FROM forma_projects WHERE owner=?)<?':' AND (SELECT count(*) FROM forma_versions WHERE project_id=?)<60');
  const annotation=`采用候选方案 ${String.fromCharCode(65+candidate.slot)}；未额外调用模型。`;
  const statements=[asNew?db.prepare(`INSERT INTO forma_projects(id,owner,title,created_at,updated_at,current_version_id) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(appId,who,initialAppTitle(candidate.html,group.prompt),now,now,versionId,...bindings):db.prepare(`UPDATE forma_projects SET updated_at=? WHERE id=? AND owner=? AND ${guard}`).bind(now,appId,who,...bindings)];
  // Following writes depend on the newly inserted version, then adoption receipt.
  const gate=asNew?'EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=?)':guard;
  const gateBindings=asNew?[appId,who]:bindings;
  statements.push(db.prepare(`INSERT INTO forma_versions(id,project_id,number,prompt,summary,html,created_at,mode,model) SELECT ?,?,coalesce((SELECT max(number) FROM forma_versions WHERE project_id=?),0)+1,?,?,?,?,?,? WHERE ${gate}`).bind(versionId,appId,appId,group.prompt,annotation,candidate.html,now,group.mode,group.model,...gateBindings));
  const versionGate='EXISTS(SELECT 1 FROM forma_versions WHERE id=? AND project_id=?)';
  if(asNew)statements.push(db.prepare(`INSERT INTO motes_apps(app_id,workspace_id,project_id,updated_at) SELECT ?,?,?,? WHERE ${versionGate}`).bind(appId,wid,group.managed_project_id,now,versionId,appId));
  statements.push(db.prepare(`UPDATE forma_projects SET current_version_id=? WHERE id=? AND owner=? AND ${versionGate}`).bind(versionId,appId,who,versionId,appId),db.prepare(`UPDATE motes_candidates SET adopted_app_id=?,adopted_version_id=?,adopt_kind=?,updated_at=? WHERE id=? AND group_id=? AND adopted_app_id IS NULL AND ${versionGate}`).bind(appId,versionId,kind,now,candidateId,groupId,versionId,appId));
  try{const results=await db.batch(statements);if(!results[0].meta.changes){const retry=await prior();if(retry)return retry;throw new HttpError(409,'基准版本、生成锁、目标项目或容量已变化；候选仍保留，可刷新后核对或明确另存私有应用。');}}catch(error){if(error instanceof HttpError)throw error;const retry=await prior();if(retry)return retry;throw error;}
  return json({appId,versionId,adopted:true},201);
}
