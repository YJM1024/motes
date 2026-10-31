'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Project } from '@/lib/forma/types';
import { compareLines } from '@/lib/motes/line-diff';
import { summarizeLineChanges } from '@/lib/motes/version-diff-summary';
import styles from './VersionTools.module.css';
import SharePanel from './SharePanel';
import { hostText, useHostLocale } from './HostLocaleProvider';

export type VersionToolsProps = {
  project: Project;
  selectedVersionId?: string;
  targetProjectId?: string;
  onClose: () => void;
  onSaved: (project: Project) => void;
  onEdit?: (versionId: string) => void;
};

/** Standalone source-only dialog. HTML is rendered as text, never executed. */
export default function VersionTools(props:VersionToolsProps) {
  return <VersionToolsDialog key={`${props.project.id}:${props.project.currentVersionId}:${props.selectedVersionId??''}`} {...props}/>;
}

function VersionToolsDialog({project,selectedVersionId,targetProjectId,onClose,onSaved,onEdit}:VersionToolsProps) {
  const {t,locale}=useHostLocale();
  const labelId=useId(), leftId=useId(), rightId=useId();
  const initialRight=selectedVersionId??project.versions.find(v=>v.id!==project.currentVersionId)?.id??project.currentVersionId;
  const initialLeft=initialRight===project.currentVersionId?(project.versions.find(v=>v.id!==initialRight)?.id??initialRight):project.currentVersionId;
  const [left,setLeft]=useState(initialLeft);
  const [right,setRight]=useState(selectedVersionId??project.versions.find(v=>v.id!==project.currentVersionId)?.id??project.currentVersionId);
  const [changesOnly,setChangesOnly]=useState(false),[busy,setBusy]=useState(false);
  const [wrapLines,setWrapLines]=useState(false);
  const [error,setError]=useState(''),[feedback,setFeedback]=useState('');
  const request=useRef<{key:string;id:string}|null>(null), inFlight=useRef(false);
  const panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  const before=project.versions.find(v=>v.id===left),after=project.versions.find(v=>v.id===right);
  const diff=useMemo(()=>compareLines(before?.html??'',after?.html??''),[before?.html,after?.html]);
  const summary=useMemo(()=>summarizeLineChanges(before?.html??'',after?.html??''),[before?.html,after?.html]);
  const rows=changesOnly?diff.lines.filter(l=>l.kind!=='same'):diff.lines;
  const sourceLabel=(mode:Project['versions'][number]['mode'])=>mode==='manual'?t('手工源码'):mode==='demo'?t('示例生成'):t('模型生成');
  const createdAt=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?t('时间未知'):date.toLocaleString(locale==='en'?'en-US':'zh-CN');};
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    closeButton.current?.focus();
    return ()=>previous?.focus();
  },[]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab'){
        const elements=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')??[]).filter(element=>element.getClientRects().length>0);
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
    try{await navigator.clipboard.writeText(after.html);setFeedback(t('已复制 v{version} 的完整源码。',{version:after.number}));}
    catch{setError(t('无法访问剪贴板，请在浏览器允许复制后重试。'));}
  }
  async function fork(){
    if(!after||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setFeedback('');
    const key=JSON.stringify([project.id,after.id,targetProjectId??null]);
    if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
    try{
      const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}/fork`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId:after.id,requestId:request.current.id,...targetProjectId?{targetProjectId}:{}})});
      const result=await response.json() as {error?:string;project?:Project};
      if(!response.ok)throw new Error(result.error??hostText('副本未创建，请重试。'));
      if(!result.project?.id||!Array.isArray(result.project.versions))throw new Error(hostText('未收到完整保存结果，请重试核对。'));
      setFeedback(t('已创建「{title}」，所选历史代码保存为 v1，未调用模型。',{title:result.project.title}));
      onSaved(result.project as Project);
    }catch(cause){setError(cause instanceof Error?cause.message:hostText('网络异常，请重试核对副本。'));}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <div className={styles.backdrop}>
    <section className={styles.panel} ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <header className={styles.header}><div><h2 id={labelId}>{t('版本比较与副本')}</h2><p>{project.title}</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label={t('关闭版本工具')}>{t('关闭')}</button></header>
      <div className={styles.controls}>
        <label htmlFor={leftId}>{t('比较基准')}<select id={leftId} value={left} onChange={e=>setLeft(e.target.value)} disabled={busy}>{project.versions.map(v=><option key={v.id} value={v.id}>{v.important?'★ ':''}v{v.number}{v.name?` · ${v.name}`:''}{v.id===project.currentVersionId?t(' · 当前'):''}</option>)}</select></label>
        <span className={styles.arrow} aria-hidden="true">→</span>
        <label htmlFor={rightId}>{t('所选版本')}<select id={rightId} value={right} onChange={e=>{setRight(e.target.value);setFeedback('');setError('');}} disabled={busy}>{project.versions.map(v=><option key={v.id} value={v.id}>{v.important?'★ ':''}v{v.number}{v.name?` · ${v.name}`:''}{v.id===project.currentVersionId?t(' · 当前'):''}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={changesOnly} onChange={e=>setChangesOnly(e.target.checked)}/>{t('只看更改')}</label>
        <label className={styles.check}><input type="checkbox" checked={wrapLines} onChange={e=>setWrapLines(e.target.checked)}/>{t('折行查看（保留源码行号）')}</label>
      </div>
      <div className={styles.capacity}><span>{t('此应用保留 {count} / 60 个版本',{count:project.versions.length})}</span><span>{t('每位访客最多创建 100 个应用')}</span></div>
      <div className={styles.caption}><span>{t('比较 v{left} → v{right}：{summary}',{left:before?.number??'—',right:after?.number??'—',summary:summary.added===null?t('代码较大，暂不提供行数摘要'):t('增加 {added} 行 · 删除 {removed} 行',{added:summary.added,removed:summary.removed})})}</span><span>{t('行数为精确文本差异；此摘要不使用 AI')}</span></div>
      {after&&<div className={styles.versionInfo}><div><strong>{t('所选 v{version}{current}',{version:after.number,current:after.id===project.currentVersionId?t(' · 当前应用指向此版本'):' '})}</strong><span>{sourceLabel(after.mode)}{after.model?` · ${after.model}`:''} · {createdAt(after.createdAt)}</span></div><details><summary>{t('查看版本记录信息')}</summary><p><b>{t('来源记录')}：</b>{after.prompt||t('无记录')}</p><p><b>{t('摘要')}：</b>{after.summary||t('无记录')}</p></details><p>{t('历史版本不会被此处替换；编辑历史源码后保存会新增版本。创建副本会以所选版本作为副本的 v1，不改变原应用当前指针。')}</p></div>}
      {(diff.limited||diff.coarse)&&<p className={styles.notice}>{diff.limited?t('内容较长，仅比较每份前 10 万字符、1400 行。'):t('变更较多，已改用整段增删比较。')} {t('复制和创建副本仍使用所选版本的完整源码。')}</p>}
      {before&&after&&diff.added===0&&diff.removed===0&&<p className={styles.notice}>{left===right?t('所选为同一个版本，没有源码差异。'):t('这两个版本的源码一致。')}{diff.limited?t('此结果仅指已展示的比较范围。'):''}</p>}
      {before&&after?<div className={`${styles.code} ${wrapLines?styles.wrap:''}`} tabIndex={0} role="region" aria-label={t('源码差异')}>
        {rows.length?rows.map((line,index)=><div key={index} className={`${styles.line} ${styles[line.kind]}`}><span className={styles.number}>{line.left??''}</span><span className={styles.number}>{line.right??''}</span><span className={styles.sign}>{line.kind==='added'?'+':line.kind==='removed'?'−':' '}</span><code>{line.text||' '}</code></div>):<p className={styles.empty}>{t('这两个版本没有源码差异。')}</p>}
      </div>:<p className={styles.empty}>{t('没有可比较的版本，请刷新应用后重试。')}</p>}
      <footer className={styles.footer}>
        <p>{t('从所选版本建立独立应用，不改变原应用或历史记录。保留来源模式，未调用模型。')}</p>
        <div className={styles.actions}>{onEdit&&<button type="button" disabled={!after||busy} onClick={()=>{if(after)onEdit(after.id);}}>{t('编辑所选源码')}</button>}<button type="button" disabled={!after||busy} onClick={copy}>{t('复制所选源码')}</button><button type="button" className={styles.primary} disabled={!after||busy} onClick={fork}>{busy?t('正在保存副本…'):t('从所选版本创建副本')}</button></div>
        <div aria-live="polite" role="status">{feedback}</div>{error&&<p className={styles.error} role="alert">{error}</p>}
        {after&&<details className={styles.sharing}><summary>{t('分享所选 v{version} · 创建和管理公开链接',{version:after.number})}</summary><SharePanel key={`${project.id}:${after.id}`} appId={project.id} versionId={after.id} versionNumber={after.number}/></details>}
      </footer>
    </section>
  </div>;
}
