'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { WorkspaceSnapshot } from '@/lib/motes/types';
import { useHostLocale } from './HostLocaleProvider';
import type { HostMessageKey, HostMessageParams } from '@/lib/motes/locale';
import { backupMessages } from '@/lib/motes/locale/backup';
import { buildWorkspaceBackupQuery, formatBackupBytes, isLegacyAppBackup, stableWorkspaceBackupRequest, type WorkspaceBackupRequest, type WorkspaceBackupScope, type WorkspaceBackupSections } from '@/lib/motes/workspace-backup-panel';
import styles from './WorkspaceBackupPanel.module.css';

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
type BackupPreview = {
  previewHash: string; bytes: number; projectCount: number; appCount: number; versionCount: number;
  promptTemplateCount: number; appTemplateCount: number; discussionCount: number; turnCount: number; versionConfigCount: number;
  sections: Partial<WorkspaceBackupSections>; notes: string[];
};
export type WorkspaceBackupImportResult = { imported: true; projectIds: string[]; appIds: string[]; promptTemplateCount: number; appTemplateCount: number; discussionCount: number };
type Props = { snapshot: WorkspaceSnapshot; onClose: () => void; onImported: (result: WorkspaceBackupImportResult) => void };

type Translate = (key: HostMessageKey, params?: HostMessageParams) => string;

function localizeKnownBackupMessage(value: string, t: Translate): string {
  return Object.prototype.hasOwnProperty.call(backupMessages, value) ? t(value as HostMessageKey) : value;
}

