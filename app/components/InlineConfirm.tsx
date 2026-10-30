'use client';
import { useEffect, useRef } from 'react';
import styles from './InlineConfirm.module.css';
export default function InlineConfirm({ message, confirmLabel, onCancel, onConfirm }: { message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; cancel.current?.focus(); return () => previous?.focus(); }, []);
  return <div className={styles.panel} role="alert"><p>{message}</p><div><button ref={cancel} type="button" onClick={onCancel}>继续编辑</button><button type="button" className={styles.confirm} onClick={onConfirm}>{confirmLabel}</button></div></div>;
}
