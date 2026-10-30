'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {homeNotice} from "@/lib/motes/locale/home-notices";
import { useHostLocale,hostText } from '@/app/components/HostLocaleProvider';
import type { HostMessageKey } from '@/lib/motes/locale';
import { applyStylePreset, DEFAULT_STYLE_PRESET, STYLE_PRESET_OPTIONS, type StylePreset } from '@/lib/motes/style-presets';
import { safeDocument, PREVIEW_POLICY } from '@/lib/motes/preview-document';
import InlineConfirm from './InlineConfirm';
import styles from './StylePresetPanel.module.css';

type Props = { html: string; baseVersionId: string; onApply: (candidateHtml: string, name: string) => Promise<void>; disabled?: boolean; onClose: () => void };
const labels: Record<keyof StylePreset, HostMessageKey> = { palette: '配色', typography: '字体', density: '内容密度', corners: '圆角', layout: '页面宽度' };
const optionLabels: Record<string, HostMessageKey> = { neutral: '中性', ocean: '海蓝', forest: '森林', sunset: '暖橙', system: '系统无衬线', serif: '衬线', mono: '等宽', compact: '紧凑', comfortable: '舒适', airy: '宽松', sharp: '利落', soft: '柔和', round: '圆润', default: '保持宽度', centered: '居中 760px', wide: '宽幅 1200px' };

export default function StylePresetPanel({ html, onApply, disabled = false, onClose }: Props) {
  const { locale,t } = useHostLocale();
  const [preset, setPreset] = useState<StylePreset>(DEFAULT_STYLE_PRESET);
  const [device, setDevice] = useState<'desktop'|'mobile'>('desktop');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pendingClose, setPendingClose] = useState(false);
  const busyRef = useRef(false), dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const dirty = Object.keys(DEFAULT_STYLE_PRESET).some(key => preset[key as keyof StylePreset] !== DEFAULT_STYLE_PRESET[key as keyof StylePreset]);
  const preview = useMemo(() => { try { return { html: applyStylePreset(html, preset), error: '' }; } catch (cause) { return { html: '', error: cause instanceof Error ? cause.message : hostText('预设无法预览。') }; } }, [html, preset]);
  const srcDoc = useMemo(() => typeof window === 'undefined' || !preview.html ? '' : safeDocument(preview.html, PREVIEW_POLICY), [preview.html]);
  useEffect(() => { const element = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null; element?.showModal(); closeButton.current?.focus(); return () => { element?.close(); previous?.focus(); }; }, []);
  function close() { if (busyRef.current) return; if (dirty) setPendingClose(true); else onClose(); }
  async function apply() {
    if (busyRef.current || disabled || preview.error || !preview.html || !dirty) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await onApply(preview.html, `样式预设：${optionLabels[preset.palette]} · ${optionLabels[preset.typography]} · ${optionLabels[preset.density]} · ${optionLabels[preset.corners]} · ${optionLabels[preset.layout]}`); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('保存失败，所选预设仍保留，可重试。')); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function change<K extends keyof StylePreset>(key: K, value: StylePreset[K]) { setPreset(current => ({ ...current, [key]: value })); setError(''); }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="style-preset-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.header}><div><h2 id="style-preset-title">{t('全局样式预设')}</h2><p>{t('基于当前已保存版本 · 只更新此面板预览')}</p></div><button ref={closeButton} type="button" onClick={close} disabled={busy}>{t('关闭')}</button></header>
    {pendingClose&&<InlineConfirm message="所选预设尚未应用。关闭后会放弃本次面板调整，原应用和版本不受影响。" confirmLabel="放弃预设并关闭" onCancel={()=>setPendingClose(false)} onConfirm={onClose}/>}
    <div className={styles.body} inert={pendingClose||busy}>
      <section className={styles.controls} aria-label={t('样式选项')}>{(Object.keys(STYLE_PRESET_OPTIONS) as (keyof StylePreset)[]).map(key=><label key={key}>{t(labels[key])}<select aria-label={t(labels[key])} disabled={disabled||busy} value={preset[key]} onChange={event=>change(key,event.target.value as never)}>{STYLE_PRESET_OPTIONS[key].map(value=><option key={value} value={value}>{t(optionLabels[value])}</option>)}</select></label>)}<p>{t('全局预设，应用后请检查细节。不同网页结构的呈现可能不同，不保证像素级一致。')}</p><div className={styles.actions}><button type="button" disabled={disabled||busy} onClick={()=>{setPreset(DEFAULT_STYLE_PRESET);setError('');}}>{t('恢复默认')}</button><button type="button" disabled={disabled||busy||!dirty||!!preview.error} className={styles.primary} onClick={()=>void apply()}>{busy?t('正在保存…'):t('应用为新版本')}</button></div>{preview.error&&<p className={styles.error} role="alert">{homeNotice(locale,preview.error)}</p>}{error&&<p className={styles.error} role="alert"><strong>{t("操作未完成：")}</strong>{homeNotice(locale,error)}</p>}<p className={styles.note}>{t('恢复默认只更改预设选择，不会修改或保存应用。')}</p></section>
      <section className={styles.preview}><div className={styles.previewHeader}><strong>{t('隔离预览')}</strong><label>{t('设备')}<select aria-label={t('预览设备')} value={device} onChange={event=>setDevice(event.target.value as 'desktop'|'mobile')}><option value="desktop">{t('桌面')}</option><option value="mobile">{t('手机 390px')}</option></select></label></div><div className={styles.stage}><iframe title={t('样式预设隔离预览')} srcDoc={srcDoc} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className={device==='mobile'?styles.mobile:''}/></div></section>
    </div>
  </dialog>;
}
