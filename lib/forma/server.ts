import { env } from 'cloudflare:workers';
import { snapshotPreferences } from '../motes/version-config';
import { validElementContext,elementGenerationInstructions } from '../motes/element-selection';
import { stageResult, stagedResult, commitGenerationResult } from '../motes/results';
import { generateDemo } from './demo';
import { initialAppTitle } from './app-title';
import { configuredModels, defaultModel } from './model-config';
import { budgetReservation, usageReservation, usageCompletion } from '../motes/usage';
import type { ModelObservation } from './model';
import { readSettings, generationPreferences } from '../motes/settings';
import { generateModel, ModelError } from './model';
import type { Project, Summary, Version } from './types';
import { HttpError, digest, owner, assertOrigin } from './security';
export { COOKIE, digest, owner } from './security';

export function database(){if(!env.DB)throw new HttpError(503,'云端存储暂时不可用，请稍后重试。');return env.DB}
export function modelNames(){return configuredModels(env)}
export function modelName(){return defaultModel(env)}
export async function payload(request:Request){assertOrigin(request);const declared=Number(request.headers.get('content-length')??0);if(declared>16000)throw new HttpError(413,'请求过长。');const text=await request.text();if(text.length>16000)throw new HttpError(413,'请求过长。');try {const value=JSON.parse(text);if(!value || typeof value!=='object'||Array.isArray(value))throw 0;return value as Record<string,unknown>}catch{throw new HttpError(400,'请求格式无效。')}}
export function json(value:unknown,status=200,headers:Record<string,string>={}){return Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}})}
export async function route(run:()=>Promise<Response>){try{return await run()}catch(error){if(error instanceof HttpError)return json({error:error.message,...error.retry?{retry:error.retry}:{}},error.status);console.error('Motes request failed',error instanceof Error?error.message:'unknown');return json({error:'操作失败，请稍后重试。已有版本仍然保留。'},500)}}
type ProjectRow={id:string;title:string;created_at:string;updated_at:string;current_version_id:string};
const summary=(r:ProjectRow):Summary=>({id:r.id,title:r.title,createdAt:r.created_at,updatedAt:r.updated_at,currentVersionId:r.current_version_id});
export async function listProjects(who:string){const {results}=await database().prepare('SELECT id,title,created_at,updated_at,current_version_id FROM forma_projects WHERE owner=? ORDER BY updated_at DESC LIMIT 100').bind(who).all<ProjectRow>();return results.map(summary)}
export async function readProject(who:string,id:string):Promise<Project>{const db=database();const row=await db.prepare('SELECT id,title,created_at,updated_at,current_version_id FROM forma_projects WHERE owner=? AND id=?').bind(who,id).first<ProjectRow>();if(!row)throw new HttpError(404,'项目不存在或不属于当前浏览器。');const {results}=await db.prepare("SELECT v.*,coalesce(a.name,'') AS name,coalesce(a.important,0) AS important FROM forma_versions v LEFT JOIN motes_version_annotations a ON a.version_id=v.id WHERE v.project_id=? ORDER BY v.number ASC").bind(id).all<{id:string;number:number;prompt:string;summary:string;html:string;created_at:string;mode:'demo'|'model'|'manual';model:string|null;name:string;important:number}>();return {...summary(row),versions:results.map(v=>({id:v.id,number:v.number,prompt:v.prompt,summary:v.summary,html:v.html,createdAt:v.created_at,mode:v.mode,name:v.name,important:!!v.important,...v.model?{model:v.model}:{}}))}}
export async function restore(request:Request,id:string){const who=await owner(request);const body=await payload(request);if(typeof body.versionId!=='string')throw new HttpError(400,'请选择要恢复的版本。');const project=await readProject(who,id);if(!project.versions.some(v=>v.id===body.versionId))throw new HttpError(404,'版本不存在。');const result=await database().prepare('UPDATE forma_projects SET current_version_id=?,updated_at=? WHERE id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND expires_at>?)').bind(body.versionId,new Date().toISOString(),id,who,id,Date.now()).run();if(!result.meta.changes)throw new HttpError(409,'项目正在生成，请完成后再恢复版本。');return json({project:await readProject(who,id)})}
export async function generate(request:Request){
  const who=await owner(request),body=await payload(request);
  if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000)throw new HttpError(400,'请输入 1–4000 字的需求。');
  if(body.mode!=='demo'&&body.mode!=='model')throw new HttpError(400,'请选择示例模式或模型模式。');
  if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))throw new HttpError(400,'请求编号无效，请重试。');
  if(body.projectId!==undefined&&(typeof body.projectId!=='string'||body.projectId.length>100))throw new HttpError(400,'项目编号无效。');
  if(body.baseVersionId!==undefined&&typeof body.baseVersionId!=='string')throw new HttpError(400,'基础版本无效。');
  if(body.managedProjectId!==undefined&&(typeof body.managedProjectId!=='string'||!body.managedProjectId||body.managedProjectId.length>128||body.projectId!==undefined))throw new HttpError(400,'创建目标项目无效，只能为新应用指定项目。');
  if(body.model!==undefined&&(typeof body.model!=='string'||!body.model||body.model.length>128||body.mode!=='model'))throw new HttpError(400,'模型参数无效。');
  if(body.elementContext!==undefined&&(!validElementContext(body.elementContext)||body.mode!=='model'||body.elementContext.baseVersionId!==body.baseVersionId||!body.projectId))throw new HttpError(400,'选中元素上下文无效，请重新选择当前版本中的元素。');
  const elementContext=body.elementContext as import('../motes/element-selection').ElementContext|undefined;
  const prompt=body.prompt.trim(),mode=body.mode,requestId=body.requestId,db=database();
  // Preserve the exact legacy hash when the new optional target is absent.
  const identity:unknown[]=[prompt,mode,body.projectId??null,body.baseVersionId??null];
  if(body.managedProjectId!==undefined)identity.push(body.managedProjectId);
  if(body.model!==undefined)identity.push({model:body.model});
  if(elementContext)identity.push({elementContext});
  const fingerprint=await digest(JSON.stringify(identity));
  const prior=await db.prepare('SELECT owner,project_id,status,fingerprint FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;project_id:string;status:string;fingerprint:string}>();
  if(prior){
    if(prior.owner!==who||prior.fingerprint!==fingerprint)throw new HttpError(409,'该请求编号已被使用。');
    if(await stagedResult(db,who,requestId,'generation')){const id=await commitGenerationResult(db,who,requestId);return json({project:await readProject(who,id)});}
    // A terminated worker cannot release its lease. Retire only an expired request;
    // the commit below also requires this request to still own a live lease.
    await db.prepare("UPDATE forma_requests SET status='failed' WHERE id=? AND status='running' AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE request_id=? AND expires_at>?)").bind(requestId,requestId,Date.now()).run();
    const state=await db.prepare('SELECT status FROM forma_requests WHERE id=?').bind(requestId).first<{status:string}>();
    if(state?.status==='done')return json({project:await readProject(who,prior.project_id)});
    throw new HttpError(409,state?.status==='running'?'该请求正在处理，请稍后查看项目。':'该请求未完成，请重新发起生成。',state?.status==='failed'?'new':undefined);
  }
  let selectedModel=modelName();if(mode==='model'&&!selectedModel)throw new HttpError(503,'尚未连接模型。请先使用示例模式；管理员配置模型 Key 和模型名称后可启用。');
  const project=typeof body.projectId==='string'?await readProject(who,body.projectId):undefined;
  const managedProjectId=typeof body.managedProjectId==='string'?body.managedProjectId:undefined;
  if(managedProjectId){
    const target=await db.prepare('SELECT g.archived FROM motes_projects g JOIN motes_workspaces w ON w.id=g.workspace_id WHERE g.id=? AND w.owner=?').bind(managedProjectId,who).first<{archived:number}>();
    if(!target)throw new HttpError(404,'目标项目不存在或不属于当前访客。');
    if(target.archived)throw new HttpError(409,'目标项目已归档，请恢复后再创建应用。');
  }
  if(!project&&body.baseVersionId)throw new HttpError(400,'新项目不能指定历史版本。');
  const base=project?.versions.find(v=>v.id===(body.baseVersionId??project.currentVersionId));if(project&&!base)throw new HttpError(404,'基础版本不存在。');
  if(elementContext&&project?.currentVersionId!==elementContext.baseVersionId)throw new HttpError(409,'选中元素所属版本已变化，请刷新预览后重新选择。','new');
  if(project&&project.versions.length>=60)throw new HttpError(429,'单个项目最多保留 60 个版本，请创建新项目。');
  const settings=await readSettings(db,who,selectedModel,project?{appId:project.id}:managedProjectId?{projectId:managedProjectId}:{},modelNames());
  if(mode==='model'){if(body.model!==undefined&&!modelNames().includes(body.model as string))throw new HttpError(400,'该模型未在服务端可用白名单中。');selectedModel=typeof body.model==='string'?body.model:settings!.effective.model??selectedModel;}
  // Validate demo support before reserving capacity. Demo never silently invokes a model.
  let demo:ReturnType<typeof generateDemo>|undefined;
  if(mode==='demo'){try{demo=generateDemo(prompt,base?.html)}catch(error){throw new HttpError(422,(error as Error).message)}}
  if(!project&&(await listProjects(who)).length>=100)throw new HttpError(429,'当前浏览器最多创建 100 个项目。');
  const id=project?.id??crypto.randomUUID(),now=new Date().toISOString();
  const stateSql=(project?"EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=? AND current_version_id=?) AND (SELECT count(*) FROM forma_versions WHERE project_id=?)<60":"(SELECT count(*) FROM forma_projects WHERE owner=?)<100")+(managedProjectId?" AND EXISTS(SELECT 1 FROM motes_projects g JOIN motes_workspaces w ON w.id=g.workspace_id WHERE g.id=? AND w.owner=? AND g.archived=0)":"");
  const stateBindings=[...project?[id,who,project.currentVersionId,id]:[who],...managedProjectId?[managedProjectId,who]:[]];
  await db.prepare('DELETE FROM forma_locks WHERE expires_at<?').bind(Date.now()).run();
  try{
    const reserved=await db.batch([
      db.prepare('INSERT INTO forma_locks(project_id,request_id,expires_at) VALUES(?,?,?)').bind(id,requestId,Date.now()+210000),
      budgetReservation(db,{id:requestId,owner:who,projectId:id,fingerprint,mode,createdAt:now,fence:{sql:stateSql,bindings:stateBindings}}),
      ...mode==='model'?[usageReservation(db,requestId,who,selectedModel!,base?'modify':'generate',now)]:[],
    ]);
    if(!reserved[1].meta.changes){await db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(id,requestId).run();const state=await db.prepare(`SELECT CASE WHEN ${stateSql} THEN 1 ELSE 0 END AS allowed`).bind(...stateBindings).first<{allowed:number}>();if(!state?.allowed)throw new HttpError(409,'应用、创建目标或容量已变化，请刷新核对后重试。','new');throw new HttpError(429,'今日生成额度已用完，请明天再试。')}
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(409,'项目正在处理其他请求，请稍后重试。')}
  let observation:ModelObservation|null=null;
  try{
    const html=demo?.html??await generateModel(prompt,base?.html,env.OPENAI_API_KEY!,selectedModel!,generationPreferences(settings!.effective,!!base)+(elementContext?elementGenerationInstructions(elementContext):''),value=>{observation=value});
    const version:Version={id:crypto.randomUUID(),number:(project?.versions.at(-1)?.number??0)+1,prompt,summary:demo?.summary??'模型已生成新版本，请在预览中检查功能。',html,createdAt:new Date().toISOString(),mode,...mode==='model'?{model:selectedModel!}:{}};
    await stageResult(db,who,requestId,'generation',{projectId:id,isNew:!project,title:demo?.title??initialAppTitle(html,prompt),version,expectedCurrentVersionId:project?.currentVersionId??null,managedProjectId:managedProjectId??null,observation,config:{operation:elementContext?'element':base?'modify':'generate',baseVersionId:base?.id??null,settings:snapshotPreferences(settings.effective,mode,selectedModel)}});
    await commitGenerationResult(db,who,requestId,true);
  }catch(error){
    if(await stagedResult(db,who,requestId,'generation')){if(error instanceof HttpError)throw error;throw new HttpError(503,'生成结果已暂存，请仅重试保存。');}
    const cleared=await db.batch([db.prepare("UPDATE forma_requests SET status='failed' WHERE id=? AND owner=? AND status='running'").bind(requestId,who),db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(id,requestId)]);
    if(mode==='model')await usageCompletion(db,requestId,who,'failed',observation,error instanceof HttpError?'state_changed':(observation as ModelObservation|null)?.errorCode??'storage').run();
    // Only a confirmed failed reservation can be retried with a new ID. An
    // ambiguous commit/network failure must first reconcile the original ID.
    const retry=cleared[0].meta.changes?'new':undefined;
    if(error instanceof HttpError)throw new HttpError(error.status,error.message,retry??error.retry);
    if(error instanceof ModelError)throw new HttpError(error.status,error.message,retry);
    throw new HttpError(502,error instanceof Error&&/模型/.test(error.message)?error.message:'生成未完成，请重试。已有版本仍然保留。',retry);
  }
  // A read/response failure after commit must leave the idempotency record done.
  return json({project:await readProject(who,id)});
}
