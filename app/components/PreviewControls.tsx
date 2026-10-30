'use client';

import { useState } from 'react';
import { Maximize2, RotateCcw } from 'lucide-react';
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
  const [confirming, setConfirming] = useState(false);
  const [widthDraft, setWidthDraft] = useState(String(width));
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
    <div className={styles.root} aria-label="预览控件">
      <div className={styles.devices} role="group" aria-label="预览尺寸">
        <button type="button" aria-pressed={device === 'desktop'} onClick={() => onDeviceChange('desktop')}>桌面</button>
        <button type="button" aria-pressed={device === 'mobile'} onClick={() => { onDeviceChange('mobile'); onWidthChange(390); setWidthDraft('390'); }}>手机</button>
        <button type="button" onClick={() => document.getElementById('preview-custom-width')?.focus()}>自定义</button>
      </div>
      <label className={styles.width}>宽度 <input id="preview-custom-width" aria-label="自定义预览宽度" type="number" min={280} max={1920} step={1} value={widthDraft} onChange={event => setWidthDraft(event.target.value)} onBlur={commitWidth} onKeyDown={event => { if (event.key === 'Enter') { commitWidth(); event.currentTarget.blur(); } }} /> px</label>
      <label className={styles.scale}>缩放 <select aria-label="预览缩放" value={scale} onChange={event => onScaleChange(Number(event.target.value))}>{[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label>
      {fullscreenAvailable && <button className={styles.icon} type="button" onClick={onFullscreen} aria-label="全屏预览" title="全屏"><Maximize2 size={16} /></button>}
      {!confirming ? <button className={styles.icon} type="button" onClick={requestRefresh} aria-label="刷新预览" title="刷新"><RotateCcw size={16} /></button> : <span className={styles.confirm} role="alert"><span>刷新会清空预览中未保存的临时输入，已保存版本不受影响。</span><button type="button" onClick={() => setConfirming(false)}>取消</button><button type="button" onClick={() => { setConfirming(false); onRefresh(); }}>刷新</button></span>}
    </div>
  );
}
