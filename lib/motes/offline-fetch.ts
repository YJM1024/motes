import {offlineCoreText} from './locale/offline-core';
/** Shared-workspace boundary adapter; never queues a model call or arbitrary API write. */
import type {Project,Summary} from '../forma/types';
import {generateDemo} from '../forma/demo';
import {browserOfflineStore,entry,offlineId,OfflineError} from './offline-store';
import {OFFLINE_WORKSPACE,cacheOfflineProject,readOfflineProject,saveLocalVersion,saveLocalApp,getLocalRuntime,setLocalRuntime,cacheRuntime,listOfflineOperations} from './offline-engine';
let transportDown=false;
const userAborted=(signal:AbortSignal)=>signal.aborted&&(signal.reason as {name?:string}|undefined)?.name!=='TimeoutError';
const cachePath=(url:URL)=>{const search=new URLSearchParams(url.search);search.sort();return url.pathname+(search.size?'?'+search:'')};
const snapshotId=(path:string)=>offlineId(OFFLINE_WORKSPACE,'snapshot',path);
type Snapshot={url:string;data:Record<string,unknown>};
export function offlineNetworkUnavailable(){return transportDown||(typeof navigator!=='undefined'&&!navigator.onLine)}
function networkState(down:boolean){if(transportDown!==down){transportDown=down;globalThis.dispatchEvent?.(new Event('motes-offline-network'))}}
const response=(value:unknown,status=200,offline=false)=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...offline?{'X-Motes-Offline':'true'}:{}}});
async function cached(path:string){return(await browserOfflineStore.get<Snapshot>(snapshotId(path)))?.value.data}
async function activeWorkspace(){const session=await cached('/api/session');if(session?.visibility!=='shared'||session.workspaceId!==OFFLINE_WORKSPACE)throw new OfflineError('workspace_not_cached');return OFFLINE_WORKSPACE}
async function summaries(wid:string,base:unknown){const rows=Array.isArray(base)?base as Summary[]:[],local=await browserOfflineStore.list<Project>(wid,'project'),map=new Map(rows.map(p=>[p.id,p]));for(const {value:p}of local)if(map.has(p.id)||p.id.startsWith('local-app:')||p.versions.some(v=>v.id.startsWith('local-version:')))map.set(p.id,{id:p.id,title:p.title,createdAt:p.createdAt,updatedAt:p.updatedAt,currentVersionId:p.currentVersionId});return[...map.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,100)}
export async function cacheOfflineResponse(path:string,data:Record<string,unknown>){
 if(path==='/api/session'&&(data.visibility!=='shared'||data.workspaceId!==OFFLINE_WORKSPACE)){await browserOfflineStore.atomic([snapshotId(path)],rows=>rows.delete(snapshotId(path)));return;}
 if(path!=='/api/session')await activeWorkspace();
 const id=snapshotId(path);await browserOfflineStore.atomic([id],rows=>rows.set(id,entry(OFFLINE_WORKSPACE,'snapshot',path,{url:path,data})));
 if(data.project&&/^\/api\/projects\//.test(path))await cacheOfflineProject(OFFLINE_WORKSPACE,data.project as Project);
}
const defaults={creationMode:'demo',previewDevice:'desktop',autoFollow:true,showWaitTimer:true,language:'zh-CN',visualStyle:'minimal'};
export async function createOfflineDemo(body:Record<string,unknown>){
 const wid=await activeWorkspace(),requestId=typeof body.requestId==='string'?body.requestId:crypto.randomUUID(),old=typeof body.projectId==='string'?await readOfflineProject(wid,body.projectId):undefined;
 if(body.mode==='model')throw new OfflineError('offline_ai_unavailable');if(typeof body.projectId==='string'&&!old)throw new OfflineError('app_not_cached');
 const base=old?.versions.find(v=>v.id===(body.baseVersionId??old.currentVersionId)),kind=String(body.kind??''),prompt=typeof body.prompt==='string'?body.prompt:kind==='timer'?'番茄钟':kind==='kanban'?'任务看板':kind==='budget'?'旅行预算计算器':'新建空白应用';
 const generated=kind==='empty'?{title:'空白应用',html:'<!doctype html><html><head><meta charset="utf-8"><title>离线空白应用</title></head><body><main><h1>离线空白应用</h1><p>内容仅保存在本浏览器，联网后需明确同步。</p></main></body></html>'}:generateDemo(prompt,base?.html);
 if(old)return saveLocalVersion({workspaceId:wid,appId:old.id,requestId,baseVersionId:base?.id??old.currentVersionId,expectedCurrentVersionId:old.currentVersionId,html:generated.html,name:'离线示例修改'});
 const timestamp=new Date().toISOString(),id='local-app:'+requestId,versionId='local-version:'+requestId,title=typeof body.title==='string'?body.title.slice(0,80):generated.title;
 const project:Project={id,title,createdAt:timestamp,updatedAt:timestamp,currentVersionId:versionId,versions:[{id:versionId,number:1,prompt,summary:'离线示例，未调用模型；尚未同步公共空间。',html:generated.html,mode:'demo',createdAt:timestamp}]};
 const backup={format:'motes-backup',version:1,exportedAt:timestamp,project:{name:'离线作品',description:'用户明确同步的本地作品',settings:defaults},tags:[],apps:[{name:title,description:'离线创建的独立副本',starred:false,archived:false,tagKeys:[],settings:defaults,currentVersion:1,versions:[{number:1,prompt,summary:project.versions[0].summary,html:generated.html,createdAt:timestamp,mode:'demo',model:null,name:'离线示例',important:false}]}]};
 return saveLocalApp(wid,project,backup,requestId);
}
async function offlineRead(url:URL){
 const wid=await activeWorkspace(),path=cachePath(url);let value=await cached(path);
 const appMatch=/^\/api\/projects\/([^/]+)$/.exec(url.pathname);
 if(appMatch){const project=await readOfflineProject(wid,decodeURIComponent(appMatch[1]));if(!project)throw new OfflineError('app_not_cached');return response({project,offline:true},200,true)}
 if(path==='/api/session'){if(!value)throw new OfflineError('workspace_not_cached');return response({...value,offline:true,mode:'demo',model:null,models:[],projects:await summaries(wid,value.projects)},200,true)}
 if(path==='/api/projects')return response({projects:await summaries(wid,(await cached('/api/session'))?.projects),offline:true},200,true);
 if(url.pathname==='/api/settings'){
  value??=await cached('/api/settings');if(!value)throw new OfflineError('settings_not_cached');return response({...value,selection:Object.fromEntries(url.searchParams),offline:true,modelAvailable:false,models:[],effective:{...(value.effective as object),creationMode:'demo'}},200,true);
 }
 if(url.pathname==='/api/workspace'){
  value??=(await browserOfflineStore.list<Snapshot>(wid,'snapshot')).find(r=>r.value.url.startsWith('/api/workspace?'))?.value.data;
  if(!value)throw new OfflineError('workspace_not_cached');const apps=await summaries(wid,[]),known=Array.isArray(value.apps)?value.apps as Record<string,unknown>[]:[],local=apps.filter(a=>a.id.startsWith('local-app:')).map(a=>({...a,workspaceId:wid,projectId:(value!.workspace as {defaultProjectId:string}).defaultProjectId,name:a.title,description:'离线作品',archived:false,starred:false,tagIds:[]}));return response({...value,apps:[...known,...local],offline:true},200,true);
 }
 // Quotas, tasks and unknown requests must not become fictitious offline success.
 if(url.pathname==='/api/usage')return response({error:offlineCoreText('离线时无法核对实时用量。'),code:'offline_usage_unknown',offline:true},503,true);
 if(!value)throw new OfflineError('not_cached');return response({...value,offline:true},200,true);
}
let warming=false;
async function warmBasics(){if(warming)return;warming=true;try{for(const path of['/api/settings','/api/workspace?archived=all']){const r=await fetch(path,{credentials:'same-origin',cache:'no-store'});if(r.ok)await cacheOfflineResponse(path,await r.json())}}catch{}finally{warming=false}}
const readAllowed=(path:string)=>path==='/api/session'||path==='/api/projects'||/^\/api\/projects\/[^/]+$/.test(path)||['/api/settings','/api/workspace','/api/usage'].includes(path);
/** SDK scope is supplied only by the authenticated host, never by child messages. */
async function runtimeRequest(body:{action:'get'|'set';appId:string;versionId:string;key:string;value?:unknown;expectedRevision?:number},signal?:AbortSignal){
 const wid=await activeWorkspace(),scope={appId:body.appId,versionId:body.versionId,key:body.key},existing=await getLocalRuntime(wid,scope);
 if(body.action==='get'){
  if(offlineNetworkUnavailable()||existing.dirty||body.appId.startsWith('local-app:'))return response({...existing,updatedAt:null,offline:true},200,true);
  try{const r=await fetch('/api/runtime-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});if(!r.ok)return r;const data=await r.json() as Record<string,unknown>,record=await cacheRuntime(wid,scope,data.value,Number(data.revision));networkState(false);return response({key:body.key,value:record.value,revision:record.revision,updatedAt:data.updatedAt})}catch(error){if(signal&&userAborted(signal)||error instanceof OfflineError)throw error;networkState(true);return response({...existing,updatedAt:null,offline:true},200,true)}
 }
 const record=await setLocalRuntime(wid,scope,body.value,Number(body.expectedRevision)),operation=(await listOfflineOperations(wid)).find(o=>o.id===record.operationId)!;
 if(offlineNetworkUnavailable()||existing.dirty||body.appId.startsWith('local-app:'))return response({key:body.key,revision:record.revision,updatedAt:null,offline:true},200,true);
 // Online writes also journal first, so a lost response keeps a recoverable branch.
 try{const r=await fetch('/api/runtime-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,expectedRevision:existing.serverRevision??0}),signal});if(!r.ok){if(r.status<500){const {markOfflineConflict}=await import('./offline-engine');await markOfflineConflict(wid,operation.id,'http_'+r.status)}return r;}const data=await r.json() as Record<string,unknown>;await import('./offline-engine').then(async({syncRuntimeReceipt})=>syncRuntimeReceipt(wid,operation,Number(data.revision)));return response({key:body.key,revision:record.revision,updatedAt:data.updatedAt})}catch(error){if(signal&&userAborted(signal))throw error;networkState(true);return response({key:body.key,revision:record.revision,updatedAt:null,offline:true},200,true)}
}
export async function offlineFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const request=new Request(input instanceof Request?input:new URL(String(input),globalThis.location?.origin??'http://localhost'),init),url=new URL(request.url),method=request.method;
 if(typeof window==='undefined'||url.origin!==location.origin||!url.pathname.startsWith('/api/'))return fetch(request);
 try{
  if(method==='GET'&&readAllowed(url.pathname)){
   const localMatch=/^\/api\/projects\/(local-app:[^/]+)$/.exec(decodeURIComponent(url.pathname));if(localMatch)return offlineRead(url);
   if(!offlineNetworkUnavailable()||url.pathname==='/api/session'&&navigator.onLine)try{const r=await fetch(request);if(r.status<500){networkState(false);if(r.ok)try{const data=await r.clone().json() as Record<string,unknown>;await cacheOfflineResponse(cachePath(url),data);if(url.pathname==='/api/session'){void warmBasics();return response({...data,projects:await summaries(OFFLINE_WORKSPACE,data.projects)})}const match=/^\/api\/projects\/([^/]+)$/.exec(url.pathname);if(match){const local=await readOfflineProject(OFFLINE_WORKSPACE,decodeURIComponent(match[1]));if(local)return response({...data,project:local})}}catch{}return r}networkState(true)}catch(error){if(userAborted(request.signal))throw error;networkState(true)}
   return offlineRead(url);
  }
  if(method!=='POST')return fetch(request);
  const body=await request.clone().json() as Record<string,unknown>;
  if(!offlineNetworkUnavailable()&&!/^\/api\/projects\/[^/]+\/source$/.test(url.pathname))return fetch(request);
  const wid=await activeWorkspace();
  const source=/^\/api\/projects\/([^/]+)\/source$/.exec(url.pathname);
  if(source){const appId=decodeURIComponent(source[1]),project=await saveLocalVersion({workspaceId:wid,appId,requestId:String(body.requestId),baseVersionId:String(body.baseVersionId),expectedCurrentVersionId:String(body.expectedCurrentVersionId),html:body.html as string,name:body.name as string|undefined});if(offlineNetworkUnavailable()||appId.startsWith('local-app:')||String(body.expectedCurrentVersionId).startsWith('local-version:'))return response({project,offline:true,saved:true,source:'offline'},202,true);
   try{const r=await fetch(request);if(r.ok){const data=await r.clone().json() as {project:Project};const {acknowledgeSource}=await import('./offline-engine');await acknowledgeSource(wid,String(body.requestId),data.project);return r}const {markOfflineConflict}=await import('./offline-engine');if(r.status<500)await markOfflineConflict(wid,String(body.requestId),'http_'+r.status);return r}catch(error){if(userAborted(request.signal))throw error;networkState(true);return response({project,offline:true,saved:true,source:'offline'},202,true)}
  }
  if(offlineNetworkUnavailable()){
   if(url.pathname==='/api/generate'&&body.mode==='demo'||url.pathname==='/api/apps/seed')return response({project:await createOfflineDemo(body),offline:true},201,true);
   const restore=/^\/api\/projects\/([^/]+)\/restore$/.exec(url.pathname);if(restore){const p=await readOfflineProject(wid,decodeURIComponent(restore[1])),v=p?.versions.find(v=>v.id===body.versionId);if(!p||!v)throw new OfflineError('app_not_cached');const project=await saveLocalVersion({workspaceId:wid,appId:p.id,requestId:crypto.randomUUID(),baseVersionId:v.id,expectedCurrentVersionId:p.currentVersionId,html:v.html,name:'离线还原副本'});return response({project,offline:true,restoreAsBranch:true},200,true)}
   return response({error:offlineCoreText('离线时此操作不可用；真实 AI 不会被离线执行或排队。'),code:'offline_operation_unavailable',offline:true},503,true);
  }
  return fetch(request);
 }catch(error){if(userAborted(request.signal))throw error;const code=error instanceof OfflineError?error.code:'offline_storage_unavailable';if(!offlineNetworkUnavailable()&&['storage_unavailable','storage_blocked','workspace_not_cached','app_not_cached','offline_storage_unavailable'].includes(code))return fetch(request);return response({error:code==='local_conflict'?offlineCoreText('本地版本已变化，请保留内容并重新核对。'):offlineCoreText('离线副本不可用或尚未缓存；请联网读取后再试。'),code,offline:true},code==='local_conflict'?409:503,true)}
}

export async function probeOfflineNetwork(){try{const r=await fetch('/api/session',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});if(!r.ok)return false;const data=await r.json() as Record<string,unknown>;await cacheOfflineResponse('/api/session',data);if(data.visibility!=='shared'||data.workspaceId!==OFFLINE_WORKSPACE)return false;networkState(false);return true}catch{networkState(true);return false}}

export const offlineRuntimeRequest:typeof runtimeRequest=async(body,signal)=>{try{return await runtimeRequest(body,signal)}catch(error){if(!offlineNetworkUnavailable()&&error instanceof OfflineError&&['storage_unavailable','storage_blocked','workspace_not_cached','local_capacity'].includes(error.code))return fetch('/api/runtime-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});throw error}};
