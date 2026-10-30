'use client';

import type { DisplayMode } from '@/lib/motes/display-mode';
import styles from './DisplayModeToggle.module.css';

export default function DisplayModeToggle({ value, onChange }: { value: DisplayMode; onChange: (value: DisplayMode) => void }) {
  return (
    <div className={styles.toggle} role="group" aria-label="显示模式">
      {(['summary', 'detail'] as const).map((mode) => (
        <button key={mode} type="button" aria-pressed={value === mode} className={value === mode ? styles.active : ''} onClick={() => onChange(mode)}>
          {mode === 'summary' ? '概要' : '详细'}
        </button>
      ))}
    </div>
  );
}
