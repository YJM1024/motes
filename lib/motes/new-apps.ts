import {database,json,payload,readProject} from '../forma/server';
import {owner,digest,HttpError} from '../forma/security';
import {generateDemo} from '../forma/demo';
import {initializeWorkspace,LIMITS} from './management';
export type NewAppKind='empty'|'budget'|'kanban'|'timer';
const prompts={budget:'旅行预算计算器',kanban:'任务看板',timer:'番茄钟'};
const emptyHtml='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>空白应用</title><style>body{margin:0;padding:40px 24px;background:#fafaf9;color:#334155;font:16px/1.7 system-ui,sans-serif}main{max-width:760px;margin:10vh auto}h1{font-size:28px}p{color:#64748b}</style></head><body><main><h1>从一个想法开始</h1><p>这是一个空白私有应用。回到工作台描述你想添加的内容，再明确发送构建需求。</p></main></body></html>';
function identifier(value:unknown){if(typeof value!=='string'||!value||value.length>128)throw new HttpError(400,'目标项目编号无效。');return value;}
export async function createSeedApp(request:Request){
 const who=await owner(request),body=await payload(request),db=database();if(Object.keys(body).some(k=>!['requestId','kind','managedProjectId','title'].includes(k))||!['empty','budget','kanban','timer'].includes(body.kind as string)||typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)||(body.title!==undefined&&(typeof body.title!=='string'||!body.title.trim()||body.title.length>80)))throw new HttpError(400,'新建应用参数无效。');
 const kind=body.kind as NewAppKind,requestId=body.requestId,wid=await initializeWorkspace(who),target=body.managedProjectId===undefined?'project:'+who:identifier(body.managedProjectId),fingerprint=await digest(JSON.stringify(['seed-app-v1',kind,target,body.title??null]));
 const prior=async()=>{const row=await db.prepare('SELECT owner,mode,status,fingerprint,project_id FROM forma_requests WHERE id=?').bind(requestId).first<{owner:string;mode:string;status:string;fingerprint:string;project_id:string}>();if(!row)return null;if(row.owner!==who||row.mode!=='seed-app'||row.status!=='done'||row.fingerprint!==fingerprint)throw new HttpError(409,'此新建请求编号已被使用。');return json({project:await readProject(who,row.project_id),kind,created:true});};const old=await prior();if(old)return old;
 const demo=kind==='empty'?null:generateDemo(prompts[kind]),html=demo?.html??emptyHtml,title=typeof body.title==='string'?body.title.trim():demo?.title??'空白应用',appId=crypto.randomUUID(),versionId=crypto.randomUUID(),now=new Date().toISOString();
 const gate='EXISTS(SELECT 1 FROM forma_projects WHERE id=? AND owner=? AND current_version_id=?)',args=[appId,who,versionId];let result:D1Result[];
 try{result=await db.batch([
  db.prepare('INSERT INTO forma_projects(id,owner,title,created_at,updated_at,current_version_id) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM motes_projects p JOIN motes_workspaces w ON w.id=p.workspace_id WHERE p.id=? AND p.workspace_id=? AND w.owner=? AND p.archived=0) AND (SELECT count(*) FROM forma_projects WHERE owner=?)<?').bind(appId,who,title,now,now,versionId,target,wid,who,who,LIMITS.apps),
  db.prepare('INSERT INTO forma_versions(id,project_id,number,prompt,summary,html,created_at,mode,model) SELECT ?,?,1,?,?,?,?,?,NULL WHERE '+gate).bind(versionId,appId,kind==='empty'?'新建空白应用':'从内置示例创建：'+title,kind==='empty'?'新建空白私有应用，未调用模型。':'从内置示例创建独立私有副本，未调用模型，也未修改旧应用。',html,now,kind==='empty'?'manual':'demo',...args),
  db.prepare("INSERT INTO motes_version_config(version_id,operation,base_version_id,settings_json,created_at) SELECT ?,'manual',NULL,NULL,? WHERE "+gate).bind(versionId,now,...args),
  db.prepare('INSERT INTO motes_apps(app_id,workspace_id,project_id,description,updated_at) SELECT ?,?,?,?,? WHERE '+gate).bind(appId,wid,target,kind==='empty'?'空白私有应用':'内置示例的独立副本',now,...args),
  ...kind!=='empty'?[db.prepare("INSERT INTO motes_settings(workspace_id,scope_type,scope_id,setting_key,value_json,updated_at) SELECT ?,'app',?,'creationMode','\"demo\"',? WHERE "+gate).bind(wid,appId,now,...args)]:[],
  db.prepare("INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at,result_version_id) SELECT ?,?,?,?,?,'seed-app','done',?,? WHERE "+gate).bind(requestId,who,appId,fingerprint,now.slice(0,10),now,versionId,...args),
 ]);}catch(error){const retry=await prior();if(retry)return retry;throw error;}
 if(!result[0].meta.changes){const retry=await prior();if(retry)return retry;throw new HttpError(409,'目标项目归属、归档状态或100个应用容量已变化，未修改任何旧应用。');}return json({project:await readProject(who,appId),kind,created:true},201);
}
