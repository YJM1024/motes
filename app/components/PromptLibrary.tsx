'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BuiltinPrompt, PromptTemplate, TemplateAction, TemplateLibrary } from '@/lib/motes/template-types';
import { TEMPLATE_LIMITS } from '@/lib/motes/template-types';
import { composeTemplateDraft } from '@/lib/motes/template-draft';
import styles from './PromptLibrary.module.css';
import InlineConfirm from './InlineConfirm';

type Editor = { id?: string; originalName: string; originalPrompt: string };
type Choice = Pick<PromptTemplate, 'name' | 'prompt'>;
type Props = { draft: string; initialChoice?: Choice; onClose: () => void; onUse: (prompt: string, placement: 'replace' | 'append') => void };
async function request(body?: TemplateAction): Promise<TemplateLibrary> {
  const response = await fetch('/api/templates', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) } : { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const text = await response.text(); let data: TemplateLibrary & { error?: string };
  try { data = JSON.parse(text); } catch { throw new Error(response.status === 403 ? '请求来源无效，请返回本站重试。' : '服务没有返回有效结果，请重试。'); }
  if (!response.ok) throw new Error(data.error || '模板操作未完成，请重试。');
  return data;
}
export default function PromptLibrary({ draft, initialChoice, onClose, onUse }: Props) {
  const [library, setLibrary] = useState<TemplateLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'personal' | 'builtin'>('personal');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [choice, setChoice] = useState<Choice | null>(initialChoice || null);
  const [deleting, setDeleting] = useState<PromptTemplate | null>(null);
  const [pending, setPending] = useState<'close' | 'back' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const dirty = !!editor && (name !== editor.originalName || prompt !== editor.originalPrompt);
  const needle = query.trim().toLocaleLowerCase();
  const items = useMemo(() => (tab === 'personal' ? library?.templates || [] : library?.builtins || []).filter(t => `${t.name} ${t.prompt}`.toLocaleLowerCase().includes(needle)), [library, tab, needle]);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { dialog.current?.close(); previous?.focus(); }; }, []);
  async function load() { setLoading(true); setError(''); try { setLibrary(await request()); } catch (e) { setError(e instanceof Error ? e.message : '读取失败，请重试。'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => { const before = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [dirty]);
  function close() { if (lock.current) return; if (pending) { setPending(null); return; } if (dirty) setPending('close'); else onClose(); }
  function leaveEditor() { setEditor(null); setDeleting(null); setChoice(null); setError(''); }
  function back() { if (lock.current) return; if (dirty) setPending('back'); else leaveEditor(); }
  function confirmPending() { const action = pending; setPending(null); if (action === 'close') onClose(); else leaveEditor(); }
  function edit(item?: PromptTemplate | BuiltinPrompt, fromDraft = false) {
    const originalName = item?.name || '', originalPrompt = fromDraft ? draft : item?.prompt || '';
    setEditor({ ...item && !('readonly' in item) ? { id: item.id } : {}, originalName, originalPrompt });
    setName(originalName); setPrompt(originalPrompt); setError(''); setNotice(''); attempt.current = null;
  }
  async function mutate(action: Omit<Extract<TemplateAction, { action: 'create' }>, 'requestId'> | Omit<Extract<TemplateAction, { action: 'update' }>, 'requestId'> | Omit<Extract<TemplateAction, { action: 'delete' }>, 'requestId'>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const fingerprint = JSON.stringify(action);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: crypto.randomUUID() };
    try { const next = await request({ ...action, requestId: attempt.current.requestId } as TemplateAction); setLibrary(next); setEditor(null); setDeleting(null); setTab('personal'); setNotice(action.action === 'delete' ? '个人模板已删除，已填入的需求与应用保留。' : '个人模板已保存。使用模板只会填入需求。'); attempt.current = null; }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败，输入已保留。'); }
    finally { lock.current = false; setBusy(false); }
  }
  function use(item: Choice) { setError(''); if (draft.trim()) setChoice(item); else apply(item.prompt, 'replace'); }
  function apply(text: string, placement: 'replace' | 'append') { try { composeTemplateDraft(draft, text, placement); onUse(text, placement); } catch (e) { setError(e instanceof Error ? e.message : '需求过长，请先精简。'); } }
  const title = editor ? editor.id ? '编辑个人模板' : '保存个人模板' : deleting ? '删除个人模板' : choice ? '将模板填入需求' : '需求模板';
  const promptValid = !!prompt.trim() && prompt.length <= TEMPLATE_LIMITS.prompt;
  return <dialog ref={dialog} className={styles.dialog} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="prompt-library-title"><header className={styles.header}><div><h2 id="prompt-library-title">{title}</h2><p>复用好的表达，从容开始下一次创作。</p></div><button disabled={busy} onClick={close} aria-label="关闭需求模板库">关闭</button></header>
    {pending && <InlineConfirm message="个人模板编辑尚未保存。放弃这些修改后，创作台当前需求仍会完整保留。" confirmLabel={pending === 'close' ? '放弃修改并关闭' : '放弃修改并返回'} onCancel={() => setPending(null)} onConfirm={confirmPending}/>}
    <div className={styles.body} inert={!!pending}>{editor ? <form onSubmit={e => { e.preventDefault(); if (name.trim() && promptValid) void mutate(editor.id ? { action: 'update', id: editor.id, name, prompt } : { action: 'create', name, prompt }); }}><label className={styles.field}>模板名称<input autoFocus value={name} maxLength={TEMPLATE_LIMITS.name} required disabled={busy} onChange={e => setName(e.target.value)} placeholder="例如：清晰的预算工具需求"/></label><label className={styles.field}>需求内容<textarea rows={9} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="描述应用目标、主要操作和需要保留的细节。"/></label><p className={prompt.length > TEMPLATE_LIMITS.prompt ? styles.errorText : styles.hint}>{prompt.length.toLocaleString()} / {TEMPLATE_LIMITS.prompt} 字 · 保存模板不生成应用，不修改创作台当前需求。</p>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button type="button" onClick={back} disabled={busy}>取消</button><button className={styles.primary} disabled={busy || !name.trim() || !promptValid}>{busy ? '保存中…' : '保存个人模板'}</button></div></form> : deleting ? <><p className={styles.confirmText}>删除“{deleting.name}”？此操作只删除个人模板，已有应用、版本和已填入的需求保留。</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button disabled={busy} onClick={back}>取消</button><button className={styles.danger} disabled={busy} onClick={() => void mutate({ action: 'delete', id: deleting.id })}>{busy ? '删除中…' : '删除模板'}</button></div></> : choice ? <><p className={styles.hint}>当前已有需求。请明确选择替换或追加，尚未发送，也不会自动调用模型。</p><h3 className={styles.choiceTitle}>{choice.name}</h3><pre className={styles.choiceText}>{choice.prompt}</pre>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button onClick={back}>取消</button><button disabled={draft.length + choice.prompt.length + 2 > TEMPLATE_LIMITS.prompt} title="保留当前需求，在末尾追加模板" onClick={() => apply(choice.prompt, 'append')}>追加到末尾</button><button className={styles.primary} onClick={() => apply(choice.prompt, 'replace')}>替换当前需求</button></div>{draft.length + choice.prompt.length + 2 > TEMPLATE_LIMITS.prompt && <p className={styles.hint}>追加会超过 {TEMPLATE_LIMITS.prompt} 字，请选择替换或先精简当前需求。</p>}</> : <><div className={styles.toolbar}><div role="tablist" aria-label="模板类型"><button role="tab" aria-selected={tab === 'personal'} className={tab === 'personal' ? styles.active : ''} onClick={() => { setTab('personal'); setError(''); }}>我的模板 <span>{library?.total || 0}</span></button><button role="tab" aria-selected={tab === 'builtin'} className={tab === 'builtin' ? styles.active : ''} onClick={() => { setTab('builtin'); setError(''); }}>内置灵感</button></div><input aria-label="搜索模板名称或需求" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="搜索模板…"/></div><div className={styles.createBar}><span>{tab === 'personal' ? '仅当前匿名工作空间可见' : '3 个只读起点 · 不计入个人模板'}</span><button disabled={!library || busy || library.total >= library.limits.templates} onClick={() => edit()}>新建模板</button><button disabled={!library || !draft.trim() || draft.length > TEMPLATE_LIMITS.prompt || library.total >= library.limits.templates} onClick={() => edit(undefined, true)}>保存当前需求</button></div>{draft.length > TEMPLATE_LIMITS.prompt && <p className={styles.hint}>当前需求超过 {TEMPLATE_LIMITS.prompt} 字，请先精简再存为模板。</p>}{error && <p className={styles.error} role="alert">{error}<button onClick={() => void load()} disabled={loading}>重新加载</button></p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
      {loading ? <p className={styles.empty} role="status">正在读取个人模板…</p> : !library ? <p className={styles.empty}>暂时无法读取模板，当前创作需求仍保留。</p> : !items.length ? <div className={styles.empty}><h3>{query.trim() ? '没有匹配的模板' : '把好用的需求留在这里'}</h3><p>{query.trim() ? '试试其他关键词，或清空搜索。' : '新建个人模板，或将创作台当前需求保存下来。'}</p>{query.trim() && <button onClick={() => setQuery('')}>清空搜索</button>}</div> : <div className={styles.list}>{items.map(item => <article key={item.id} className={styles.card}><div className={styles.cardHeading}><h3>{item.name}</h3>{'readonly' in item ? <span>内置 · 只读</span> : <small>{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</small>}</div><p>{item.prompt}</p><div className={styles.cardActions}>{'readonly' in item ? <button disabled={library.total >= library.limits.templates} onClick={() => edit(item)}>另存为个人模板</button> : <><button onClick={() => edit(item)}>编辑</button><button onClick={() => { setDeleting(item); setError(''); attempt.current = null; }}>删除</button></>}<button className={styles.use} onClick={() => use(item)}>填入需求</button></div></article>)}</div>}
      <footer className={styles.footnote}>个人模板 {library?.total || 0}/{library?.limits.templates || TEMPLATE_LIMITS.templates} · 选择只填入，不发送。清除 Cookie 后无法找回匿名空间。</footer></>}
    </div>
  </dialog>;
}
