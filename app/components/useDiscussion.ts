'use client';
import { useEffect, useRef, useState } from 'react';
import type { DiscussionContext, DiscussionRequestStatus, DiscussionSnapshot, DiscussionTurn } from '@/lib/motes/discussion-types';
import { DISCUSSION_RECOVERY, mergeDiscussion, type DiscussionAttempt } from '@/lib/motes/discussion-client';

class DiscussionApiError extends Error { constructor(message:string,public status:number,public retry?:'new'){super(message)} }
async function api<T>(url:string,body?:object,signal?:AbortSignal,long=false):Promise<T>{
  const response=await fetch(url,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(long?140000:15000)]):AbortSignal.timeout(15000)});
  const text=await response.text();let data:T&{error?:string;retry?:'new'};try{data=JSON.parse(text)}catch{throw new DiscussionApiError('服务没有返回有效结果，请先核对讨论状态。',response.status)}
  if(!response.ok)throw new DiscussionApiError(data.error||'讨论暂时无法完成。',response.status,data.retry);return data;
}
function loadStored<T>(key:string,fallback:T):T{try{return JSON.parse(sessionStorage.getItem(key)||'null')||fallback}catch{return fallback}}
function persist(key:string,value:unknown){try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
const outboxKey='motes-discussion-outbox',draftKey='motes-discussion-drafts';
export function useDiscussion(context:Omit<DiscussionContext,'threadId'>,intent:'build'|'discuss',fresh=false){
  const [snapshot,setSnapshot]=useState<DiscussionSnapshot|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [drafts,setDrafts]=useState<Record<string,string>>({}),[attempts,setAttempts]=useState<DiscussionAttempt[]>([]);
  const [elapsed,setElapsed]=useState(0);
  const state=useRef<DiscussionSnapshot|null>(null),abort=useRef<AbortController|null>(null),epoch=useRef(0),active=useRef<string|null>(null),polling=useRef(false),creating=useRef(false);
  const namespace=useRef<string|null>(null);
  const scope=context.appId?'app:'+context.appId:'pre:'+(context.managedProjectId||'default'),selectionKey=(wid:string)=>'motes-discussion-selected:'+wid+':'+scope;
  const threadId=snapshot?.thread?.id;
  function query(id?:string){const params=new URLSearchParams({...context,...id?{threadId:id}:{}});return '/api/discussions'+(params.size?'?'+params.toString():'')}
  function apply(next:DiscussionSnapshot){
    if(namespace.current!==next.workspaceId){namespace.current=next.workspaceId;state.current=null;const storedDrafts=loadStored<Record<string,string>>(draftKey+':'+next.workspaceId,{});setDrafts(Object.fromEntries(Object.entries(storedDrafts).filter(([key,value])=>typeof key==='string'&&typeof value==='string'&&value.length<=10000).slice(-150)));const stored=loadStored<DiscussionAttempt[]>(outboxKey+':'+next.workspaceId,[]);setAttempts(Array.isArray(stored)?stored.filter(a=>a&&typeof a.requestId==='string'&&typeof a.threadId==='string'&&typeof a.prompt==='string'&&a.prompt.length<=4000).map(a=>({...a,state:a.state==='sending'?'checking':a.state})):[])}
    state.current=mergeDiscussion(state.current,next);setSnapshot(state.current);if(next.thread){try{localStorage.setItem(selectionKey(next.workspaceId),next.thread.id)}catch{}}
  }
  function updateAttempt(value:DiscussionAttempt){setAttempts(old=>{const next=[...old.filter(a=>a.requestId!==value.requestId),value].slice(-50);if(namespace.current)persist(outboxKey+':'+namespace.current,next);return next})}
  function removeAttempt(id:string){setAttempts(old=>{const next=old.filter(a=>a.requestId!==id);if(namespace.current)persist(outboxKey+':'+namespace.current,next);return next})}
  function setDraft(value:string){const id=state.current?.thread?.id;if(!id)return;setDrafts(old=>{const next={...old,[id]:value};if(namespace.current)persist(draftKey+':'+namespace.current,next);return next})}
  async function newThread(){if(creating.current||active.current||polling.current)return;creating.current=true;setLoading(true);setError('');const generation=++epoch.current;
    try{const next=await api<DiscussionSnapshot>('/api/discussions/threads',{threadId:crypto.randomUUID(),...context},abort.current?.signal);if(epoch.current!==generation)return;state.current=null;apply(next)}catch(e){if(epoch.current===generation&&!abort.current?.signal.aborted)setError(e instanceof Error?e.message:'无法创建讨论。')}finally{creating.current=false;if(epoch.current===generation)setLoading(false)}
  }
  async function reload(){const generation=epoch.current;setLoading(true);setError('');try{const next=await api<DiscussionSnapshot>(query(state.current?.thread?.id),undefined,abort.current?.signal);if(generation===epoch.current)apply(next)}catch(e){if(generation===epoch.current)setError(e instanceof Error?e.message:'无法读取讨论。')}finally{if(generation===epoch.current)setLoading(false)}}
  async function selectThread(id:string){if(active.current||polling.current)return;setLoading(true);setError('');const generation=++epoch.current;try{const next=await api<DiscussionSnapshot>(query(id),undefined,abort.current?.signal);if(generation===epoch.current){state.current=null;apply(next)}}catch(e){if(generation===epoch.current)setError(e instanceof Error?e.message:'无法切换讨论。')}finally{if(generation===epoch.current)setLoading(false)}}
  useEffect(()=>{
    const controller=new AbortController();abort.current=controller;const generation=++epoch.current;
    void (async()=>{try{const next=await api<DiscussionSnapshot>(query(),undefined,controller.signal);if(epoch.current!==generation)return;let selected:string|null=null;try{selected=localStorage.getItem(selectionKey(next.workspaceId))}catch{}
      if(!fresh&&selected&&next.threads.some(t=>t.id===selected)&&next.thread?.id!==selected){const chosen=await api<DiscussionSnapshot>(query(selected),undefined,controller.signal);if(epoch.current===generation)apply(chosen)}else if(fresh&&!context.appId)apply({...next,thread:null,turns:[]});else apply(next);
      if(epoch.current===generation)setLoading(false);
    }catch(e){if(epoch.current===generation&&!controller.signal.aborted){setError(e instanceof Error?e.message:'讨论读取失败。');setLoading(false)}}})();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Increment the current operation epoch at teardown; this is a generation token, not a captured DOM node.
    return()=>{epoch.current++;controller.abort();active.current=null;polling.current=false};
  // The parent keys the pane by app/creation context and reset token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The parent keys each pane by context; only choosing discussion with no thread starts metadata creation.
  useEffect(()=>{if(intent==='discuss'&&!loading&&!snapshot?.thread&&!error)void newThread()},[intent,loading,snapshot?.thread,error]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the displayed timer when an external request lifecycle ends.
  useEffect(()=>{if(!busy){setElapsed(0);return}const started=Date.now(),timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer)},[busy]);
  async function poll(requestId:string){
    if(polling.current||active.current)return;polling.current=true;setBusy(true);const generation=epoch.current,selected=state.current?.thread?.id;
    try{for(let count=0;count<DISCUSSION_RECOVERY.checks;count++){
      if(generation!==epoch.current||abort.current?.signal.aborted)return;
      let status:DiscussionRequestStatus;try{status=await api<DiscussionRequestStatus>('/api/discussions/requests/'+encodeURIComponent(requestId),undefined,abort.current?.signal)}catch(e){if(e instanceof DiscussionApiError&&e.status===404){setAttempts(old=>{const next=old.map(a=>a.requestId===requestId?{...a,state:'failed' as const,error:'未找到已登记请求，重试会沿用原编号核对。'}:a);if(namespace.current)persist(outboxKey+':'+namespace.current,next);return next});return}throw e}
      if(generation!==epoch.current||selected!==state.current?.thread?.id||status.threadId!==selected)return;apply(status.snapshot);
      if(status.status!=='running'){removeAttempt(requestId);setError('');if(status.status==='done')setNotice('已核对原讨论回答，没有再次调用模型。');return}
      await new Promise<void>(resolve=>{const signal=abort.current?.signal;const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()};const timer=setTimeout(done,DISCUSSION_RECOVERY.intervalMs);signal?.addEventListener('abort',done,{once:true})});
    }setNotice('自动状态核对已暂停；服务端可能仍在处理。可手动核对，不会自动再次调用模型。')}
    catch(e){if(generation===epoch.current&&!abort.current?.signal.aborted)setError(e instanceof Error?e.message:'状态核对失败，请稍后重试。')}
    finally{polling.current=false;if(generation===epoch.current)setBusy(false)}
  }
  const recoveryId=snapshot?.turns.find(t=>t.status==='running')?.requestId||attempts.find(a=>a.threadId===threadId&&a.state==='checking')?.requestId;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- A restored request identity starts one bounded GET loop; snapshots from that loop must not restart it.
  useEffect(()=>{if(recoveryId&&!active.current&&!polling.current)void poll(recoveryId)},[recoveryId]);
  async function execute(attempt:DiscussionAttempt){
    if(active.current||polling.current||!state.current?.thread||state.current.thread.id!==attempt.threadId)return;
    const generation=epoch.current;active.current=attempt.requestId;setBusy(true);setError('');setNotice('');updateAttempt({...attempt,state:'sending',error:undefined});
    try{const next=await api<DiscussionSnapshot>('/api/discussions',{threadId:attempt.threadId,requestId:attempt.requestId,prompt:attempt.prompt,...attempt.baseVersionId?{baseVersionId:attempt.baseVersionId}:{},...attempt.model?{model:attempt.model}:{}},abort.current?.signal,true);if(generation!==epoch.current||attempt.threadId!==state.current?.thread?.id)return;apply(next);removeAttempt(attempt.requestId)}
    catch(e){if(generation===epoch.current&&!abort.current?.signal.aborted){updateAttempt({...attempt,state:'checking',error:e instanceof Error?e.message:'发送未完成，请核对状态。'});setError(e instanceof Error?e.message:'讨论未完成，问题已保留。')}}
    finally{active.current=null;if(generation===epoch.current)setBusy(false)}
  }
  async function send(model:string|undefined,baseVersionId:string|undefined){const id=state.current?.thread?.id,text=id?drafts[id]||'':'';if(!id||!text.trim()||text.length>4000||active.current||polling.current)return;setDraft('');await execute({threadId:id,requestId:crypto.randomUUID(),prompt:text,...baseVersionId?{baseVersionId}:{},...model?{model}:{},startedAt:Date.now(),state:'sending'})}
  async function retry(value:DiscussionTurn|DiscussionAttempt){const id=state.current?.thread?.id;if(!id||active.current||polling.current)return;const original:DiscussionAttempt='threadId' in value?value:{requestId:value.requestId,threadId:id,prompt:value.prompt,baseVersionId:value.contextVersionId||undefined,model:value.model||undefined,startedAt:Date.parse(value.createdAt),state:'failed'};
    setBusy(true);setError('');const generation=epoch.current;try{let status:DiscussionRequestStatus|null=null;try{status=await api<DiscussionRequestStatus>('/api/discussions/requests/'+encodeURIComponent(original.requestId),undefined,abort.current?.signal)}catch(e){if(!(e instanceof DiscussionApiError&&e.status===404))throw e}
      if(generation!==epoch.current||id!==state.current?.thread?.id)return;if(status){apply(status.snapshot);if(status.status==='done'){removeAttempt(original.requestId);return}if(status.status==='running'){setBusy(false);void poll(original.requestId);return}}
      removeAttempt(original.requestId);setBusy(false);await execute({...original,requestId:status?crypto.randomUUID():original.requestId,state:'sending',startedAt:Date.now()});
    }catch(e){if(generation===epoch.current)setError(e instanceof Error?e.message:'核对失败，未再次调用模型。')}finally{if(generation===epoch.current&&!active.current&&!polling.current)setBusy(false)}
  }
  return{snapshot,loading,busy,error,notice,elapsed,draft:threadId?drafts[threadId]||'':'',setDraft,attempts:attempts.filter(a=>a.threadId===threadId&&!snapshot?.turns.some(t=>t.requestId===a.requestId)),newThread,selectThread,reload,send,retry,check:poll};
}
