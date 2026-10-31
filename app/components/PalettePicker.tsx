'use client';

import { useEffect, useRef } from 'react';
import { Palette } from 'lucide-react';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import { PALETTE_OPTIONS } from '@/lib/motes/palette-preferences';
import { usePalettePreference } from './PalettePreferenceProvider';
import styles from './PalettePicker.module.css';

export default function PalettePicker() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const { locale } = useHostLocale();
  const { preference, setPreference } = usePalettePreference();
  const current = PALETTE_OPTIONS.find(option => option.value === preference) ?? PALETTE_OPTIONS[3];
  const isEnglish = locale === 'en';

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, []);

  const summaryLabel = isEnglish ? `Workbench palette: ${current.en}` : `工作台色系：${current.zh}`;
  return <details className={styles.root} ref={detailsRef} onKeyDown={event => {
    if (event.key === 'Escape' && event.currentTarget.open) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary aria-label={summaryLabel} title={summaryLabel}>
      <Palette size={16} aria-hidden="true" />
      <span>{isEnglish ? current.en : current.zh}</span>
    </summary>
    <div className={styles.panel} role="group" aria-label={isEnglish ? 'Workbench palette' : '工作台色系'}>
      <p>{isEnglish ? 'Workbench palette' : '工作台色系'}</p>
      <div className={styles.options}>
        {PALETTE_OPTIONS.map(option => <label className={`${styles.option}${preference === option.value ? ` ${styles.selected}` : ''}`} key={option.value}>
          <input type="radio" name="workbench-palette-picker" value={option.value} checked={preference === option.value} onChange={() => setPreference(option.value)} />
          <span className={styles.swatch} data-palette={option.value} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.label}>{isEnglish ? option.en : option.zh}</span>
          <span className={styles.check} aria-hidden="true">✓</span>
        </label>)}
      </div>
    </div>
  </details>;
}
