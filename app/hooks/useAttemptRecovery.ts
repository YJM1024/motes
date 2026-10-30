'use client';

import {useEffect,useRef,useState} from 'react';
import {contextKey,matchesContext,recoveryKey} from '@/lib/motes/recovery-state';
import type {RecoveryAttempt,RecoveryContext,RecoveryState} from '@/lib/motes/recovery-state';
import {pollRecoveredAttempt} from '@/lib/motes/recovery-poll';
import type {RecoveryGuard} from '@/lib/motes/recovery-poll';
import type {RequestStatus} from '@/lib/motes/request-types';

type Props = {
  attempts:RecoveryAttempt[];context:RecoveryContext;enabled:boolean;generation:number;
  isCurrentGeneration?:(generation:number)=>boolean;
  onRecovered:(attempt:RecoveryAttempt,result:Extract<RequestStatus,{status:'done'}>,guard:RecoveryGuard)=>Promise<void>;
};
/** Only restored outbox entries are checked; an active POST is never polled. */
export function useAttemptRecovery({attempts,context,enabled,generation,onRecovered,isCurrentGeneration}:Props) {
  const [states,setStates]=useState<Record<string,RecoveryState>>({}),[refresh,setRefresh]=useState(0);
  const callback=useRef({onRecovered,isCurrentGeneration}),epoch=useRef(0);
  useEffect(()=>{callback.current={onRecovered,isCurrentGeneration};},[onRecovered,isCurrentGeneration]);
  const scope=contextKey(context);
  // Serialize only operation identity/input, excluding UI error/recovery state.
  // Callback state updates therefore cannot restart or accelerate the poll.
  const candidates=JSON.stringify(attempts.filter(a=>a.recovered&&matchesContext(a,context)).slice(-20).map(a=>({id:a.id,requestId:a.requestId,text:a.text,mode:a.mode,state:'failed',startedAt:a.startedAt,projectId:a.projectId,managedProjectId:a.managedProjectId,baseVersionId:a.baseVersionId,elementContext:a.elementContext,contextId:a.contextId,recovered:true})));
  useEffect(()=>{
    if(!enabled)return;
    const list=JSON.parse(candidates) as RecoveryAttempt[];
    if(!list.length)return;
    const controller=new AbortController(),run=++epoch.current;let cursor=0;
    const isCurrent=()=>!controller.signal.aborted&&epoch.current===run&&callback.current.isCurrentGeneration?.(generation)!==false;
    const worker=async()=>{
      while(isCurrent()&&cursor<list.length){
        const attempt=list[cursor++],identity={attemptId:attempt.id,requestId:attempt.requestId,contextKey:scope,epoch:run};
        await pollRecoveredAttempt(attempt,identity,{signal:controller.signal,isCurrent,onState:state=>{
          setStates(previous=>isCurrent()?{...previous,[recoveryKey(identity)]:state}:previous);
        },onRecovered:(a,result,guard)=>callback.current.onRecovered(a,result,guard)});
      }
    };
    void worker();void worker(); // At most two outstanding status/read sequences.
    return ()=>controller.abort();
  },[candidates,scope,enabled,generation,refresh]);
  const stateFor=(attempt:RecoveryAttempt)=>states[recoveryKey({attemptId:attempt.id,requestId:attempt.requestId,contextKey:scope})];
  return {stateFor,checkAgain:()=>setRefresh(n=>n+1),contextKey:scope};
}
