"use client";
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './WorkspaceConnection.module.css';

export default function WorkspaceConnection({ phase, error, compact = false, onRetry }: { phase:'restoring'|'error';error?:string;compact?:boolean;onRetry:()=>void }) {
  const {t}=useHostLocale();
  return <section className={`${styles.state} workspace-connection-state ${compact?styles.compact:''}`} aria-busy={phase==='restoring'}>
    <div className={styles.copy} role={phase==='error'?'alert':'status'}>
      {phase==='restoring'&&<LoaderCircle size={18} className="spin"/>}
      <div><h2>{phase==='restoring'?t('正在恢复工作空间'):t('暂时无法恢复工作空间')}</h2><p>{phase==='restoring'?t('正在确认身份、读取已保存的应用和当前设置。'):t('内容尚未核对完成，当前草稿与已保存作品不会被替换。')}</p></div>
      {phase==='error'&&<button type="button" onClick={onRetry}><RotateCcw size={14}/>{t('原位重试连接')}</button>}
    </div>
    {error&&phase==='error'&&<details className={styles.error}><summary>{t('查看连接原因')}</summary><p>{error}</p></details>}
    {!compact&&phase==='restoring'&&<div className={styles.skeleton} aria-hidden="true"><span/><span/><span/></div>}
  </section>;
}
