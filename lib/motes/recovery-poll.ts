import type {RequestStatus} from './request-types';
import {initialRecovery,recoveryReducer} from './recovery-state';
import type {RecoveryAttempt,RecoveryIdentity,RecoveryState} from './recovery-state';

export class RecoveryQueryError extends Error {constructor(message:string,public pause=false){super(message);}}
export async function queryRequestStatus(id:string,signal:AbortSignal):Promise<RequestStatus> {
  const response=await fetch(`/api/requests/${encodeURIComponent(id)}`,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
  if(response.status===404)return {requestId:id,status:'not-found'};
  if(!response.ok)throw new RecoveryQueryError(response.status===401?'会话已失效，请重新连接后核对。':'暂时无法查询原请求。',[400,401,403].includes(response.status));
  const value=await response.json() as RequestStatus;
  if(value.requestId!==id||!['done','running','failed','expired'].includes(value.status))throw new RecoveryQueryError('请求状态响应无效。');
  if(value.status==='done'&&(!value.projectId||!value.resultVersionId||value.result?.projectId!==value.projectId||value.result?.versionId!==value.resultVersionId))throw new RecoveryQueryError('保存结果尚未完整返回。');
  return value;
}
function wait(ms:number,signal:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}
export type RecoveryGuard = {signal:AbortSignal;isCurrent:()=>boolean};
export type RecoveryPollOptions = RecoveryGuard & {
  query?:(id:string,signal:AbortSignal)=>Promise<RequestStatus>;
  wait?:(ms:number,signal:AbortSignal)=>Promise<void>;
  maxChecks?:number;
  onState:(state:RecoveryState)=>void;
  onRecovered:(attempt:RecoveryAttempt,result:Extract<RequestStatus,{status:'done'}>,guard:RecoveryGuard)=>Promise<void>;
};
/** Finite, read-only reconciliation; no generation, lease renewal or background queue. */
export async function pollRecoveredAttempt(attempt:RecoveryAttempt,identity:RecoveryIdentity,options:RecoveryPollOptions):Promise<void> {
  let state=initialRecovery(identity,options.maxChecks);
  const current=()=>!options.signal.aborted&&options.isCurrent();
  const emit=()=>{if(current())options.onState(state);};
  await Promise.resolve(); // Never synchronously update React from an effect.
  while(current()){
    state=recoveryReducer(state,{type:'checking',identity});emit();
    try {
      const status=await (options.query??queryRequestStatus)(attempt.requestId,options.signal);
      if(!current())return;
      if(status.requestId!==identity.requestId)throw new RecoveryQueryError('原请求核对响应不匹配。');
      state=recoveryReducer(state,{type:'status',identity,status});
      if(status.status==='done'){
        try {await options.onRecovered(attempt,status,{signal:options.signal,isCurrent:current});}
        catch {if(!current())return;state=recoveryReducer(state,{type:'delivery-error',identity});}
      }
    }catch(error){
      if(!current())return;
      state=recoveryReducer(state,{type:'error',identity,pause:error instanceof RecoveryQueryError&&error.pause});
    }
    if(!current())return;emit();
    if(state.nextDelayMs===null)return;
    try {await (options.wait??wait)(state.nextDelayMs,options.signal);}catch{return;}
  }
}