async function post<T>(body: Record<string, unknown>, t: Translate): Promise<T> {
  const response = await fetch('/api/workspace-backup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: window.location.origin }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const raw = await response.text();
  let value: T & { error?: string };
  try { value = JSON.parse(raw) as T & { error?: string }; }
  catch { throw new Error(t('服务没有返回有效结果；原操作是否完成尚未确认。')); }
  if (!response.ok) throw new Error(value.error || t('备份操作失败（{status}）。', { status: response.status }));
  return value;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export default function WorkspaceBackupPanel({ snapshot, onClose, onImported }: Props) {
  const { t } = useHostLocale();
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), lock = useRef(false), importRequest = useRef<WorkspaceBackupRequest | null>(null);
  const [scopeMode, setScopeMode] = useState<'workspace' | 'project' | 'apps'>('workspace');
  const [projectId, setProjectId] = useState(snapshot.workspace.defaultProjectId);
  const [appIds, setAppIds] = useState<string[]>([]);
  const [sections, setSections] = useState<WorkspaceBackupSections>({ discussions: true, promptTemplates: true, appTemplates: true, settings: true, versionConfigs: true });
  const [busy, setBusy] = useState<'download' | 'preview' | 'import' | ''>('');
  const [downloadError, setDownloadError] = useState(''), [downloadNotice, setDownloadNotice] = useState('');
  const [importError, setImportError] = useState(''), [importNotice, setImportNotice] = useState('');
  const [backup, setBackup] = useState<unknown>(null), [preview, setPreview] = useState<BackupPreview | null>(null), [confirmed, setConfirmed] = useState(false), [imported, setImported] = useState(false);
  const projectNames = new Map(snapshot.projects.map(item => [item.id, item.name]));

  useEffect(() => {
    const element = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); closeButton.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  function selectedScope(): WorkspaceBackupScope {
    if (scopeMode === 'project') return { kind: 'project', projectId };
    if (scopeMode === 'apps') return { kind: 'apps', appIds };
    return { kind: 'workspace' };
  }

  function setSection(key: keyof WorkspaceBackupSections, value: boolean) {
    setSections(previous => ({ ...previous, [key]: value }));
  }

  async function download() {
    if (lock.current) return;
    let query: string;
    try { query = buildWorkspaceBackupQuery(selectedScope(), sections); }
    catch (cause) { setDownloadError(cause instanceof Error ? localizeKnownBackupMessage(cause.message, t) : t('请选择备份范围。')); return; }
    lock.current = true; setBusy('download'); setDownloadError(''); setDownloadNotice('');
    try {
      const response = await fetch(`/api/workspace-backup?${query}`, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
      if (!response.ok) {
        const raw = await response.text(); let message = t('导出失败（{status}）。', { status: response.status });
        try { message = (JSON.parse(raw) as { error?: string }).error || message; } catch { /* Keep the status message for a non-JSON error response. */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (blob.size > MAX_BACKUP_BYTES) throw new Error(t('服务器返回的文件超过 2 MiB，未开始下载。请缩小范围或关闭模板部分。'));
      const text = await blob.text(); let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new Error(t('服务器返回的内容不是有效 JSON，未开始下载。')); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('服务器返回的 JSON 结构无效，未开始下载。'));
      const downloadBlob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const objectUrl = URL.createObjectURL(downloadBlob), anchor = document.createElement('a');
      anchor.href = objectUrl; anchor.download = 'motes-workspace-backup.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloadNotice(t('服务器返回的 JSON 已交给浏览器下载。请在下载列表中确认文件已保存。'));
    } catch (cause) { setDownloadError(cause instanceof Error ? localizeKnownBackupMessage(cause.message, t) : t('导出未完成；请保留当前选择并重试。')); }
    finally { lock.current = false; setBusy(''); }
  }

  async function inspectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || lock.current) return;
    setBackup(null); setPreview(null); setConfirmed(false); setImported(false); setImportError(''); setImportNotice('');
    if (file.size > MAX_BACKUP_BYTES) { setImportError(t('文件超过 2 MiB，未上传。请缩小文件或重新分批导出。')); return; }
    lock.current = true; setBusy('preview');
    try {
      let value: unknown;
      try { value = JSON.parse(await file.text()) as unknown; }
      catch { throw new Error(t('无法解析此 JSON 文件。')); }
      if (isLegacyAppBackup(value)) throw new Error(t('这是旧版“应用/项目备份”文件，请使用原有“应用/项目备份”入口导入。'));
      setBackup(value);
      const result = await post<BackupPreview>({ action: 'preview', backup: value }, t);
      if (typeof result.previewHash !== 'string' || !result.previewHash || typeof result.bytes !== 'number' || typeof result.appCount !== 'number' || typeof result.versionCount !== 'number' || !Array.isArray(result.notes)) {
        throw new Error(t('服务未返回完整的预检摘要；尚未执行导入。'));
      }
      setPreview(result);
    } catch (cause) { setImportError(cause instanceof Error ? localizeKnownBackupMessage(cause.message, t) : t('预检未完成；当前空间没有变化。')); }
    finally { lock.current = false; setBusy(''); }
  }

  async function importBackup() {
    if (!backup || !preview || !confirmed || imported || lock.current) return;
    lock.current = true; setBusy('import'); setImportError(''); setImportNotice('');
    const request = stableWorkspaceBackupRequest(importRequest.current, preview.previewHash, () => crypto.randomUUID());
    importRequest.current = request;
    try {
      const result = await post<WorkspaceBackupImportResult>({ action: 'import', backup, previewHash: preview.previewHash, requestId: request.requestId }, t);
      if (result.imported !== true || !Array.isArray(result.projectIds) || !Array.isArray(result.appIds)) throw new Error(t('服务未确认导入完成；可使用同一文件和预检结果重试核对。'));
      setImported(true);
      setImportNotice(t('已导入 {projects} 个新项目、{apps} 个新应用；未覆盖现有项目或空间设置。', { projects: result.projectIds.length, apps: result.appIds.length }));
      onImported(result);
    } catch (cause) {
      setImportError(`${cause instanceof Error ? localizeKnownBackupMessage(cause.message, t) : t('导入未完成。')} ${t('请保留同一文件和预检结果后重试；更换文件会使用新的请求编号。')}`);
    } finally { lock.current = false; setBusy(''); }
  }

  function close() { if (!lock.current) onClose(); }
  const canDownload = scopeMode !== 'project' || !!projectId;
  const appLimitExceeded = scopeMode === 'apps' && appIds.length > 10;

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="workspace-backup-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.header}><div><h2 id="workspace-backup-title">{t('工作空间备份')}</h2><p>{t('导出为 JSON，导入时先由服务端预检；确认后创建独立副本。')}</p></div><button ref={closeButton} type="button" onClick={close} disabled={!!busy} aria-label={t('关闭工作空间备份')}>{t('关闭')}</button></header>
    <div className={styles.body}>
      <section className={styles.disclosure}><h3>{t('备份范围与隐私')}</h3><p>{t('备份不包含身份凭据、API Key、分享发布令牌、运行状态、进行中请求、候选暂存结果、运行时输入或浏览器本地偏好（收藏、分类、布局和草稿）。导入会创建全新的项目和应用，不覆盖当前空间；空间设置只作为新项目的默认设置。')}</p><p>{t('导出的讨论、需求模板、应用模板、非敏感设置和版本配置可分别选择。模板是整个空间级数据，与所选项目或应用范围无关。')}</p></section>
      <section className={styles.section} aria-labelledby="workspace-export-heading"><div className={styles.sectionHeading}><div><h3 id="workspace-export-heading">{t('导出工作空间')}</h3><p>{t('单次最多 2 MiB、10 个应用、200 个版本。超过上限时可选择更少应用，或关闭模板部分。')}</p></div></div>
        <fieldset className={styles.scope}><legend>{t('导出范围')}</legend><label><input type="radio" name="backup-scope" checked={scopeMode === 'workspace'} onChange={() => setScopeMode('workspace')} disabled={!!busy} />{t('整个空间')}</label><label><input type="radio" name="backup-scope" checked={scopeMode === 'project'} onChange={() => setScopeMode('project')} disabled={!!busy} />{t('所选项目')}</label><label><input type="radio" name="backup-scope" checked={scopeMode === 'apps'} onChange={() => setScopeMode('apps')} disabled={!!busy} />{t('所选应用')}</label></fieldset>
        {scopeMode === 'project' && <label className={styles.field}>{t('项目')}<select value={projectId} onChange={event => setProjectId(event.target.value)} disabled={!!busy}>{snapshot.projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.archived ? t(' · 已归档') : ''} · {project.appCount} {t(' 个应用')}</option>)}</select></label>}
        {scopeMode === 'apps' && <div className={styles.appSelect}><div><strong>{t('选择应用（最多 10 个）')}</strong><span>{appIds.length}/10</span></div>{!snapshot.apps.length ? <p>{t('当前没有可选择的应用。')}</p> : <ul>{snapshot.apps.map(app => <li key={app.id}><label><input type="checkbox" checked={appIds.includes(app.id)} onChange={event => setAppIds(current => event.target.checked ? [...current, app.id] : current.filter(id => id !== app.id))} disabled={!!busy || (!appIds.includes(app.id) && appIds.length >= 10)} /><span>{app.name}<small>{projectNames.get(app.projectId) || t('项目')}{app.archived ? t(' · 已归档') : ''}</small></span></label></li>)}</ul>}</div>}
        <fieldset className={styles.sections}><legend>{t('备份内容')}</legend>{([["discussions",'讨论与消息'],["promptTemplates",'需求模板'],["appTemplates",'应用模板'],["settings",'非敏感设置'],["versionConfigs",'版本配置']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={sections[key]} onChange={event => setSection(key,event.target.checked)} disabled={!!busy} />{t(label)}</label>)}</fieldset>
        {sections.promptTemplates || sections.appTemplates ? <p className={styles.hint}>{t('需求模板和应用模板始终按整个空间导出，不随项目或应用筛选。')}</p> : null}
        {scopeMode === 'project' && (snapshot.projects.find(project => project.id === projectId)?.appCount ?? 0) > 10 && <p className={styles.warning}>{t('此项目有超过 10 个应用。请切换到“所选应用”分批导出。')}</p>}
        {appLimitExceeded && <p className={styles.warning}>{t('每份最多 10 个应用，请减少选择。')}</p>}
        {downloadError && <p className={styles.error} role="alert">{downloadError}</p>}{downloadNotice && <p className={styles.notice} role="status">{downloadNotice}</p>}
        <button type="button" className={styles.primary} onClick={() => void download()} disabled={!!busy || !canDownload || appLimitExceeded || (scopeMode === 'apps' && appIds.length === 0)}>{busy === 'download' ? t('正在请求备份…') : t('导出 JSON')}</button>
      </section>
      <section className={styles.section} aria-labelledby="workspace-import-heading"><div className={styles.sectionHeading}><div><h3 id="workspace-import-heading">{t('导入备份')}</h3><p>{t('选择 v2 JSON 文件后，由服务端校验内容并计算预检摘要；不会在浏览器执行 HTML。')}</p></div></div>
        <label className={styles.file}>{t('选择工作空间备份 JSON')}<input type="file" accept=".json,application/json" onChange={event => void inspectFile(event)} disabled={!!busy} /></label>
        {busy === 'preview' && <p className={styles.status} role="status">{t('正在读取文件并请求服务端预检…')}</p>}
        {importError && <p className={styles.error} role="alert">{importError}</p>}{importNotice && <p className={styles.notice} role="status">{importNotice}</p>}
        {preview && <div className={styles.preview}><h4>{t('服务端预检结果')}</h4><p>{preview.projectCount} {t(' 个项目 · ')}{preview.appCount} {t(' 个应用 · ')}{preview.versionCount} {t(' 个版本 · ')} {formatBackupBytes(preview.bytes)}</p><dl>{[["promptTemplateCount",'需求模板'],["appTemplateCount",'应用模板'],["discussionCount",'讨论线程'],["turnCount",'讨论消息'],["versionConfigCount",'版本配置']] .map(([key,label])=><div key={key}><dt>{t(label as HostMessageKey)}</dt><dd>{count(preview[key as keyof BackupPreview])}</dd></div>)}</dl>
          {preview.notes.length > 0 && <ul className={styles.notes}>{preview.notes.map((note,index)=><li key={index}>{localizeKnownBackupMessage(note,t)}</li>)}</ul>}
          <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!!busy || imported} /> {t('我确认导入为新建项目和应用副本；不会覆盖当前空间设置、分享或已有内容。')}</label>
          <button type="button" className={styles.primary} onClick={() => void importBackup()} disabled={!confirmed || !!busy || imported}>{busy === 'import' ? t('正在创建副本…') : imported ? t('已完成导入') : importError ? t('使用同一预检结果重试导入') : t('确认导入新副本')}</button>
        </div>}
      </section>
      <p className={styles.footer}>{t('预检不写入数据，也不会调用模型。取消或关闭不执行导入。导入失败时保留文件和预检结果；同一预检结果重试会复用请求编号。')}</p>
    </div>
  </dialog>;
}
