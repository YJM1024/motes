'use client';

import { useState } from 'react';
import styles from './ExpandableText.module.css';

export default function ExpandableText({ text, limit = 600, className = '' }: { text: string; limit?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState('');
  const characters = Array.from(text);
  const long = characters.length > limit;
  const shown = long && !expanded ? `${characters.slice(0, limit).join('')}…` : text;
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied('已复制完整文本。'); }
    catch { setCopied('复制失败，请检查浏览器权限后重试。'); }
  }
  return <div className={`${styles.root} ${className}`}>
    <div className={styles.text}>{shown}</div>
    <div className={styles.actions}>{long&&<button type="button" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?'收起':'展开全文'}</button>}<button type="button" onClick={()=>void copy()}>复制全文</button>{copied&&<span role="status" aria-live="polite">{copied}</span>}</div>
  </div>;
}
