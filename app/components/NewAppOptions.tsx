'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './NewAppOptions.module.css';

type AppKind = 'empty' | 'budget' | 'kanban' | 'timer';
type Props = { busy: boolean; onCreate: (kind: AppKind) => Promise<void>; onClose: () => void; targetLabel?: string };

const options: { kind: AppKind; title: string; description: string }[] = [
  { kind: 'empty', title: '空白应用', description: '从空白页面开始，自行编写需求。' },
  { kind: 'budget', title: '预算记录', description: '静态示例模板副本，可再按需调整。' },
  { kind: 'kanban', title: '看板', description: '静态示例模板副本，可再按需调整。' },
  { kind: 'timer', title: '专注计时器', description: '静态示例模板副本，可再按需调整。' },
];

export default function NewAppOptions({ busy, onCreate, onClose, targetLabel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    closeButton.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  async function create(kind: AppKind) {
    if (busy) return;
    setError('');
    try { await onCreate(kind); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建未完成，请检查后重试。'); }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="new-app-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.header}><div><h2 id="new-app-title">新建应用</h2><p>{targetLabel ? `创建位置：${targetLabel}` : '选择一个起点，之后仍可继续编辑。'}</p></div><button ref={closeButton} type="button" onClick={onClose} disabled={busy}>关闭</button></header>
    <div className={styles.content}>
      <p className={styles.notice}>每次都会创建独立的新应用副本，不会覆盖或删除旧作品。示例模板是静态内容，不调用模型。</p>
      <div className={styles.options}>{options.map(option => <button type="button" key={option.kind} onClick={() => void create(option.kind)} disabled={busy}>
        <span className={styles.title}>{option.title}</span><span className={styles.description}>{option.description}</span>
      </button>)}</div>
      {busy && <p className={styles.status} role="status">正在创建应用…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.footer}>创建完成后，新应用会单独出现在作品列表中。关闭此窗口不会更改现有作品。</p>
    </div>
  </dialog>;
}
