"use client";

import { useHostLocale } from './HostLocaleProvider';

/** Mounted only after the private host translation coverage has been audited. */
export default function InterfaceLanguagePreferences() {
  const { locale, setLocale, ready, storageStatus, t } = useHostLocale();
  return <section className="settings-section interface-language-preferences" aria-labelledby="host-language-heading">
    <h3 id="host-language-heading">{t('界面语言')}</h3>
    <p>{t('仅改变本浏览器的工作台文字，不会改写需求、应用标题、保存记录或应用预览。生成语言在创作设置中单独选择。')}</p>
    <div className="language-preference-controls"><label htmlFor="host-language-select">{t('工作台语言')}</label>
    <select id="host-language-select" value={locale} disabled={!ready} onChange={event => setLocale(event.target.value === 'en' ? 'en' : 'zh-CN')}>
      <option value="zh-CN">{t("简体中文")}</option>
      <option value="en">English</option>
    </select>
    <button type="button" className="secondary-button" disabled={!ready || locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>{t("恢复默认（简体中文）")}</button></div>
    {!ready && <p role="status">{t("正在读取本浏览器的语言偏好…")}</p>}
    {storageStatus === 'memory' && <p role="status">{t('浏览器存储不可用，界面语言仅在当前页面会话中生效。')}</p>}
  </section>;
}
