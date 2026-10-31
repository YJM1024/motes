'use client';

import { useRef, useState } from 'react';
import { Maximize2, RotateCcw } from 'lucide-react';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import styles from './PreviewControls.module.css';

export type PreviewDevice = 'desktop' | 'mobile';
export type PreviewControlsProps = {
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  width: number;
  onWidthChange: (width: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  fullscreenAvailable: boolean;
  onFullscreen: () => void;
  onRefresh: () => void;
  confirmRefresh?: boolean;
};

export default function PreviewControls({ device, onDeviceChange, width, onWidthChange, scale, onScaleChange, fullscreenAvailable, onFullscreen, onRefresh, confirmRefresh = true }: PreviewControlsProps) {
  const { t } = useHostLocale();
  const [confirming, setConfirming] = useState(false);
  const [widthEdit, setWidthEdit] = useState({base:width,text:String(width)});
  const mobileWidthInput = useRef<HTMLInputElement>(null);
  const widthDraft=widthEdit.base===width?widthEdit.text:String(width);
  const setWidthDraft=(text:string)=>setWidthEdit({base:width,text});
  const commitWidth = () => {
    const parsed = Number(widthDraft);
    if (Number.isFinite(parsed)) {
      const next = Math.max(280, Math.min(1920, Math.round(parsed)));
      onWidthChange(next);
      onDeviceChange(next <= 600 ? 'mobile' : 'desktop');
      setWidthDraft(String(next));
    } else setWidthDraft(String(width));
  };
  const requestRefresh = () => confirmRefresh ? setConfirming(true) : onRefresh();
  return (
    <div className={styles.root} aria-label={t('预览控件')}>
      <div className={styles.devices} role="group" aria-label={t('预览尺寸')}>
        <button type="button" aria-pressed={device === 'desktop'} onClick={() => {onDeviceChange('desktop');onWidthChange(1100);setWidthDraft('1100');}}>{t('桌面')}</button>
        <button type="button" aria-pressed={device === 'mobile'} onClick={() => { onDeviceChange('mobile'); onWidthChange(390); setWidthDraft('390'); }}>{t('手机')}</button>
        <button className={styles.desktopCustom} type="button" onClick={() => document.getElementById('preview-custom-width')?.focus()}>{t('自定义')}</button>
      </div>
      <label className={styles.width}>{t('宽度')} <input id="preview-custom-width" aria-label={t('自定义预览宽度')} type="number" min={280} max={1920} step={1} value={widthDraft} onChange={event => setWidthDraft(event.target.value)} onBlur={commitWidth} onKeyDown={event => { if (event.key === 'Enter') { commitWidth(); event.currentTarget.blur(); } }} /> px</label>
      <label className={styles.scale}>{t('缩放')} <select aria-label={t('预览缩放')} value={scale} onChange={event => onScaleChange(Number(event.target.value))}>{[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label>
      <details className={styles.mobileSettings} onKeyDown={event => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
        <summary>{t('预览设置')}</summary>
        <div className={styles.mobileSettingsBody}>
          <button type="button" onClick={() => mobileWidthInput.current?.focus()}>{t('自定义')}</button>
          <label className={styles.width}>{t('宽度')} <input ref={mobileWidthInput} aria-label={t('自定义预览宽度')} type="number" min={280} max={1920} step={1} value={widthDraft} onChange={event => setWidthDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { commitWidth(); event.currentTarget.blur(); } }} /> px</label>
          <button type="button" onClick={commitWidth}>{t('应用宽度')}</button>
          <label className={styles.scale}>{t('缩放')} <select aria-label={t('预览缩放')} value={scale} onChange={event => onScaleChange(Number(event.target.value))}>{[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label>
        </div>
      </details>
      {fullscreenAvailable && <button className={styles.icon} type="button" onClick={onFullscreen} aria-label={t('全屏预览')} title={t('全屏')}><Maximize2 size={16} /></button>}
      {!confirming ? <button className={styles.icon} type="button" onClick={requestRefresh} aria-label={t('刷新预览')} title={t('刷新')}><RotateCcw size={16} /></button> : <span className={styles.confirm} role="alert"><span>{t('刷新会清空预览中未保存的临时输入，已保存版本不受影响。')}</span><button type="button" onClick={() => setConfirming(false)}>{t('取消')}</button><button type="button" onClick={() => { setConfirming(false); onRefresh(); }}>{t('刷新')}</button></span>}
    </div>
  );
}
