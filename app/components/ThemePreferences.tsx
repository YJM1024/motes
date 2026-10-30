"use client";

import { useThemePreference } from './ThemePreferenceProvider';
import './theme-preferences-panel.css';

const choices = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
] as const;

export default function ThemePreferences() {
  const { preference, setPreference, storageUnavailable } = useThemePreference();
  return <section className="theme-preferences settings-section" aria-labelledby="theme-preferences-title">
    <h3 id="theme-preferences-title">界面主题</h3>
    <p>这是本浏览器的界面偏好，只改变工作台，不会改写应用代码或应用预览。浅色保留原有外观；跟随系统时按设备的浅色/深色设置切换。</p>
    <fieldset>
      <legend>选择主题</legend>
      {choices.map(choice => <label key={choice.value}><input type="radio" name="theme-preference" value={choice.value} checked={preference === choice.value} onChange={() => setPreference(choice.value)}/>{choice.label}</label>)}
    </fieldset>
    {storageUnavailable && <p className="theme-storage-warning" role="status">浏览器本地存储不可用；此主题仅在当前页面会话中生效。</p>}
  </section>;
}
