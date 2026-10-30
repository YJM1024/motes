'use client';

import { useRef,type KeyboardEvent } from 'react';
import type { WorkbenchMode } from '@/lib/motes/workbench-layout';
import styles from './WorkbenchLayoutControls.module.css';

type Props = {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
  chatWidth: number;
  onChatWidthChange: (width: number) => void;
  minChatWidth?: number;
  maxChatWidth?: number;
  disabled?: boolean;
};

const modeLabels: Array<[WorkbenchMode, string]> = [['split', '分栏'], ['chat', '专注对话'], ['preview', '专注预览']];

export default function WorkbenchLayoutControls({ mode, onModeChange, sidebarCollapsed, onSidebarCollapsedChange, chatWidth, onChatWidthChange, minChatWidth = 280, maxChatWidth = 720, disabled = false }: Props) {
  return <div className={styles.controls}>
    <div className={styles.modes} role="group" aria-label="工作区布局">{modeLabels.map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onModeChange(value)} disabled={disabled}>{label}</button>)}</div>
    <label className={styles.width}>对话宽度 <input type="range" min={minChatWidth} max={maxChatWidth} step={8} value={chatWidth} onChange={event => onChatWidthChange(Number(event.target.value))} disabled={disabled || mode !== 'split'} aria-label="调整对话面板宽度"/><span>{chatWidth}px</span></label>
    <button type="button" className={styles.sidebar} aria-expanded={!sidebarCollapsed} onClick={() => onSidebarCollapsedChange(!sidebarCollapsed)} disabled={disabled}>{sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}</button>
  </div>;
}

export function WorkbenchResizeHandle({ value, onChange, min = 280, max = 720, disabled = false }: { value: number; onChange: (value: number) => void; min?: number; max?: number; disabled?: boolean }) {
  const drag=useRef<{x:number;value:number}|null>(null);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 32 : 8;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = value - step;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = value + step;
    if (event.key === 'Home') next = min;
    if (event.key === 'End') next = max;
    if (next !== null) { event.preventDefault(); onChange(Math.max(min, Math.min(max, next))); }
  }
  return <div className={styles.resizeHandle} role="separator" aria-label="调整对话面板宽度" aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} 像素`} tabIndex={disabled ? -1 : 0} onKeyDown={keyDown} onPointerDown={event=>{if(disabled||event.button!==0)return;event.preventDefault();drag.current={x:event.clientX,value};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!drag.current)return;onChange(Math.max(min,Math.min(max,drag.current.value+event.clientX-drag.current.x)));}} onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onLostPointerCapture={()=>{drag.current=null;}} />;
}
