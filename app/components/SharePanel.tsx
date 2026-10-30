'use client';

import {useEffect, useRef, useState} from 'react';
import type {ShareLink} from '@/lib/motes/share-types';
import styles from './SharePanel.module.css';

export type SharePanelProps = {appId:string;versionId:string;versionNumber:number};
export default function SharePanel({appId,versionId,versionNumber}:SharePanelProps) {
  const [shares,setShares]=useState<ShareLink[]>([]),[loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const [retry,setRetry]=useState(false);
  const [reload,setReload]=useState(0);
  const request=useRef<string|null>(null),inFlight=useRef(false);
  const endpoint=`/api/projects/${encodeURIComponent(appId)}/shares`;
  useEffect(()=>{
    let active=true;
    fetch(endpoint,{cache:'no-store'}).then(async response=>{
      const value=await response.json() as {shares?:ShareLink[];error?:string};
      if(!response.ok||!Array.isArray(value.shares))throw new Error(value.error??'分享列表暂时无法读取。');
      if(active)setShares(value.shares);
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'分享列表暂时无法读取。');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[endpoint,reload]);
  async function create(){
    if(inFlight.current)return;inFlight.current=true;setBusy('create');setError('');setFeedback('');
    request.current??=crypto.randomUUID();
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId,requestId:request.current})});
      const value=await response.json() as {share?:ShareLink;error?:string};
      if(!response.ok||!value.share)throw new Error(value.error??'分享暂时未完成，请重试核对。');
      const share=value.share;setShares(old=>[share,...old.filter(s=>s.id!==share.id)]);
      request.current=null;setRetry(false);
      setFeedback(share.revokedAt?'此前请求的链接已撤销。如需再次公开，请重新点击创建。':`已创建固定 v${share.versionNumber} 分享，可复制链接。`);
    }catch(cause){setError(cause instanceof Error?cause.message:'网络异常，请重试核对同一分享请求。');setRetry(true);}
    finally{inFlight.current=false;setBusy(null);}
  }
  async function revoke(share:ShareLink){
    if(inFlight.current)return;inFlight.current=true;setBusy(share.id);setError('');setFeedback('');
    try{
      const response=await fetch(`${endpoint}/${encodeURIComponent(share.id)}`,{method:'DELETE'});
      const value=await response.json() as {revoked?:boolean;error?:string};
      if(!response.ok||!value.revoked)throw new Error(value.error??'撤销暂时未完成，请重试。');
      setShares(old=>old.map(s=>s.id===share.id?{...s,revokedAt:new Date().toISOString()}:s));setFeedback(`v${share.versionNumber} 链接已撤销，后续访问立即失效。`);
    }catch(cause){setError(cause instanceof Error?cause.message:'撤销未完成，请重试。');}
    finally{inFlight.current=false;setBusy(null);}
  }
  async function copy(share:ShareLink){
    setError('');setFeedback('');
    try{await navigator.clipboard.writeText(new URL(share.path,window.location.origin).href);setFeedback(`已复制固定 v${share.versionNumber} 分享链接。`);}
    catch{setError('无法访问剪贴板，可打开“查看固定版本”后复制地址。');}
  }
  return <div className={styles.box}>
    <p className={styles.disclosure}>创建链接将公开所选 <strong>v{versionNumber}</strong> 的页面、标题和完整 HTML 源码。任何持有链接的人均可访问，不包含需求对话或其他版本。请先确认页面及源码没有私人内容。</p>
    <p className={styles.note}>链接固定此版本，之后生成或还原不会更新它。撤销阻止后续访问，已打开或复制的内容无法收回。</p>
    <button type="button" disabled={busy!==null||loading} onClick={create}>{busy==='create'?'正在创建…':retry?'重试核对分享链接':`公开 v${versionNumber} 并创建链接`}</button>
    <div role="status" aria-live="polite" className={styles.feedback}>{feedback}</div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <button type="button" disabled={busy!==null||loading} onClick={()=>{setLoading(true);setError('');setReload(value=>value+1);}}>刷新分享列表</button>
    {loading?<p className={styles.note}>正在读取分享列表…</p>:shares.length?<ul className={styles.list} aria-label="此应用的固定版本分享链接">{shares.map(share=><li key={share.id}>
      <div><strong>固定 v{share.versionNumber}</strong><span className={styles.note}> · {share.revokedAt?'已撤销':'有效'}</span><small>{new Date(share.createdAt).toLocaleString('zh-CN')}</small></div>
      {!share.revokedAt&&<div className={styles.actions}><a href={share.path} target="_blank" rel="noreferrer">查看固定版本</a><button type="button" onClick={()=>copy(share)} disabled={busy!==null||loading}>复制链接</button><button type="button" onClick={()=>revoke(share)} disabled={busy!==null||loading}>{busy===share.id?'正在撤销…':'撤销'}</button></div>}
    </li>)}</ul>:<p className={styles.note}>此应用还没有分享链接。</p>}
  </div>;
}
