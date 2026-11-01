'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './OfflineChangesPanel.module.css';

export type OfflineChangeItem = {
  id: string;
  kind: 'source' | 'import' | 'runtime';
  state: 'pending' | 'conflict' | 'saved' | 'discarded';
  appId: string;
  appName?: string;
  createdAt: string;
  html?: string;
  value?: unknown;
  key?: string;
};

type Props = {
  items: OfflineChangeItem[];
  busy?: boolean;
  onDiscard: (id: string) => void;
  onClose: () => void;
};

const stateLabels = { pending: '待同步', conflict: '有冲突', saved: '已保存', discarded: '已退出队列' } as const;
const kindLabels = { source: '源码', import: '导入', runtime: '运行数据' } as const;

function dateLabel(value: string, locale: 'zh-CN' | 'en') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function exportable(item: OfflineChangeItem) {
  return (item.kind === 'source' && typeof item.html === 'string') || (item.kind !== 'source' && item.value !== undefined) || (item.kind === 'import' && typeof item.html === 'string');
}

function exportFile(item: OfflineChangeItem) {
  if (item.kind === 'source' && typeof item.html === 'string') return { content: item.html, type: 'text/html;charset=utf-8', extension: 'html' };
  if (item.kind === 'import' && typeof item.html === 'string' && item.value === undefined) return { content: item.html, type: 'text/html;charset=utf-8', extension: 'html' };
  if (item.value === undefined) return null;
  let content: string;
  try { content = JSON.stringify({ format: 'motes-offline-change', version: 1, id: item.id, kind: item.kind, appId: item.appId, createdAt: item.createdAt, ...(item.key ? { key: item.key } : {}), value: item.value }, null, 2); }
  catch { return null; }
  return { content, type: 'application/json;charset=utf-8', extension: 'json' };
}

function download(item: OfflineChangeItem) {
  const file = exportFile(item);
  if (!file) throw new Error('export-unavailable');
  const blob = new Blob([file.content], { type: file.type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `motes-local-${item.kind}-${item.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'change'}.${file.extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function OfflineChangesPanel({ items, busy = false, onDiscard, onClose }: Props) {
  const { t, locale } = useHostLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<'all' | OfflineChangeItem['state']>('all');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
  const visible = useMemo(() => items.filter(item => state === 'all' || item.state === state), [items, state]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  function exportItem(item: OfflineChangeItem) {
    setExportError(false);
    try { download(item); }
    catch { setExportError(true); }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="offline-changes-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className={styles.header}>
      <div><h2 id="offline-changes-title">{t('本地更改')}</h2><p>{t('查看、导出或退出同步队列中的本地更改。')}</p></div>
      <button ref={closeButton} type="button" onClick={onClose} aria-label={t('关闭本地更改')}>{t('关闭')}</button>
    </header>
    <div className={styles.content}>
      <p className={styles.privacy}>{t('导出内容只包含此项本地更改，不含平台凭据、身份或同步令牌。请检查你自行填写的内容是否含敏感信息。')}</p>
      <label className={styles.filter}>{t('状态')}<select value={state} onChange={event => setState(event.target.value as typeof state)}><option value="all">{t('全部状态')}</option><option value="pending">{t('待同步')}</option><option value="conflict">{t('有冲突')}</option><option value="saved">{t('已保存')}</option><option value="discarded">{t('已退出队列')}</option></select></label>
      <p className={styles.count} role="status">{t('显示 {visible} / {total} 项', { visible: visible.length, total: items.length })}</p>
      {exportError && <p className={styles.error} role="alert">{t('导出失败，请重试。')}</p>}
      {!visible.length ? <div className={styles.empty}><h3>{items.length ? t('没有符合条件的更改') : t('暂时没有本地更改。')}</h3></div> : <ul className={styles.list}>{visible.map(item => {
        const fileAvailable = exportable(item);
        return <li key={item.id} className={styles.card}>
          <div className={styles.cardHead}><div><span className={styles.kind}>{t(kindLabels[item.kind])}</span><span className={`${styles.state} ${styles[item.state]}`}>{t(stateLabels[item.state])}</span></div><time dateTime={item.createdAt}>{dateLabel(item.createdAt, locale)}</time></div>
          <dl className={styles.metadata}><div><dt>{t('应用')}</dt><dd className={styles.appName}>{item.appName?.trim() || t('未命名应用')}</dd></div></dl>
          <details className={styles.payload}><summary>{t('查看本地内容')}</summary><dl className={styles.metadata}><div><dt>{t('应用编号')}</dt><dd><code>{item.appId}</code></dd></div>{item.key && <div><dt>{t('数据键')}</dt><dd><code>{item.key}</code></dd></div>}</dl>{(item.html !== undefined || item.value !== undefined) && <pre>{typeof item.html === 'string' ? item.html : (() => { try { return JSON.stringify(item.value, null, 2) ?? ''; } catch { return t('无法显示此项内容。'); } })()}</pre>}</details>
          <div className={styles.actions}>
            {fileAvailable && <button type="button" onClick={() => exportItem(item)}>{t(item.kind === 'source' || (item.kind === 'import' && item.value === undefined) ? '导出 HTML' : '导出 JSON')}</button>}
            {item.state !== 'discarded' && item.state !== 'saved' && <button type="button" className={styles.remove} disabled={busy} onClick={() => { setConfirmId(confirmId === item.id ? null : item.id); setExportError(false); }}>{t('放弃此更改')}</button>}
          </div>
          {confirmId === item.id && <div className={styles.confirm} role="alertdialog" aria-label={t('确认移出同步队列？')}>
            <p>{t('确认移出同步队列？')} {t('此操作只退出同步队列；本地副本仍保留，也不会删除公共数据。')}</p>
            <div><button type="button" disabled={busy} onClick={() => setConfirmId(null)}>{t('保留此更改')}</button><button type="button" className={styles.remove} disabled={busy} onClick={() => { onDiscard(item.id); setConfirmId(null); }}>{t('确认移出队列')}</button></div>
          </div>}
        </li>;
      })}</ul>}
    </div>
  </dialog>;
}
