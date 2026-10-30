import type {RequestStatus} from './request-types';
import type {Project} from '../forma/types';

export type RecoveryAttempt = {
  id:string;requestId:string;text:string;projectId?:string;managedProjectId?:string;contextId?:string;
  baseVersionId?:string;mode:'demo'|'model';state:'sending'|'failed';error?:string;startedAt:number;recovered?:boolean;retryConfirmed?:boolean;
};
export type RecoveryContext = {projectId?:string;managedProjectId?:string;contextId?:string};
export type RecoveryIdentity = {attemptId:string;requestId:string;contextKey:string;epoch:number};
export type RecoveryPhase = 'checking'|'running'|'done'|'failed'|'expired'|'not-found'|'unavailable'|'paused'|'cancelled';
export type RecoveryState = {
  identity:RecoveryIdentity;phase:RecoveryPhase;checks:number;maxChecks:number;
  retry:'check'|'same'|'new'|'none';nextDelayMs:number|null;message:string;
};
export const RECOVERY_MAX_CHECKS=20;
const delays=[2000,3000,5000,8000,12000,15000];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function contextKey(context:RecoveryContext):string {
  return JSON.stringify(context.projectId?['app',context.projectId]:['new',context.managedProjectId??null,context.contextId??null]);
}
export function matchesContext(attempt:RecoveryAttempt,context:RecoveryContext):boolean {
  return contextKey(attempt)===contextKey(context);
}
export function recoveryKey(identity:Pick<RecoveryIdentity,'attemptId'|'requestId'|'contextKey'>):string {
  return JSON.stringify([identity.contextKey,identity.attemptId,identity.requestId]);
}
export function initialRecovery(identity:RecoveryIdentity,maxChecks=RECOVERY_MAX_CHECKS):RecoveryState {
  const limit=Number.isFinite(maxChecks)?Math.max(1,Math.min(RECOVERY_MAX_CHECKS,Math.floor(maxChecks))):RECOVERY_MAX_CHECKS;
  return {identity,phase:'checking',checks:0,maxChecks:limit,retry:'check',nextDelayMs:null,message:'正在核对原请求的持久保存结果…'};
}
type Action = {identity:RecoveryIdentity}&(
  | {type:'checking'}|{type:'cancel'}
  | {type:'status';status:RequestStatus}
  | {type:'error';pause?:boolean}
  | {type:'delivery-error'}
);
export function recoveryReducer(state:RecoveryState,action:Action):RecoveryState {
  const a=state.identity,b=action.identity;
  if(a.attemptId!==b.attemptId||a.requestId!==b.requestId||a.contextKey!==b.contextKey||a.epoch!==b.epoch)return state;
  if(action.type==='cancel')return {...state,phase:'cancelled',retry:'check',nextDelayMs:null,message:'已停止本页核对；不会取消已经开始的服务端调用或费用。'};
  if(action.type==='checking')return {...state,phase:'checking',retry:'check',nextDelayMs:null,message:'正在核对原请求的持久保存结果…'};
  const checks=state.checks+(action.type==='delivery-error'?0:1);
  if(action.type==='status'){
    if(action.status.requestId!==a.requestId)return state;
    const status=action.status.status;
    if(status==='done')return {...state,checks,phase:'done',retry:'none',nextDelayMs:null,message:'已找到原请求保存的结果。'};
    if(status==='failed'||status==='expired')return {...state,checks,phase:status,retry:'new',nextDelayMs:null,message:status==='failed'?'原请求已确认失败，可以重新发送。':'原请求已超出有效处理时限，可以重新发送。'};
    if(status==='not-found')return {...state,checks,phase:'not-found',retry:'same',nextDelayMs:null,message:'暂未找到原请求。重试会沿用原编号，避免重复发送。'};
  }
  const pause=checks>=state.maxChecks||(action.type==='error'&&action.pause);
  if(pause)return {...state,checks,phase:'paused',retry:'check',nextDelayMs:null,message:'自动核对已暂停，结果尚未确认。可手动再次检查；停止等待不保证取消服务端调用或费用。'};
  return {...state,checks,phase:action.type==='status'?'running':'unavailable',retry:'check',nextDelayMs:delays[Math.min(checks-1,delays.length-1)],message:action.type==='status'?'原请求仍在有效处理时限内，正在核对结果；不代表页面会让任务在后台持续执行。':'暂时无法取回结果，稍后继续核对同一请求。'};
}

