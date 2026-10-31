"use client";

import { useThemePreference } from './ThemePreferenceProvider';
import { usePalettePreference } from './PalettePreferenceProvider';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import { PALETTE_OPTIONS } from '@/lib/motes/palette-preferences';
import './theme-preferences-panel.css';

const choices = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
] as const;

export default function ThemePreferences() {
  const { preference, setPreference, storageUnavailable } = useThemePreference();
  const { preference: palette, setPreference: setPalette, storageUnavailable: paletteStorageUnavailable } = usePalettePreference();
  const { locale, t } = useHostLocale();
  return <section className="theme-preferences settings-section" aria-labelledby="theme-preferences-title">
    <h3 id="theme-preferences-title">{t('界面主题')}</h3>
    <p>{t('这是本浏览器的界面偏好，只改变工作台，不会改写应用代码或应用预览。浅色保留原有外观；跟随系统时按设备的浅色/深色设置切换。')}</p>
    <fieldset>
      <legend>{t('选择主题')}</legend>
      {choices.map(choice => <label key={choice.value}><input type="radio" name="theme-preference" value={choice.value} checked={preference === choice.value} onChange={() => setPreference(choice.value)}/>{t(choice.label)}</label>)}
    </fieldset>
    {storageUnavailable && <p className="theme-storage-warning" role="status">{t('浏览器本地存储不可用；此主题仅在当前页面会话中生效。')}</p>}
    <p className="palette-description">{locale === 'en' ? 'Color palettes are independent from light/dark mode and only change workbench colors. They do not change app code or previews.' : '工作台色系与明暗模式独立，只更改工作台配色，不会改写应用代码或预览。'}</p>
    <fieldset className="palette-fieldset">
      <legend>{locale === 'en' ? 'Workbench palette' : '工作台色系'}</legend>
      <div className="palette-grid">
        {PALETTE_OPTIONS.map(choice => <label className={`palette-card${palette === choice.value ? ' selected' : ''}`} key={choice.value}>
          <input type="radio" name="palette-preference" value={choice.value} checked={palette === choice.value} onChange={() => setPalette(choice.value)} />
          <span className="palette-card-preview" data-palette={choice.value} aria-hidden="true"><i/><i/><i/></span>
          <span className="palette-card-label">{locale === 'en' ? choice.en : choice.zh}</span>
          <span className="palette-card-check" aria-hidden="true">✓</span>
        </label>)}
      </div>
    </fieldset>
    {paletteStorageUnavailable && <p className="theme-storage-warning" role="status">{locale === 'en' ? 'Browser storage is unavailable; this palette applies only for this page session.' : '浏览器本地存储不可用；此色系仅在当前页面会话中生效。'}</p>}
  </section>;
}
