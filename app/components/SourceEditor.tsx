'use client';

import {useHostLocale,hostText} from './HostLocaleProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Version } from '@/lib/forma/types';
import { MAX_SOURCE_LENGTH, sourceProblem } from '@/lib/motes/source-validation';
import { safeDocument, PREVIEW_POLICY } from '@/lib/motes/preview-document';
import styles from './SourceEditor.module.css';
import InlineConfirm from './InlineConfirm';
import { findSourceMatches, tokenizeHtml } from '@/lib/motes/source-search';

type Props = { project: Project; selectedVersionId: string; onClose: () => void; onSaved: (project: Project) => void; onMetadataUpdated: (project: Project) => void };
async function post(url: string, body: object): Promise<Project> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const text = await response.text(); let result: { error?: string; project?: Project };
  try { result = JSON.parse(text); } catch { result = { error: response.status === 403 ? hostText("请求来源无效，请返回本站重试。") : hostText("服务没有返回有效结果，草稿已保留。") }; }
  if (!response.ok || !result.project) throw new Error(result.error || hostText("保存未完成，草稿已保留，请重试核对。"));
  return result.project;
}
function versionLabel(v: Version) { return `v${v.number}${v.name ? ' · ' + v.name : ''}${v.important ? ' ★' : ''}`; }
export default function SourceEditor(props: Props) { return <Editor key={`${props.project.id}:${props.selectedVersionId}`} {...props}/>; }
function Editor({ project, selectedVersionId, onClose, onSaved, onMetadataUpdated }: Props) {
  const {locale,t}=useHostLocale();
  const first = project.versions.find(v => v.id === selectedVersionId) || project.versions.at(-1)!;
  const [baseId, setBaseId] = useState(first.id);
  const selected = project.versions.find(v => v.id === baseId)!;
  const current = project.versions.find(v => v.id === project.currentVersionId)!;
  const expectedCurrent = useRef(project.currentVersionId);
  const [expectedCurrentId] = useState(project.currentVersionId);
  const [draft, setDraft] = useState(first.html);
  const [preview, setPreview] = useState({ html: current.html, versionNumber: current.number, draft: false });
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLPreElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(first.name || '');
  const [important, setImportant] = useState(!!first.important);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ kind: 'close' | 'restore' } | { kind: 'base'; versionId: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const dirty = draft !== selected.html;
  const metadataDirty = name !== (selected.name || '') || important !== !!selected.important;
  const problem = sourceProblem(draft);
  const problemText = problem === "HTML 最多 180000 个字符。" ? t("HTML 最多 180000 个字符。") : problem === "请提供完整单文件 HTML：包含 doctype、html、head 和 body，至少 100 个字符。" ? t("请提供完整单文件 HTML：包含 doctype、html、head 和 body，至少 100 个字符。") : problem;
  const search = useMemo(() => findSourceMatches(draft, query, { caseSensitive }), [draft, query, caseSensitive]);
  const tokens = useMemo(() => tokenizeHtml(draft), [draft]);
  const renderCode = () => {
    const boundaries = new Set<number>([0, draft.length]);
    for (const t of tokens) { boundaries.add(t.start); boundaries.add(t.end); }
    for (const m of search.matches) { boundaries.add(m.start); boundaries.add(m.end); }
    const points = [...boundaries].sort((a, b) => a - b);
    const pieces: React.ReactNode[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i], end = points[i + 1]; if (start === end) continue;
      const token = tokens.find(t => t.start <= start && t.end >= end);
      const hit = search.matches.findIndex(m => m.start <= start && m.end >= end);
      pieces.push(<span key={start} className={[token ? styles[token.kind] : '', hit >= 0 ? (hit === activeMatch ? styles.activeHit : styles.hit) : ''].filter(Boolean).join(' ')}>{draft.slice(start, end)}</span>);
    }
    return pieces;
  };
  function moveMatch(delta: number) {
    if (!search.matches.length) return;
    const next = (activeMatch + delta + search.matches.length) % search.matches.length;
    setActiveMatch(next);
    const match = search.matches[next], editor = textarea.current;
    if (!editor) return;
    editor.focus(); editor.setSelectionRange(match.start, match.end);
    const before = draft.slice(0, match.start), lineStart = before.lastIndexOf('\n') + 1;
    const lineNumber = (before.match(/\n/g) || []).length;
    const style = getComputedStyle(editor), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    if (context) context.font = style.font;
    const x = parseFloat(style.paddingLeft) + (context?.measureText(draft.slice(lineStart, match.start)).width ?? (match.start-lineStart)*7);
    const y = parseFloat(style.paddingTop) + lineNumber * (parseFloat(style.lineHeight) || 20);
    const padLeft = parseFloat(style.paddingLeft), padRight = parseFloat(style.paddingRight), padTop = parseFloat(style.paddingTop), padBottom = parseFloat(style.paddingBottom);
    if (x > editor.scrollLeft + editor.clientWidth - padRight) editor.scrollLeft = x - editor.clientWidth + padRight + 20;
    else if (x < editor.scrollLeft + padLeft) editor.scrollLeft = Math.max(0, x - padLeft - 20);
    if (y > editor.scrollTop + editor.clientHeight - padBottom) editor.scrollTop = y - editor.clientHeight + padBottom + 20;
    else if (y < editor.scrollTop + padTop) editor.scrollTop = Math.max(0, y - padTop - 20);
    if (highlight.current) { highlight.current.scrollLeft = editor.scrollLeft; highlight.current.scrollTop = editor.scrollTop; }
  }
  function focusSearch() { searchInput.current?.focus(); searchInput.current?.select(); }
  function editorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); focusSearch(); }
    else if (e.key === 'Escape' && document.activeElement === searchInput.current) { setQuery(''); textarea.current?.focus(); }
  }
  function searchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.preventDefault(); setQuery(''); textarea.current?.focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); moveMatch(e.shiftKey ? -1 : 1); }
  }
  const srcDoc = useMemo(() => typeof window === 'undefined' ? '' : safeDocument(preview.html, PREVIEW_POLICY), [preview.html]);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null, element=dialog.current; element?.showModal(); return () => { element?.close(); previous?.focus(); }; }, []);
  useEffect(() => { const before = (e: BeforeUnloadEvent) => { if (dirty || metadataDirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [dirty, metadataDirty]);
  function close() { if (saving.current) return; if (pending) { setPending(null); return; } if (dirty || metadataDirty) setPending({ kind: 'close' }); else onClose(); }
  function loadBase(versionId: string) { const next = project.versions.find(v => v.id === versionId)!; setBaseId(next.id); setDraft(next.html); setName(next.name || ''); setImportant(!!next.important); setError(''); setNotice(t("已载入所选版本源码；预览保持原样，点击“运行草稿”后更新。")); attempt.current = null; }
  function changeBase(versionId: string) { if (saving.current) return; if (dirty || metadataDirty) setPending({ kind: 'base', versionId }); else loadBase(versionId); }
  function restore() { setDraft(selected.html); setPreview({ html: current.html, versionNumber: current.number, draft: false }); setError(''); setNotice(t("已恢复所选源码；预览回到应用当前版本。")); }
  function confirmPending() { const action = pending; setPending(null); if (action?.kind === 'close') onClose(); else if (action?.kind === 'base') loadBase(action.versionId); else if (action?.kind === 'restore') restore(); }
  async function save() {
    if (saving.current || problem || !dirty) return;
    saving.current = true; setBusy(true); setError(''); setNotice('');
    const fingerprint = JSON.stringify([baseId, expectedCurrent.current, draft]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: crypto.randomUUID() };
    try { const next = await post(`/api/projects/${encodeURIComponent(project.id)}/source`, { baseVersionId: baseId, expectedCurrentVersionId: expectedCurrent.current, html: draft, requestId: attempt.current.requestId }); onSaved(next); }
    catch (e) { setError(e instanceof Error ? e.message : t("保存失败，草稿已保留。")); }
    finally { saving.current = false; setBusy(false); }
  }
  async function metadata() {
    if (saving.current || !metadataDirty) return;
    saving.current = true; setBusy(true); setError(''); setNotice('');
    try { const next = await post(`/api/projects/${encodeURIComponent(project.id)}/versions/${encodeURIComponent(baseId)}`, { name, important }); onMetadataUpdated(next); setNotice(t("已保存版本资料，源码与当前版本保持不变。")); }
    catch (e) { setError(e instanceof Error ? e.message : t("版本资料保存失败。")); }
    finally { saving.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="source-editor-title"><header className={styles.header}><div><h2 id="source-editor-title">{t("源码编辑")}</h2><p>{project.title}{t(" · 手工保存不调用模型")}</p></div><button onClick={close} disabled={busy} aria-label={t("关闭源码编辑")}>{t("关闭")}</button></header>
    {pending && <InlineConfirm message={pending.kind === 'restore' ? "恢复所选已保存代码会替换未保存的源码。版本资料输入保留；已保存应用和历史不会受影响。" : "有尚未保存的源码或版本资料。放弃后无法恢复本次输入，已保存应用和历史保留。"} confirmLabel={pending.kind === 'restore' ? "放弃草稿并恢复代码" : pending.kind === 'base' ? "放弃修改并切换版本" : "放弃修改并关闭"} onCancel={() => setPending(null)} onConfirm={confirmPending}/>}
    <div inert={!!pending}><div className={styles.toolbar}><label>{t("编辑基础版本")}<select value={baseId} disabled={busy} onChange={e => changeBase(e.target.value)}>{project.versions.map(v => <option key={v.id} value={v.id}>{versionLabel(v)}{v.id === project.currentVersionId ? t(" · 当前") : ''}</option>)}</select></label><span className={dirty ? styles.unsaved : styles.saved}>{dirty ? t("有未保存的源码") : t("源码与已保存版本一致")}</span><button disabled={busy || !dirty} onClick={() => setPending({ kind: 'restore' })}>{t("恢复已保存代码")}</button></div>
    <div className={styles.workspace}><section className={styles.codePane}><div className={styles.paneHeader}><span>{t("完整单文件 HTML")}</span><span className={draft.length > MAX_SOURCE_LENGTH ? styles.errorText : ''}>{draft.length.toLocaleString(locale)} / {MAX_SOURCE_LENGTH.toLocaleString(locale)}{t(" 字符")}</span></div><div className={styles.editorWrap}><pre ref={highlight} aria-hidden="true" className={styles.highlight}>{renderCode()}{draft.endsWith('\n') ? '\n' : ''}</pre><textarea ref={textarea} autoFocus spellCheck={false} aria-label={t("编辑 HTML 源码草稿")} value={draft} disabled={busy} onKeyDown={editorKeyDown} onScroll={e => { const pre = highlight.current; if (pre) { pre.scrollTop = e.currentTarget.scrollTop; pre.scrollLeft = e.currentTarget.scrollLeft; } }} onChange={e => { setDraft(e.target.value); setActiveMatch(0); setError(''); }} className={styles.code}/></div><div className={styles.searchBar}><input ref={searchInput} aria-label={t("在源码中查找")} placeholder={t("查找源码…")} value={query} onKeyDown={searchKeyDown} onChange={e => { setQuery(e.target.value); setActiveMatch(0); }}/><label><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)}/>{t("区分大小写")}</label><span aria-live="polite">{search.matches.length ? `${activeMatch + 1} / ${search.matches.length}${search.truncated ? '+' : ''}` : query ? t("无匹配") : ''}</span><button type="button" disabled={!search.matches.length} onClick={() => moveMatch(-1)} aria-label={t("上一个匹配")}>↑</button><button type="button" disabled={!search.matches.length} onClick={() => moveMatch(1)} aria-label={t("下一个匹配")}>↓</button><button type="button" disabled={!query} onClick={() => { setQuery(''); textarea.current?.focus(); }}>{t("清除")}</button></div><p className={styles.hint}>{t("只有“运行草稿”更新此处预览；只有“保存为新版本”更新应用。外部资源与网络请求在预览中被阻止。")}</p></section><section className={styles.previewPane}><div className={styles.paneHeader}><span>{preview.draft?t("草稿预览 · 基于 v{p0}",{p0:preview.versionNumber}):t("应用当前版本 v{p0}",{p0:preview.versionNumber})}{preview.draft && preview.html !== draft ? t(" · 后续修改尚未运行") : ''}</span><select aria-label={t("草稿预览设备")} value={device} onChange={e => setDevice(e.target.value as 'desktop' | 'mobile')}><option value="desktop">{t("桌面")}</option><option value="mobile">{t("手机 390px")}</option></select></div><div className={styles.previewStage}><iframe title={t("隔离源码草稿预览")} srcDoc={srcDoc} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className={device === 'mobile' ? styles.mobile : ''}/></div></section></div>
    <div className={styles.bottom}><details className={styles.metadata}><summary>{t("所选已保存版本的名称与重要标记")}</summary><div><label>{t("版本名称")}<input maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)}/></label><label className={styles.check}><input type="checkbox" checked={important} disabled={busy} onChange={e => setImportant(e.target.checked)}/>{t("标记为重要版本")}</label><button disabled={busy || !metadataDirty} onClick={() => { setName(selected.name || ''); setImportant(!!selected.important); setError(''); }}>{t("取消资料修改")}</button><button disabled={busy || !metadataDirty} onClick={() => void metadata()}>{t("保存版本资料")}</button></div><p>{t("此处只修改 v")}{selected.number}{t(" 的资料，不保存源码草稿，也不改变当前版本。")}</p></details>
    {problem && <p className={styles.validation} role="status">{problemText}</p>}{error && <p className={styles.error} role="alert"><strong>{t("操作未完成：")}</strong>{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}<footer className={styles.footer}><span>{t("保存新增手工版本，保留所有历史。")}{baseId !== expectedCurrentId ? t(" 当前正从历史 v{p0} 编辑。",{p0:selected.number}) : ''}</span><button disabled={busy || !!problem} onClick={() => { setPreview({ html: draft, versionNumber: selected.number, draft: true }); setNotice(t("草稿仅在隔离预览中运行，尚未保存为应用版本。")); }}>{t("运行草稿")}</button><button className={styles.primary} disabled={busy || !!problem || !dirty || metadataDirty} title={metadataDirty ? t("请先保存或取消版本资料修改，再保存源码") : undefined} onClick={() => void save()}>{busy ? t("正在保存…") : t("保存为新版本")}</button></footer>{metadataDirty && <p className={styles.hint}>{t("版本资料尚未保存。请先保存资料，或恢复资料输入后再保存源码。")}</p>}</div>
    </div></dialog>;
}
