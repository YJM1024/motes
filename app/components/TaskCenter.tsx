'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import type { HostMessageKey } from '@/lib/motes/locale';
import { filterTasks, formatTaskDate, formatTaskDuration, taskHasExpired, type TaskCenterItem, type TaskKind, type TaskPhase } from '@/lib/motes/task-center';
import styles from './TaskCenter.module.css';

type Props = {
  items: TaskCenterItem[];
  busy: boolean;
  onCheck: (requestId: string) => void;
  onSave: (requestId: string) => void;
  onClose: () => void;
};

const phaseLabels: Record<TaskPhase, HostMessageKey> = { running: '处理中', saved: '已保存', failed: '失败', save_pending: '待重试保存', unresolved: '待核对' };
const kindLabels: Record<TaskKind, HostMessageKey> = { generation: '生成请求', candidate: '候选保存', discussion: '文字讨论' };

export default function TaskCenter({ items, busy, onCheck, onSave, onClose }: Props) {
  const { t, locale } = useHostLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<TaskKind | 'all'>('all');
  const [phase, setPhase] = useState<TaskPhase | 'all'>('all');
  const [now, setNow] = useState<number | null>(null);
  const visible = useMemo(() => filterTasks(items, query, kind, phase), [items, query, kind, phase]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus();
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    return () => { cancelAnimationFrame(frame); element?.close(); previous?.focus(); };
  }, []);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="task-center-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className={styles.header}><div><h2 id="task-center-title">{t('任务中心')}</h2><p>{t('查看最近 50 条生成、候选及文字讨论记录；这里不会自动重试。')}</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label={t('关闭任务中心')}>{t('关闭')}</button></header>
    <div className={styles.content}>
      <div className={styles.filters}>
        <label className={styles.search}>{t('搜索请求')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('按需求或请求编号搜索')} /></label>
        <label>{t('类型')}<select value={kind} onChange={event => setKind(event.target.value as TaskKind | 'all')}><option value="all">{t('全部类型')}</option><option value="generation">{t('生成请求')}</option><option value="candidate">{t('候选保存')}</option><option value="discussion">{t('文字讨论')}</option></select></label>
        <label>{t('状态')}<select value={phase} onChange={event => setPhase(event.target.value as TaskPhase | 'all')}><option value="all">{t('全部状态')}</option>{Object.entries(phaseLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      </div>
      <p className={styles.count} role="status">{t('显示 {visible} / {total} 项', { visible: visible.length, total: items.length })}</p>
      {!visible.length ? <div className={styles.empty}><h3>{items.length ? t('没有匹配的任务') : t('暂无任务记录')}</h3><p>{items.length ? t('调整搜索内容或筛选条件。') : t('请求记录会在这里显示。')}</p></div> : <ul className={styles.list}>{visible.map(item => {
        const expired = now !== null && item.phase !== 'saved' && item.phase !== 'failed' && taskHasExpired(item, now);
        return <li key={item.id} className={styles.card}>
          <div className={styles.cardHead}><div><span className={styles.kind}>{t(kindLabels[item.kind])}</span><span className={`${styles.phase} ${styles[item.phase]}`}>{t(phaseLabels[item.phase])}</span>{expired && <span className={styles.expired}>{t('已过期')}</span>}</div><small>{t('创建于')} {formatTaskDate(item.createdAt, locale)}</small></div>
          <p className={styles.prompt}>{item.prompt}</p>
          <dl className={styles.metadata}><div><dt>{t('请求编号')}</dt><dd>{item.requestId}</dd></div>{item.expiresAt && <div><dt>{t('记录有效至')}</dt><dd>{formatTaskDate(item.expiresAt, locale)}{expired && <strong> · {t('已超过有效期')}</strong>}</dd></div>}<div><dt>{t('模型实测耗时')}</dt><dd>{formatTaskDuration(item.modelElapsedMs, locale)}</dd></div><div><dt>{t('总耗时（有结束记录时）')}</dt><dd>{formatTaskDuration(item.totalElapsedMs, locale)}</dd></div><div><dt>{t('暂存到保存')}</dt><dd>{formatTaskDuration(item.saveElapsedMs, locale)}</dd></div>{item.resultStagedAt&&<div><dt>{t('结果已暂存')}</dt><dd>{formatTaskDate(item.resultStagedAt, locale)}</dd></div>}{item.savedAt&&<div><dt>{t(item.kind==='discussion'?'回答已保存':'结果已保存')}</dt><dd>{formatTaskDate(item.savedAt, locale)}</dd></div>}</dl>
          {item.phase === 'running' && <p className={styles.guidance}>{t('请求仍可能在服务端运行。核对状态不会取消原请求。')}</p>}
          {item.phase === 'unresolved' && <p className={styles.guidance}>{t('结果尚未确认。核对状态不会取消或重复提交原请求。')}</p>}
          {item.phase === 'save_pending' && <p className={styles.guidance}>{t('只重试保存已生成的结果，不会重新调用模型。')}{expired ? ` ${t('记录已超过有效期，可能无法继续保存。')}` : ''}</p>}
          {item.phase === 'failed' && <p className={styles.guidance}>{t('记录显示请求失败；任务中心不会重新提交。')}</p>}
          {item.phase === 'saved' && <p className={styles.guidance}>{t(item.kind==='discussion'?'文字回答已保存，没有生成应用版本。':'结果已保存。')}</p>}
          <div className={styles.actions}>{(item.phase === 'running' || item.phase === 'unresolved') && <button type="button" onClick={() => onCheck(item.requestId)} disabled={busy}>{t('核对状态')}</button>}{item.phase === 'save_pending' && <button type="button" className={styles.primary} onClick={() => onSave(item.requestId)} disabled={busy || expired}>{t('仅重试保存')}</button>}</div>
        </li>;
      })}</ul>}
    </div>
  </dialog>;
}
