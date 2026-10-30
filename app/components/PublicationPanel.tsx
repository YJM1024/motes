'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@/lib/forma/types';
import { publicationRequestId, publicationUrl, type PublicationMutation, type PublicationReceipt } from '@/lib/motes/publication-client';
import styles from './PublicationPanel.module.css';

type Publication = { appId: string; versionId: string; versionNumber: number; title: string; path: string; publishedAt: string; updatedAt: string; enabled: boolean; revision: number };
type Props = { project: Project; onClose: () => void };
type Action = 'publish' | 'unpublish';

export default function PublicationPanel({ project, onClose }: Props) {
  const endpoint = `/api/projects/${encodeURIComponent(project.id)}/publication`;
  const [publication, setPublication] = useState<Publication|null>(null);
  const [revision, setRevision] = useState(0);
  const [selectedVersionId, setSelectedVersionId] = useState(project.currentVersionId);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action|null>(null), [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [conflict, setConflict] = useState(false);
  const request = useRef<PublicationReceipt|null>(null), inFlight = useRef(false), dialog=useRef<HTMLDialogElement>(null);
  const selected = project.versions.find(version=>version.id===selectedVersionId);
  const publicUrl = useMemo(()=>{if(!publication||typeof window==='undefined')return '';try{return publicationUrl(publication.path,window.location.origin);}catch{return ''; }},[publication]);
  const read = useCallback(async (reselect=false) => {
    setLoading(true);setError('');
    try {
      const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const value=await response.json() as {publication:Publication|null;error?:string};
      if(!response.ok||!('publication' in value))throw new Error(value.error||'发布状态暂时无法读取。');
      setPublication(value.publication);setRevision(value.publication?.revision??0);setConflict(false);
      if(reselect){setSelectedVersionId('');setAction(null);setFeedback('发布状态已刷新，请重新选择一个已保存版本。');}
    } catch(cause){setError(cause instanceof Error?cause.message:'发布状态暂时无法读取。');}
    finally{setLoading(false);}
  },[endpoint]);
  useEffect(()=>{const element=dialog.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null;element?.showModal();return()=>{element?.close();previous?.focus();};},[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial GET synchronizes this panel with the saved publication state.
  useEffect(()=>{void read();},[read]);
  async function mutate(nextAction:Action) {
    if(inFlight.current||loading||busy)return;
    const body:PublicationMutation=nextAction==='publish'?{action:'publish',versionId:selectedVersionId,expectedRevision:revision}:{action:'unpublish',expectedRevision:revision};
    if(nextAction==='publish'&&!selected)return;
    inFlight.current=true;setBusy(true);setError('');setFeedback('');
    request.current=publicationRequestId(request.current,body,()=>crypto.randomUUID());
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,requestId:request.current.requestId}),signal:AbortSignal.timeout(30000)});
      const value=await response.json() as {publication?:Publication;completed?:boolean;error?:string};
      if(!response.ok||!value.completed||!value.publication){if(response.status===409){setConflict(true);throw new Error(value.error||'发布状态已变化。请刷新状态并重新选择版本；未自动重试。');}throw new Error(value.error||'发布操作未完成，可重试核对同一请求。');}
      setPublication(value.publication);setRevision(value.publication.revision);request.current=null;setAction(null);setConflict(false);
      setFeedback(nextAction==='publish'?`稳定发布链接已${publication?'更新':'创建'}，内容来自已保存的 v${value.publication.versionNumber}。后续更新仍使用同一链接。`: '发布已暂停，链接访问返回 404。重新发布会恢复同一个链接。');
    } catch(cause){setError(cause instanceof Error?cause.message:'网络异常，所选操作已保留，可重试核对同一请求。');}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function copy() {
    if(!publication)return;
    try{await navigator.clipboard.writeText(publicationUrl(publication.path,window.location.origin));setFeedback('已复制稳定发布链接。');setError('');}
    catch(cause){setError(cause instanceof Error?cause.message:'无法复制链接，请检查浏览器权限后重试。');}
  }
  const currentActionLabel=action==='publish'?(publication?.enabled?'确认更新发布内容':'确认发布'):action==='unpublish'?'确认暂停发布':'';
  return <dialog ref={dialog} className={styles.panel} aria-labelledby="publication-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <header className={styles.header}><div><h2 id="publication-title">稳定发布链接</h2><p>{project.title}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="关闭发布管理">关闭</button></header>
    <div className={styles.body}>
      <p className={styles.disclosure}>发布会公开所选版本的标题和完整 HTML 页面，任何持有链接的人都可访问。需求对话和其他版本不会公开；发布前请检查标题和源码中是否包含私人内容。不会调用模型。</p>
      <p className={styles.stable}>此链接保持稳定。更新发布会让同一链接显示新选版本；暂停后链接返回 404，之后重新发布会恢复原链接。</p>
      <div className={styles.versionPicker}><label>发布内容<select value={selectedVersionId} disabled={loading||busy||!!action||!project.versions.length} onChange={event=>{setSelectedVersionId(event.target.value);setError('');setFeedback('');setConflict(false);}}><option value="" disabled>请选择已保存版本</option>{project.versions.map(version=><option key={version.id} value={version.id}>v{version.number}{version.id===project.currentVersionId?' · 当前':''}{version.name?` · ${version.name}`:''}</option>)}</select></label><span>只会公开所选保存版本的标题和页面内容。</span></div>
      {loading?<p className={styles.status} role="status">正在读取发布状态…</p>:publication?<div className={styles.statusCard}><strong>{publication.enabled?'发布中':'已暂停'} · v{publication.versionNumber} · 修订 {publication.revision}</strong><span>最近更新：{new Date(publication.updatedAt).toLocaleString('zh-CN')}</span><code>{publication.path}</code>{publication.enabled&&publicUrl&&<a href={publicUrl} target="_blank" rel="noreferrer">打开公开页面</a>}<button type="button" disabled={busy} onClick={()=>void copy()}>复制稳定链接</button></div>:<p className={styles.status}>尚未创建稳定发布链接。</p>}
      {error&&<p className={styles.error} role="alert">{error}{conflict&&<button type="button" disabled={busy||loading} onClick={()=>void read(action==='publish')}>刷新状态并重新选择</button>}</p>}
      {feedback&&<p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>}
      <div className={styles.actions}><button type="button" disabled={loading||busy||!!action||!selected} onClick={()=>{setAction('publish');setError('');setFeedback('');}}> {publication?.enabled?'更新发布内容':publication?'重新启用固定链接':'创建稳定发布链接'}</button>{publication?.enabled&&<button type="button" className={styles.secondary} disabled={loading||busy||!!action} onClick={()=>{setAction('unpublish');setError('');setFeedback('');}}>暂停发布</button>}<button type="button" className={styles.refresh} disabled={busy||loading||!!action} onClick={()=>void read()}>刷新发布状态</button></div>
      {action&&<div className={styles.confirm} role="group" aria-label="确认发布操作"><p>{action==='publish'?`确认${publication?.enabled?'更新':'发布'}标题「${project.title}」和已保存的 v${selected?.number} 页面吗？该操作会${publication?.enabled?'更新':'启用'}稳定链接。`:'确认暂停稳定发布？现有链接将返回 404；之后重新发布会恢复同一个链接。'}</p><div><button type="button" disabled={busy} onClick={()=>setAction(null)}>返回检查</button><button type="button" disabled={busy||loading||action==='publish'&&!selected} onClick={()=>void mutate(action)}>{busy?'正在保存…':currentActionLabel}</button></div></div>}
      <p className={styles.snapshotNote}>这与“固定版本分享”不同：固定分享始终指向创建时的快照，不会随新版本漂移；两种链接相互独立。</p>
    </div>
  </dialog>;
}
