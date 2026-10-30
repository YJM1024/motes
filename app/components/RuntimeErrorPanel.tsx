'use client';
import { useEffect, useRef, useState } from 'react';
import type { RuntimeDiagnostic } from '@/lib/motes/runtime-diagnostics';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import styles from './RuntimeErrorPanel.module.css';
export function RuntimeErrorPanel({ errors, modelAvailable, current, busy, onPrepare, onSource }: { errors: RuntimeDiagnostic[]; modelAvailable: boolean; current: boolean; busy: boolean; onPrepare: () => void; onSource: () => void }) {
  const { t } = useHostLocale();
  const [closed, setClosed] = useState(false), [details, setDetails] = useState(false);
  if (!errors.length) return null;
  if (closed) return <div className={styles.compact}><button onClick={() => setClosed(false)}>{t('预览运行问题（{count}）· 查看', { count: errors.length })}</button></div>;
  return <section className={styles.panel} aria-label={t('预览运行诊断')}><div className={styles.heading}><p role="status">{t('预览检测到 {count} 个运行问题', { count: errors.length })}</p><button aria-label={t('收起运行问题面板')} onClick={() => setClosed(true)}>{t('关闭')}</button></div><p className={styles.hint}>{t('仅收集错误类别和预览行列，不收集错误原文、输入或堆栈。重复合并，最多保留 10 项。')}</p><div className={styles.actions}><button aria-expanded={details} onClick={() => setDetails(!details)}>{details ? t('隐藏详情') : t('展开详情')}</button><button disabled={busy} onClick={onSource}>{t('打开源码手动修复')}</button><button disabled={busy || !modelAvailable || !current} onClick={onPrepare}>{t('准备 AI 修复需求')}</button></div>{!modelAvailable ? <p className={styles.hint}>{t('尚未连接模型，无法调用 AI 修复；可打开源码手动排查。')}</p> : !current ? <p className={styles.hint}>{t('当前预览为历史版本。请回到当前版本或先创建副本，再准备 AI 修复。')}</p> : <p className={styles.hint}>{t('准备只填入可编辑需求；点击发送才会调用模型。不会自动修复或重复调用。')}</p>}{details && <ul className={styles.details}>{errors.map((e, i) => <li key={i}><strong>{e.errorType}</strong><span>{e.kind === 'unhandledrejection' ? t('未捕获 Promise 拒绝') : t('JavaScript 错误')}{e.line ? ` · ${t('预览第 {line} 行 / {column} 列', { line: e.line, column: e.column })}` : ` · ${t('无源码位置')}`}</span></li>)}</ul>}</section>;
}
export function RuntimeRepairDialog({ initial, draft, onClose, onApply }: { initial: string; draft: string; onClose: () => void; onApply: (text: string, placement: 'replace' | 'append') => void }) {
  const { t } = useHostLocale();
  const [text, setText] = useState(initial), [error, setError] = useState(''); const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const element = dialog.current; element?.showModal(); return () => { element?.close(); previous?.focus(); }; }, []);
  function apply(placement: 'replace' | 'append') { try { onApply(text, placement); } catch (e) { setError(e instanceof Error ? e.message : t('需求过长，请先精简。')); } }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="runtime-repair-title" onCancel={e => { e.preventDefault(); onClose(); }}><header><h2 id="runtime-repair-title">{t('准备 AI 修复需求')}</h2><button onClick={onClose}>{t('取消')}</button></header><div><p>{t('当前已有未发送需求，保持原稿直到你明确选择。下方内容可先编辑；本步骤不调用模型。')}</p><textarea autoFocus aria-label={t('编辑运行修复需求')} value={text} onChange={e => setText(e.target.value)}/><small>{t('{length} / {limit} 字', { length: text.length, limit: 4000 })}</small>{error && <p className={styles.error} role="alert">{error}</p>}<footer><button onClick={onClose}>{t('保留原稿')}</button><button disabled={!text.trim() || draft.length + text.length + 2 > 4000} onClick={() => apply('append')}>{t('追加到需求末尾')}</button><button disabled={!text.trim() || text.length > 4000} onClick={() => apply('replace')}>{t('替换当前需求')}</button></footer>{draft.length + text.length + 2 > 4000 && <small>{t('追加后超过 4000 字，请先精简或选择替换。')}</small>}</div></dialog>;
}
