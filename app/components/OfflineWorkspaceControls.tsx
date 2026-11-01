'use client';
import {useEffect,useRef,useState} from 'react';
import {useHostLocale} from './HostLocaleProvider';
import {useOfflineWorkspace} from './OfflineProvider';
import OfflineSyncStatus from './OfflineSyncStatus';
import OfflineChangesPanel,{type OfflineChangeItem} from './OfflineChangesPanel';
import {discardOfflineOperation,listOfflineOperations} from '@/lib/motes/offline-engine';

export default function OfflineWorkspaceControls({workspaceId,disabled=false,onSynced}:{workspaceId:string|null;disabled?:boolean;onSynced:()=>void}){
  const state=useOfflineWorkspace(workspaceId),{locale}=useHostLocale();
  const [items,setItems]=useState<OfflineChangeItem[]|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const owner=useRef(workspaceId),live=useRef(true),lock=useRef(false);
  useEffect(()=>{owner.current=workspaceId;setItems(null);setFailed(false);},[workspaceId]);
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[]);
  const current=()=>live.current&&!!workspaceId&&owner.current===workspaceId;
  async function openChanges(){if(!workspaceId||disabled)return;try{const operations=await listOfflineOperations(workspaceId);if(current())setItems(operations.map(o=>({id:o.id,kind:o.kind,state:o.state,appId:o.appId,createdAt:o.createdAt,html:typeof o.body.html==='string'?o.body.html:undefined,value:o.kind==='import'?o.body.backup:o.value,key:o.key})));}catch{if(current())setFailed(true)}}
  async function sync(){if(!workspaceId||disabled||lock.current)return;lock.current=true;setBusy(true);setFailed(false);try{const success=await state.sync();if(current()){if(success)onSynced();else setFailed(true);}}catch{if(current())setFailed(true)}finally{lock.current=false;if(current())setBusy(false)}}
  async function discard(id:string){if(!workspaceId||disabled||lock.current)return;lock.current=true;setBusy(true);setFailed(false);try{await discardOfflineOperation(workspaceId,id);await state.refresh();if(current())await openChanges();}catch{if(current())setFailed(true)}finally{lock.current=false;if(current())setBusy(false)}}
  if(!workspaceId)return null;
  const show=state.storage==='unavailable'||state.ready&&(state.status!=='online'||state.pendingCount>0||state.conflictCount>0);
  return <>{show&&<div style={{padding:'8px 16px'}}><OfflineSyncStatus {...state} disabled={disabled||busy} onSync={()=>void sync()} onOpenConflicts={()=>void openChanges()}/>{state.pendingCount>0&&!state.conflictCount&&<button type="button" className="workbench-text-button" disabled={disabled||busy} onClick={()=>void openChanges()}>{locale==='en'?'Review local changes':'查看本地更改'}</button>}{failed&&<p role="alert">{locale==='en'?'The operation could not finish. Your local changes are retained.':'操作未完成，本地内容仍保留。'}</p>}</div>}{items&&<OfflineChangesPanel items={items} busy={busy||disabled} onDiscard={id=>void discard(id)} onClose={()=>setItems(null)}/>}</>;
}
