'use client';

import { useEffect, useRef } from 'react';
import { Palette } from 'lucide-react';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import { PALETTE_OPTIONS } from '@/lib/motes/palette-preferences';
import { usePalettePreference } from './PalettePreferenceProvider';
import styles from './PalettePicker.module.css';

export default function PalettePicker() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const keyboardFocus = useRef(true);
  const { locale } = useHostLocale();
  const { preference, setPreference, previewPalette, clearPreview } = usePalettePreference();
  const current = PALETTE_OPTIONS.find(option => option.value === preference) ?? PALETTE_OPTIONS[3];
  const isEnglish = locale === 'en';

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) {
        details.open = false;
        clearPreview();
      }
    };
    const cancelOnBlur = () => {
      if (detailsRef.current) detailsRef.current.open = false;
      clearPreview();
    };
    document.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('blur', cancelOnBlur);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      window.removeEventListener('blur', cancelOnBlur);
      clearPreview();
    };
  }, [clearPreview]);

  const summaryLabel = isEnglish ? `Workbench palette: ${current.en}` : `工作台色系：${current.zh}`;
  const commit = (value: typeof preference) => {
    setPreference(value);
    const details = detailsRef.current;
    if (details) {
      details.open = false;
      details.querySelector('summary')?.focus();
    }
    clearPreview();
  };
  return <details className={styles.root} ref={detailsRef} onKeyDown={event => {
    keyboardFocus.current = true;
    if (event.key === 'Escape' && event.currentTarget.open) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.open = false;
      clearPreview();
      event.currentTarget.querySelector('summary')?.focus();
    }
  }} onBlur={event => {
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related)) return;
    event.currentTarget.open = false;
    clearPreview();
  }} onToggle={event => { if (!event.currentTarget.open) clearPreview(); }} onPointerLeave={event => {
    if (event.pointerType !== 'mouse' || !event.currentTarget.open) return;
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related)) return;
    event.currentTarget.open = false;
    clearPreview();
  }}>
    <summary aria-label={summaryLabel} title={summaryLabel}>
      <Palette size={16} aria-hidden="true" />
      <span>{isEnglish ? current.en : current.zh}</span>
    </summary>
    <div className={styles.panel} role="group" aria-label={isEnglish ? 'Workbench palette' : '工作台色系'}>
      <p>{isEnglish ? 'Workbench palette' : '工作台色系'}</p>
      <div className={styles.options}>
        {PALETTE_OPTIONS.map(option => <label className={`${styles.option}${preference === option.value ? ` ${styles.selected}` : ''}`} key={option.value} onPointerDown={() => { keyboardFocus.current = false; }} onPointerEnter={event => { if (event.pointerType === 'mouse') previewPalette(option.value); }} onFocus={() => { if (keyboardFocus.current) previewPalette(option.value); }} onClick={() => { if (preference === option.value) commit(option.value); }}>
          <input type="radio" name="workbench-palette-picker" value={option.value} checked={preference === option.value} onChange={() => commit(option.value)} />
          <span className={styles.swatch} data-palette={option.value} aria-hidden="true"><i /><i /><i /></span>
          <span className={styles.label}>{isEnglish ? option.en : option.zh}</span>
          <span className={styles.check} aria-hidden="true">✓</span>
        </label>)}
      </div>
    </div>
  </details>;
}
