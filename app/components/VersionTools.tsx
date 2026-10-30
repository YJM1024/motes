'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Project } from '@/lib/forma/types';
import { compareLines } from '@/lib/motes/line-diff';
import styles from './VersionTools.module.css';

export type VersionToolsProps = {
  project: Project;
  selectedVersionId?: string;
  targetProjectId?: string;
  onClose: () => void;
  onSaved: (project: Project) => void;
};

/** Standalone source-only dialog. HTML is rendered as text, never executed. */
export default function VersionTools(props:VersionToolsProps) {
  return <VersionToolsDialog key={`${props.project.id}:${props.project.currentVersionId}:${props.selectedVersionId??''}`} {...props}/>;
}

function VersionToolsDialog({project,selectedVersionId,targetProjectId,onClose,onSaved}:VersionToolsProps) {
  const labelId=useId(), leftId=useId(), rightId=useId();
  const [left,setLeft]=useState(project.currentVersionId);
  const [right,setRight]=useState(selectedVersionId??project.versions.find(v=>v.id!==project.currentVersionId)?.id??project.currentVersionId);
  const [changesOnly,setChangesOnly]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const request=useRef<{key:string;id:string}|null>(null), inFlight=useRef(false);
  const panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  const before=project.versions.find(v=>v.id===left),after=project.versions.find(v=>v.id===right);
  const diff=useMemo(()=>compareLines(before?.html??'',after?.html??''),[before?.html,after?.html]);
  const rows=changesOnly?diff.lines.filter(l=>l.kind!=='same'):diff.lines;
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    closeButton.current?.focus();
    return ()=>previous?.focus();
  },[]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab'){
        const elements=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')??[]);
        const first=elements[0],last=elements.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);
  },[onClose]);
  async function copy(){
    if(!after)return;
    setError('');setFeedback('');
    try{await navigator.clipboard.writeText(after.html);setFeedback(`已复制 v${after.number} 的完整源码。`);}
    catch{setError('无法访问剪贴板，请在浏览器允许复制后重试。');}
  }
  async function fork(){
    if(!after||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setFeedback('');
    const key=JSON.stringify([project.id,after.id,targetProjectId??null]);
    if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
    try{
      const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}/fork`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId:after.id,requestId:request.current.id,...targetProjectId?{targetProjectId}:{}})});
      const result=await response.json() as {error?:string;project?:Project};
      if(!response.ok)throw new Error(result.error??'副本未创建，请重试。');
      if(!result.project?.id||!Array.isArray(result.project.versions))throw new Error('未收到完整保存结果，请重试核对。');
      setFeedback(`已创建「${result.project.title}」，所选历史代码保存为 v1，未调用模型。`);
      onSaved(result.project as Project);
    }catch(cause){setError(cause instanceof Error?cause.message:'网络异常，请重试核对副本。');}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <div className={styles.backdrop}>
    <section className={styles.panel} ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <header className={styles.header}><div><h2 id={labelId}>版本比较与副本</h2><p>{project.title}</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label="关闭版本工具">关闭</button></header>
      <div className={styles.controls}>
        <label htmlFor={leftId}>比较基准<select id={leftId} value={left} onChange={e=>setLeft(e.target.value)} disabled={busy}>{project.versions.map(v=><option key={v.id} value={v.id}>v{v.number}{v.id===project.currentVersionId?' · 当前':''}</option>)}</select></label>
        <span className={styles.arrow} aria-hidden="true">→</span>
        <label htmlFor={rightId}>所选版本<select id={rightId} value={right} onChange={e=>{setRight(e.target.value);setFeedback('');setError('');}} disabled={busy}>{project.versions.map(v=><option key={v.id} value={v.id}>v{v.number}{v.id===project.currentVersionId?' · 当前':''}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={changesOnly} onChange={e=>setChangesOnly(e.target.checked)}/>只看更改</label>
      </div>
      <div className={styles.caption}><span>+ 新增 {diff.added} 行 · − 删除 {diff.removed} 行</span><span>左侧行号为基准，右侧行号为所选版本</span></div>
      {(diff.limited||diff.coarse)&&<p className={styles.notice}>{diff.limited?'内容较长，仅比较每份前 10 万字符、1400 行。':'变更较多，已改用整段增删比较。'} 复制和创建副本仍使用所选版本的完整源码。</p>}
      {before&&after?<div className={styles.code} tabIndex={0} role="region" aria-label="源码差异">
        {rows.length?rows.map((line,index)=><div key={index} className={`${styles.line} ${styles[line.kind]}`}><span className={styles.number}>{line.left??''}</span><span className={styles.number}>{line.right??''}</span><span className={styles.sign}>{line.kind==='added'?'+':line.kind==='removed'?'−':' '}</span><code>{line.text||' '}</code></div>):<p className={styles.empty}>这两个版本没有源码差异。</p>}
      </div>:<p className={styles.empty}>没有可比较的版本，请刷新应用后重试。</p>}
      <footer className={styles.footer}>
        <p>从所选版本建立独立应用，不改变原应用或历史记录。保留来源模式，未调用模型。</p>
        <div className={styles.actions}><button type="button" disabled={!after||busy} onClick={copy}>复制所选源码</button><button type="button" className={styles.primary} disabled={!after||busy} onClick={fork}>{busy?'正在保存副本…':'从所选版本创建副本'}</button></div>
        <div aria-live="polite" role="status">{feedback}</div>{error&&<p className={styles.error} role="alert">{error}</p>}
      </footer>
    </section>
  </div>;
}
