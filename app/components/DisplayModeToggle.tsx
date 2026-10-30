'use client';

import type { DisplayMode } from '@/lib/motes/display-mode';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import styles from './DisplayModeToggle.module.css';

export default function DisplayModeToggle({ value, onChange }: { value: DisplayMode; onChange: (value: DisplayMode) => void }) {
  const { t } = useHostLocale();
  return (
    <div className={styles.toggle} role="group" aria-label={t('显示模式')}>
      {(['summary', 'detail'] as const).map((mode) => (
        <button key={mode} type="button" aria-pressed={value === mode} className={value === mode ? styles.active : ''} onClick={() => onChange(mode)}>
          {mode === 'summary' ? t('概要') : t('详细')}
        </button>
      ))}
    </div>
  );
}
