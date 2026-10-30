'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './DataManagementPanel.module.css';

type Props = {
  onClose: () => void;
  onClearDrafts: () => Promise<void>;
  onResetDisplayPreferences: () => Promise<void>;
  onOpenBackup: () => void;
  onOpenArchive: () => void;
  alertPreferences: { enabled: boolean; threshold: number };
  onAlertPreferencesChange: (value: { enabled: boolean; threshold: number }) => void;
};

export default function DataManagementPanel({ onClose, onClearDrafts, onResetDisplayPreferences, onOpenBackup, onOpenArchive, alertPreferences, onAlertPreferencesChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<'drafts' | 'display' | null>(null);
  const [busy, setBusy] = useState<'drafts' | 'display' | ''>('');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); closeButton.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  async function run(action: 'drafts' | 'display') {
    if (busy) return;
    setBusy(action); setError(''); setNotice('');
    try {
      if (action === 'drafts') await onClearDrafts();
      else await onResetDisplayPreferences();
      setConfirm(null);
      setNotice(action === 'drafts' ? '已清理指定范围内的本地输入。' : '已重置概要/详细与分栏布局偏好。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作未完成；数据可能没有变化，请检查后重试。');
    } finally { setBusy(''); }
  }

  function close() { if (!busy) onClose(); }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="data-management-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.header}><div><h2 id="data-management-title">数据与偏好</h2><p>管理已保存作品、归档和本地输入。</p></div><button ref={closeButton} type="button" onClick={close} disabled={!!busy}>关闭</button></header>
    <div className={styles.content}>
      <section className={styles.card} aria-labelledby="saved-work-title"><h3 id="saved-work-title">已保存作品</h3><p>云端作品和版本会保留在工作空间中。预览中临时输入的数据会在关闭或刷新后清空。</p><div className={styles.actions}><button type="button" onClick={onOpenArchive} disabled={!!busy}>归档与恢复</button><button type="button" onClick={onOpenBackup} disabled={!!busy}>工作空间备份</button></div></section>

      <section className={styles.card} aria-labelledby="quota-alert-title"><h3 id="quota-alert-title">额度提醒</h3><p>设置仅保存在此浏览器的当前工作空间。余额真实降至所选阈值时，站内显示提示；不会发送浏览器外的通知。</p>
        <label className={styles.toggle}><input type="checkbox" checked={alertPreferences.enabled} onChange={event => onAlertPreferencesChange({ ...alertPreferences, enabled: event.target.checked })} />启用站内额度提示</label>
        <label className={styles.threshold}>剩余额度不高于
          <select value={Math.min(10, Math.max(0, alertPreferences.threshold))} onChange={event => onAlertPreferencesChange({ ...alertPreferences, threshold: Number(event.target.value) })} disabled={!alertPreferences.enabled}>
            {Array.from({ length: 11 }, (_, index) => <option key={index} value={index}>{index}</option>)}
          </select>时提示
        </label>
      </section>

      <section className={styles.card} aria-labelledby="local-data-title"><h3 id="local-data-title">当前设备上的临时数据</h3><p>清理仅移除当前工作空间的本地构建输入，以及当前标签页中的讨论输入。不会清理已提交请求及其恢复记录、身份信息或已保存内容。</p>
        {confirm === 'drafts' ? <div className={styles.confirm}><strong>确认清理这些本地输入？</strong><div className={styles.actions}><button type="button" onClick={() => setConfirm(null)} disabled={!!busy}>取消</button><button type="button" className={styles.danger} onClick={() => void run('drafts')} disabled={!!busy}>{busy === 'drafts' ? '正在清理…' : '确认清理输入'}</button></div></div> : <button type="button" onClick={() => { setError(''); setConfirm('drafts'); }}>清理本地输入…</button>}
      </section>

      <section className={styles.card} aria-labelledby="display-prefs-title"><h3 id="display-prefs-title">显示偏好</h3><p>重置范围仅为概要/详细模式和分栏布局。草稿、收藏与作品数据都会保留。</p>
        {confirm === 'display' ? <div className={styles.confirm}><strong>确认重置显示偏好？</strong><div className={styles.actions}><button type="button" onClick={() => setConfirm(null)} disabled={!!busy}>取消</button><button type="button" className={styles.danger} onClick={() => void run('display')} disabled={!!busy}>{busy === 'display' ? '正在重置…' : '确认重置偏好'}</button></div></div> : <button type="button" onClick={() => { setError(''); setConfirm('display'); }}>重置显示偏好…</button>}
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
      <p className={styles.footer}>危险操作会在确认后执行。关闭窗口或取消确认不会改变数据。</p>
    </div>
  </dialog>;
}
