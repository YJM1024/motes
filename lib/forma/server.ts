import { env } from 'cloudflare:workers';
import { generateDemo } from './demo';
import { generateModel, ModelError } from './model';
import type { Project, Summary, Version } from './types';
import { HttpError, digest, owner, assertOrigin } from './security';
export { COOKIE, digest, owner } from './security';

export function database(){if(!env.DB)throw new HttpError(503,'云端存储暂时不可用，请稍后重试。');return env.DB}
export function modelName(){return env.OPENAI_API_KEY && env.OPENAI_MODEL ? env.OPENAI_MODEL : null}
export async function payload(request:Request){assertOrigin(request);const declared=Number(request.headers.get('content-length')??0);if(declared>16000)throw new HttpError(413,'请求过长。');const text=await request.text();if(text.length>16000)throw new HttpError(413,'请求过长。');try {const value=JSON.parse(text);if(!value || typeof value!=='object'||Array.isArray(value))throw 0;return value as Record<string,unknown>}catch{throw new HttpError(400,'请求格式无效。')}}
export function json(value:unknown,status=200,headers:Record<string,string>={}){return Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}})}
export async function route(run:()=>Promise<Response>){try{return await run()}catch(error){if(error instanceof HttpError)return json({error:error.message,...error.retry?{retry:error.retry}:{}},error.status);console.error('Motes request failed',error instanceof Error?error.message:'unknown');return json({error:'操作失败，请稍后重试。已有版本仍然保留。'},500)}}
type ProjectRow={id:string;title:string;created_at:string;updated_at:string;current_version_id:string};
const summary=(r:ProjectRow):Summary=>({id:r.id,title:r.title,createdAt:r.created_at,updatedAt:r.updated_at,currentVersionId:r.current_version_id});
export async function listProjects(who:string){const {results}=await database().prepare('SELECT id,title,created_at,updated_at,current_version_id FROM forma_projects WHERE owner=? ORDER BY updated_at DESC LIMIT 100').bind(who).all<ProjectRow>();return results.map(summary)}
export async function readProject(who:string,id:string):Promise<Project>{const db=database();const row=await db.prepare('SELECT id,title,created_at,updated_at,current_version_id FROM forma_projects WHERE owner=? AND id=?').bind(who,id).first<ProjectRow>();if(!row)throw new HttpError(404,'项目不存在或不属于当前浏览器。');const {results}=await db.prepare('SELECT * FROM forma_versions WHERE project_id=? ORDER BY number ASC').bind(id).all<{id:string;number:number;prompt:string;summary:string;html:string;created_at:string;mode:'demo'|'model';model:string|null}>();return {...summary(row),versions:results.map(v=>({id:v.id,number:v.number,prompt:v.prompt,summary:v.summary,html:v.html,createdAt:v.created_at,mode:v.mode,...v.model?{model:v.model}:{}}))}}
export async function restore(request:Request,id:string){const who=await owner(request);const body=await payload(request);if(typeof body.versionId!=='string')throw new HttpError(400,'请选择要恢复的版本。');const project=await readProject(who,id);if(!project.versions.some(v=>v.id===body.versionId))throw new HttpError(404,'版本不存在。');const result=await database().prepare('UPDATE forma_projects SET current_version_id=?,updated_at=? WHERE id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE project_id=? AND expires_at>?)').bind(body.versionId,new Date().toISOString(),id,who,id,Date.now()).run();if(!result.meta.changes)throw new HttpError(409,'项目正在生成，请完成后再恢复版本。');return json({project:await readProject(who,id)})}
export async function generate(request:Request){
  const who=await owner(request),body=await payload(request);
  if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>4000)throw new HttpError(400,'请输入 1–4000 字的需求。');
  if(body.mode!=='demo'&&body.mode!=='model')throw new HttpError(400,'请选择示例模式或模型模式。');
  if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))throw new HttpError(400,'请求编号无效，请重试。');
  if(body.projectId!==undefined&&(typeof body.projectId!=='string'||body.projectId.length>100))throw new HttpError(400,'项目编号无效。');
  if(body.baseVersionId!==undefined&&typeof body.baseVersionId!=='string')throw new HttpError(400,'基础版本无效。');
  const prompt=body.prompt.trim(),mode=body.mode,requestId=body.requestId,db=database();
  const fingerprint=await digest(JSON.stringify([prompt,mode,body.projectId??null,body.baseVersionId??null]));
  const prior=await db.prepare('SELECT owner,project_id,status,fingerprint FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;project_id:string;status:string;fingerprint:string}>();
  if(prior){
    if(prior.owner!==who||prior.fingerprint!==fingerprint)throw new HttpError(409,'该请求编号已被使用。');
    // A terminated worker cannot release its lease. Retire only an expired request;
    // the commit below also requires this request to still own a live lease.
    await db.prepare("UPDATE forma_requests SET status='failed' WHERE id=? AND status='running' AND NOT EXISTS(SELECT 1 FROM forma_locks WHERE request_id=? AND expires_at>?)").bind(requestId,requestId,Date.now()).run();
    const state=await db.prepare('SELECT status FROM forma_requests WHERE id=?').bind(requestId).first<{status:string}>();
    if(state?.status==='done')return json({project:await readProject(who,prior.project_id)});
    throw new HttpError(409,state?.status==='running'?'该请求正在处理，请稍后查看项目。':'该请求未完成，请重新发起生成。',state?.status==='failed'?'new':undefined);
  }
  const selectedModel=modelName();if(mode==='model'&&!selectedModel)throw new HttpError(503,'尚未连接模型。请先使用示例模式；管理员配置模型 Key 和模型名称后可启用。');
  const project=typeof body.projectId==='string'?await readProject(who,body.projectId):undefined;
  if(!project&&body.baseVersionId)throw new HttpError(400,'新项目不能指定历史版本。');
  const base=project?.versions.find(v=>v.id===(body.baseVersionId??project.currentVersionId));if(project&&!base)throw new HttpError(404,'基础版本不存在。');
  if(project&&project.versions.length>=60)throw new HttpError(429,'单个项目最多保留 60 个版本，请创建新项目。');
  // Validate demo support before reserving capacity. Demo never silently invokes a model.
  let demo:ReturnType<typeof generateDemo>|undefined;
  if(mode==='demo'){try{demo=generateDemo(prompt,base?.html)}catch(error){throw new HttpError(422,(error as Error).message)}}
  if(!project&&(await listProjects(who)).length>=100)throw new HttpError(429,'当前浏览器最多创建 100 个项目。');
  const id=project?.id??crypto.randomUUID(),now=new Date().toISOString(),day=now.slice(0,10),max=mode==='model'?10:100,globalMax=mode==='model'?50:2000;
  await db.prepare('DELETE FROM forma_locks WHERE expires_at<?').bind(Date.now()).run();
  try{
    const reserved=await db.batch([
      db.prepare('INSERT INTO forma_locks(project_id,request_id,expires_at) VALUES(?,?,?)').bind(id,requestId,Date.now()+210000),
      db.prepare("INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at) SELECT ?,?,?,?,?,?,'running',? WHERE (SELECT count(*) FROM forma_requests WHERE owner=? AND day=? AND mode=?)<? AND (SELECT count(*) FROM forma_requests WHERE day=? AND mode=?)<?").bind(requestId,who,id,fingerprint,day,mode,now,who,day,mode,max,day,mode,globalMax),
    ]);
    if(!reserved[1].meta.changes){await db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(id,requestId).run();throw new HttpError(429,'今日生成额度已用完，请明天再试。')}
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(409,'项目正在处理其他请求，请稍后重试。')}
  try{
    const html=demo?.html??await generateModel(prompt,base?.html,env.OPENAI_API_KEY!,selectedModel!);
    const version:Version={id:crypto.randomUUID(),number:(project?.versions.at(-1)?.number??0)+1,prompt,summary:demo?.summary??'模型已生成新版本，请在预览中检查功能。',html,createdAt:new Date().toISOString(),mode,...mode==='model'?{model:selectedModel!}:{}};
    // Every write is fenced by the live lease in this atomic batch. An expired
    // worker must never overwrite a newer request or a restored version.
    const guard="EXISTS(SELECT 1 FROM forma_locks l JOIN forma_requests r ON r.id=l.request_id WHERE l.project_id=? AND l.request_id=? AND l.expires_at>? AND r.status='running')";
    const lease=[id,requestId,Date.now()];
    const committed=await db.batch([
      project?db.prepare(`UPDATE forma_projects SET current_version_id=?,updated_at=? WHERE id=? AND owner=? AND ${guard}`).bind(version.id,version.createdAt,id,who,...lease):db.prepare(`INSERT INTO forma_projects(id,owner,title,created_at,updated_at,current_version_id) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id,who,demo?.title??prompt.slice(0,40),now,version.createdAt,version.id,...lease),
      db.prepare(`INSERT INTO forma_versions(id,project_id,number,prompt,summary,html,created_at,mode,model) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(version.id,id,version.number,prompt,version.summary,html,version.createdAt,mode,version.model??null,...lease),
      db.prepare(`UPDATE forma_requests SET status='done',result_version_id=? WHERE id=? AND owner=? AND ${guard}`).bind(version.id,requestId,who,...lease),
      db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(id,requestId),
    ]);
    if(!committed[0].meta.changes)throw new HttpError(409,'本次请求已超时，请重新发起生成。','new');
  }catch(error){
    const cleared=await db.batch([db.prepare("UPDATE forma_requests SET status='failed' WHERE id=? AND owner=? AND status='running'").bind(requestId,who),db.prepare('DELETE FROM forma_locks WHERE project_id=? AND request_id=?').bind(id,requestId)]);
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
