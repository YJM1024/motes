'use client';
import { useEffect, useRef } from 'react';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import type { HostMessageKey } from '@/lib/motes/locale';
import styles from './InlineConfirm.module.css';
export default function InlineConfirm({ message, confirmLabel, onCancel, onConfirm }: { message: HostMessageKey; confirmLabel: HostMessageKey; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useHostLocale();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; cancel.current?.focus(); return () => previous?.focus(); }, []);
  return <div className={styles.panel} role="alert"><p>{t(message)}</p><div><button ref={cancel} type="button" onClick={onCancel}>{t('继续编辑')}</button><button type="button" className={styles.confirm} onClick={onConfirm}>{t(confirmLabel)}</button></div></div>;
}
