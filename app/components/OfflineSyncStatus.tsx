'use client';

import { Cloud, CloudOff, RotateCw, TriangleAlert } from 'lucide-react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './OfflineSyncStatus.module.css';

export type OfflineSyncStatusProps = {
  status: 'online' | 'offline' | 'syncing' | 'error';
  ready: boolean;
  pendingCount: number;
  conflictCount: number;
  storage: 'indexeddb' | 'unavailable';
  disabled?: boolean;
  onSync: () => void;
  onOpenConflicts: () => void;
};

export default function OfflineSyncStatus({ status, ready, pendingCount, conflictCount, storage, disabled=false, onSync, onOpenConflicts }: OfflineSyncStatusProps) {
  const { t } = useHostLocale();
  const safePending = Number.isFinite(pendingCount) ? Math.max(0, Math.floor(pendingCount)) : 0;
  const safeConflicts = Number.isFinite(conflictCount) ? Math.max(0, Math.floor(conflictCount)) : 0;
  const storageUnavailable = storage === 'unavailable';
  const title = storageUnavailable ? t('离线保存不可用') : !ready ? t('正在读取离线状态…') : status === 'offline' ? t('离线') : status === 'syncing' ? t('正在同步') : status === 'error' ? t('同步失败') : t('已连接');
  const message = storageUnavailable
    ? t('浏览器本地存储不可用；无法保证断网时保存内容。请保持网络连接。')
    : !ready ? ''
    : safeConflicts > 0
      ? t('先核对 {count} 项冲突；本地内容会保留，不会自动覆盖。', { count: safeConflicts })
      : status === 'offline'
        ? safePending > 0 ? t('{count} 项已保存在此设备，联网后可手动同步。', { count: safePending }) : t('当前网络不可用；本地更改会保留，联网后请手动同步。')
        : status === 'syncing'
          ? t('正在同步本地更改…')
          : status === 'error'
            ? t('同步未完成；本地更改会保留，可检查冲突后重试。')
            : safePending > 0
              ? t('有 {count} 项待同步', { count: safePending })
              : t('已连接且暂无待同步内容。');
  const StatusIcon = storageUnavailable || status === 'error' ? TriangleAlert : status === 'offline' ? CloudOff : Cloud;
  const canSync = !disabled && ready && !storageUnavailable && (status === 'online' || status === 'error') && safePending > 0 && safeConflicts === 0;

  return <section className={`${styles.root} ${storageUnavailable || status === 'error' ? styles.attention : status === 'offline' ? styles.offline : ''}`} aria-label={t('离线状态和同步信息')} aria-busy={status === 'syncing'}>
    <div className={styles.summary}>
      <StatusIcon size={16} aria-hidden="true" />
      <strong>{title}</strong>
    </div>
    {message && <p className={storageUnavailable || status === 'error' ? styles.notice : ''} role={storageUnavailable || status === 'error' || safeConflicts > 0 ? 'status' : undefined}>{message}</p>}
    {ready && safeConflicts > 0 && <div className={styles.actions}><button type="button" onClick={onOpenConflicts}>{t('打开冲突列表')} <span aria-hidden="true">({safeConflicts})</span></button></div>}
    {ready && safePending > 0 && <div className={styles.actions}><button type="button" className={styles.sync} onClick={onSync} disabled={!canSync} aria-disabled={!canSync} title={!canSync ? message : undefined}><RotateCw size={14} aria-hidden="true" />{status === 'syncing' ? t('正在同步…') : t('手动同步')}</button></div>}
  </section>;
}
