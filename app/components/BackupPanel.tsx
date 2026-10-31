"use client";
import { useEffect, useRef, useState } from 'react';
import type { WorkspaceSnapshot } from '@/lib/motes/types';
import { BACKUP_LIMITS, validateBackup } from '@/lib/motes/backup-format';
import type { BackupDocument, BackupPreview, ImportResult } from '@/lib/motes/backup-format';
import './backup-panel.css';
import {homeNotice} from "@/lib/motes/locale/home-notices";
import { hostText, useHostLocale } from './HostLocaleProvider';

async function api<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) } : { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({ error: hostText('未收到有效结果，请稍后重试。') })) as T & { error?: string };
  if (!response.ok || data.error) throw new Error(data.error || hostText('备份操作失败。'));
  return data as T;
}
export default function BackupPanel({ snapshot, onClose, onImported }: { snapshot: WorkspaceSnapshot; onClose: () => void; onImported: (result: ImportResult) => void }) {
  const {locale,t}=useHostLocale();
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false);
  const [selection, setSelection] = useState(snapshot.apps[0] ? 'app:'+snapshot.apps[0].id : 'project:'+snapshot.workspace.defaultProjectId);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [importedProject, setImportedProject] = useState(false);
  const [document, setDocument] = useState<BackupDocument | null>(null), [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false), requestId = useRef(crypto.randomUUID());
  useEffect(() => { const el=dialog.current, previous=window.document.activeElement as HTMLElement|null;el?.showModal();return()=>{el?.close();previous?.focus()}; }, []);
  async function download() {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');setImportedProject(false);
    try {
      const split=selection.indexOf(':'),kind=selection.slice(0,split),id=selection.slice(split+1);
      const backup=await api<BackupDocument>('/api/backup?'+(kind==='app'?'appId':'projectId')+'='+encodeURIComponent(id));
      const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json;charset=utf-8'}));
      const anchor=window.document.createElement('a');anchor.href=url;anchor.download='motes-backup.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(hostText('备份文件已导出，包含完整代码与需求，请妥善保存。'));
    }catch(e){setError(e instanceof Error?e.message:hostText('导出失败。'))}finally{lock.current=false;setBusy(false)}
  }
  async function inspect(file?: File) {
    if(!file||lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');setImportedProject(false);setDocument(null);setPreview(null);setConfirmed(false);requestId.current=crypto.randomUUID();
    try{
      if(file.size>BACKUP_LIMITS.bytes)throw new Error(hostText('文件超过 2 MiB，请分批导出。'));
      const backup=validateBackup(JSON.parse(await file.text()));
      const checked=await api<BackupPreview>('/api/backup',{action:'preview',backup});
      setDocument(backup);setPreview(checked);
    }catch(e){setError(e instanceof Error?e.message:hostText('文件不是有效备份。'))}finally{lock.current=false;setBusy(false)}
  }
  async function restore() {
    if(!document||!preview||!confirmed||lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const result=await api<ImportResult>('/api/backup',{action:'import',backup:document,previewHash:preview.previewHash,requestId:requestId.current});
      setDocument(null);setPreview(null);setConfirmed(false);setImportedProject(true);setNotice(hostText('已导入 {count} 个应用，均为新的私有副本。',{count:result.appIds.length}));onImported(result);
    }catch(e){setError(e instanceof Error?e.message:hostText('导入未完成，请保留当前文件后重试。'))}finally{lock.current=false;setBusy(false)}
  }
  return <dialog ref={dialog} className="backup-dialog" aria-labelledby="backup-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}><header><h2 id="backup-title">{t('JSON 备份与导入')}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={t('关闭备份面板')}>{t('关闭')}</button></header><div className="backup-body"><p>{t('HTML 导出用于独立运行；JSON 备份保存应用与历史，供恢复为新的私有副本。不会保存账号凭据、模型密钥或分享链接。')}</p><section><h3>{t('导出应用或项目')}</h3><label>{t('备份范围')}<select value={selection} disabled={busy} onChange={e=>setSelection(e.target.value)}><optgroup label={t('单个应用')}>{snapshot.apps.map(a=><option key={a.id} value={'app:'+a.id}>{a.name}{a.archived?t('（已归档）'):''}</option>)}</optgroup><optgroup label={t('项目内全部应用')}>{snapshot.projects.map(p=><option key={p.id} value={'project:'+p.id}>{p.name} · {t('{count} 个应用',{count:p.appCount})}</option>)}</optgroup></select></label><button disabled={busy} onClick={()=>void download()}>{t('导出 JSON')}</button></section><section><h3>{t('从备份恢复')}</h3><p>{t('先预检再确认；将新建一个项目，应用与版本使用新编号，不覆盖原作，也不恢复公开分享。已有同名标签会复用当前颜色。备份代码仍在隔离预览中运行。')}</p><label>{t('选择 JSON 备份')}<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";void inspect(file);}}/></label>{preview&&<div className="backup-preview"><strong>{preview.projectName}</strong><p>{t('{apps} 个应用 · {versions} 个版本 · {size} KiB',{apps:preview.appCount,versions:preview.versionCount,size:(preview.bytes/1024).toFixed(1)})}</p><ul>{preview.apps.map((app,i)=><li key={i}>{app.name}<span>{t('{count} 个版本',{count:app.versions})}</span></li>)}</ul><label className="backup-confirm"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('确认导入这些应用为新的私有副本')}</label><button disabled={busy||!confirmed} onClick={()=>void restore()}>{busy?t('正在导入…'):t('确认导入副本')}</button></div>}</section><small>{t('每份最多 2 MiB、10 个应用、200 个版本，每应用 60 个版本。超限请分批导出。预检不写入作品，不调用模型；不会恢复预览中临时填写的数据。')}</small>{busy&&!preview&&<p role="status">{t('正在处理，请稍候…')}</p>}{error&&<p role="alert" className="backup-error"><strong>{t("操作未完成：")}</strong>{homeNotice(locale,error)}</p>}{notice&&<p role="status" className="backup-notice">{notice}{importedProject&&<><span className="backup-next-step">{t('导入已完成，可关闭此窗口查看新建的私有项目。')}</span><button type="button" className="backup-next-button" onClick={onClose}>{t('查看新项目')}</button></>}</p>}</div></dialog>;
}
