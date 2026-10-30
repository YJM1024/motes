'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type SetStateAction} from 'react';
import {LOCAL_DATA_EVENT,type LocalDataEvent} from '@/lib/motes/local-data';
import {composerDraftStore} from '@/lib/motes/composer-drafts';
export function useWorkspaceDraft(workspaceId:string|null,key:string){
  const [value,setValue]=useState(''),[entries,setEntries]=useState<Record<string,string>>({}),[unavailable,setUnavailable]=useState(false);
  const active=useRef({workspaceId,key}),store=useRef<ReturnType<typeof composerDraftStore>|null>(null);
  const memory=useRef(new Map<string,string>());
  /* eslint-disable react-hooks/set-state-in-effect -- Restore authenticated external storage before paint so the previous workspace/context draft cannot flash. */
  useLayoutEffect(()=>{
    active.current={workspaceId,key};
    if(!workspaceId){setValue('');setEntries({});return}
    try{store.current??=composerDraftStore(localStorage);store.current.load(workspaceId);setValue(store.current.read(key));setEntries(store.current.entries())}catch{store.current??=composerDraftStore({getItem:k=>memory.current.get(k)||null,setItem:(k,v)=>{memory.current.set(k,v)}});store.current.load(workspaceId);setValue(store.current.read(key));setUnavailable(true)}
  },[workspaceId,key]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent<LocalDataEvent>).detail;if(detail?.scope!=='drafts'||detail.workspaceId!==workspaceId||!workspaceId||!store.current)return;try{store.current.load(workspaceId,true);setValue(store.current.read(key));setEntries(store.current.entries());}catch{setUnavailable(true);}};window.addEventListener(LOCAL_DATA_EVENT,receive);return()=>window.removeEventListener(LOCAL_DATA_EVENT,receive);},[workspaceId,key]);
  const set=useCallback((action:SetStateAction<string>)=>{if(!workspaceId||active.current.workspaceId!==workspaceId||!store.current)return;const previous=store.current.read(key),next=typeof action==='function'?action(previous):action;try{store.current.write(workspaceId,key,next)}catch{setUnavailable(true)}if(active.current.key===key)setValue(next);setEntries(store.current.entries())},[workspaceId,key]);
  function transfer(target:string){if(!workspaceId||active.current.workspaceId!==workspaceId||!store.current)return;try{store.current.transfer(workspaceId,active.current.key,target);setEntries(store.current.entries())}catch{setUnavailable(true)}}
  function writeTo(target:string,text:string){if(!workspaceId||active.current.workspaceId!==workspaceId||!store.current)return;try{store.current.write(workspaceId,target,text);setEntries(store.current.entries());if(active.current.key===target)setValue(text)}catch{setUnavailable(true)}}
  return{value,set,entries,unavailable,transfer,writeTo};
}