/** Parse only the existing outbox shape. Untrusted storage cannot authorize a new-ID retry. */
export function restoredAttempts(raw:string|null,now=Date.now()):RecoveryAttempt[] {
  let value:unknown;try{value=JSON.parse(raw??'[]');}catch{return [];}
  if(!Array.isArray(value))return [];
  const seen=new Set<string>(),seenIds=new Set<string>(),attempts:RecoveryAttempt[]=[];
  for(const item of value.slice(-20).reverse()){
    if(!item||typeof item!=='object')continue;
    const a=item as Record<string,unknown>;
    if(typeof a.id!=='string'||!uuid.test(a.id)||seenIds.has(a.id)||typeof a.requestId!=='string'||!uuid.test(a.requestId)||seen.has(a.requestId)||typeof a.text!=='string'||!a.text.trim()||a.text.length>4000||(a.mode!=='demo'&&a.mode!=='model'))continue;
    if(['projectId','managedProjectId','baseVersionId','contextId'].some(k=>a[k]!==undefined&&(typeof a[k]!=='string'||!a[k]||String(a[k]).length>128)))continue;
    if(a.projectId&&a.managedProjectId)continue;
    seen.add(a.requestId);seenIds.add(a.id);
    attempts.push({id:a.id,requestId:a.requestId,text:a.text,mode:a.mode,state:'failed',startedAt:typeof a.startedAt==='number'&&Number.isFinite(a.startedAt)&&a.startedAt>0?a.startedAt:now,recovered:true,error:'正在核对刷新前的原请求，请勿重复发送。',...typeof a.projectId==='string'?{projectId:a.projectId}:{},...typeof a.managedProjectId==='string'?{managedProjectId:a.managedProjectId}:{},...typeof a.baseVersionId==='string'?{baseVersionId:a.baseVersionId}:{},...typeof a.contextId==='string'?{contextId:a.contextId}:{}});
  }
  return attempts.reverse();
}

/** Caller keeps the next composer draft separately; retry never consumes it. */
export function prepareRecoveryRetry(attempt:RecoveryAttempt,state:RecoveryState,scope:string,newId:()=>string,now=Date.now()):RecoveryAttempt|null {
  if(state.identity.attemptId!==attempt.id||state.identity.requestId!==attempt.requestId||state.identity.contextKey!==scope||!['same','new'].includes(state.retry))return null;
  const requestId=state.retry==='new'?newId():attempt.requestId;
  if(!uuid.test(requestId))throw new Error('请求编号无效。');
  return {...attempt,requestId,state:'sending',error:undefined,recovered:false,retryConfirmed:undefined,startedAt:now};
}

/** An older read must not drop a newer saved version already in the workbench. */
export function preferSavedProject(current:Project|null,next:Project):Project {
  if(current?.id===next.id&&(current.versions.length>next.versions.length||Date.parse(current.updatedAt)>Date.parse(next.updatedAt)))return current;
  return next;
}

export function removeFinishedAttempt(attempts:RecoveryAttempt[],original:Pick<RecoveryAttempt,'id'|'requestId'>):RecoveryAttempt[] {
  return attempts.filter(a=>a.id!==original.id||a.requestId!==original.requestId);
}
export function failOriginalAttempt(attempts:RecoveryAttempt[],original:Pick<RecoveryAttempt,'id'|'requestId'>,error:string,confirmed=false):RecoveryAttempt[] {
  return attempts.map(a=>a.id===original.id&&a.requestId===original.requestId?{...a,state:'failed',error,recovered:!confirmed,retryConfirmed:confirmed}:a);
}
export function draftAfterSend(current:string,submitted:string,isRetry:boolean):string {
  return !isRetry&&current.trim()===submitted.trim()?'':current;
}
