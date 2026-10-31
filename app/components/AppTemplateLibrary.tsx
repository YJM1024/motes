'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hostText, useHostLocale } from '@/app/components/HostLocaleProvider';
import type { HostMessageKey } from '@/lib/motes/locale';
import type { Project } from '@/lib/forma/types';
import type { ManagedProject, WorkspaceSnapshot } from '@/lib/motes/types';
import { appTemplateRequestFingerprint, stableAppTemplateRequestId, type AppTemplateRequest } from '@/lib/motes/app-template-library';
import { PREVIEW_POLICY, safeDocument } from '@/lib/motes/preview-document';
import styles from './AppTemplateLibrary.module.css';

type AppTemplate = { id: string; name: string; description: string; sourceAppId: string; sourceVersionId: string; createdAt: string; updatedAt: string };
type TemplateDetail = AppTemplate & { html: string };
type LibrarySnapshot = { workspaceId: string; templates: AppTemplate[]; limit: number };
type MutationResult = LibrarySnapshot & { completed: true; templateId: string };
type Props = { project: Project | null; shared: boolean; onClose: () => void; onCopied: (project: Project) => void };

const fixedErrorKeys: Record<string, HostMessageKey> = {
  '请求来源无效，请返回本站重试。': '请求来源无效，请返回本站重试。',
  '服务暂时没有返回有效结果；原操作是否完成尚未确认。': '服务暂时没有返回有效结果；原操作是否完成尚未确认。',
  '模板库暂时无法读取。': '模板库暂时无法读取。',
  '模板详情暂时无法读取。': '模板详情暂时无法读取。',
  '无法读取目标项目。': '无法读取目标项目。',
  '服务返回的模板列表格式无效；原操作是否完成尚未确认。': '服务返回的模板列表格式无效；原操作是否完成尚未确认。',
  '操作未完成。': '操作未完成。',
  '服务未确认复制完成；可使用相同请求重试核对。': '服务未确认复制完成；可使用相同请求重试核对。',
  '复制未完成。': '复制未完成。',
};
function errorText(cause: unknown, fallback: HostMessageKey) {
  const message = cause instanceof Error ? cause.message : '';
  return message ? (fixedErrorKeys[message] ? hostText(fixedErrorKeys[message]) : message) : hostText(fallback);
}

async function request<T>(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const method = body ? 'POST' : 'GET';
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Origin: window.location.origin } : undefined,
    ...(body ? { body: JSON.stringify(body) } : { cache: 'no-store' as const }),
    signal,
  });
  const raw = await response.text();
  let data: T & { error?: string };
  try { data = JSON.parse(raw) as T & { error?: string }; }
  catch { throw new Error(response.status === 403 ? hostText('请求来源无效，请返回本站重试。') : hostText('服务暂时没有返回有效结果；原操作是否完成尚未确认。')); }
  if (!response.ok) throw new Error(data.error || hostText('操作未完成（{status}）。', { status: response.status }));
  return data;
}

export default function AppTemplateLibrary({ project, shared, onClose, onCopied }: Props) {
  const { t, locale } = useHostLocale();
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null), requestRef = useRef<AppTemplateRequest | null>(null), inFlight = useRef(false);
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TemplateDetail | null>(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState(''), [detailReload, setDetailReload] = useState(0);
  const [name, setName] = useState(project?.title ?? ''), [description, setDescription] = useState(''), [editing, setEditing] = useState(false), [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(''), [feedback, setFeedback] = useState('');
  const [copyOpen, setCopyOpen] = useState(false), [projects, setProjects] = useState<ManagedProject[]>([]), [defaultProjectId, setDefaultProjectId] = useState(''), [targetProjectId, setTargetProjectId] = useState(''), [projectsLoading, setProjectsLoading] = useState(false), [projectError, setProjectError] = useState('');
  const currentVersion = project?.versions.find(version => version.id === project.currentVersionId) || null;
  const selected = library?.templates.find(template => template.id === selectedId) || null;
  const visibleTemplates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (library?.templates || []).filter(template => !needle || `${template.name} ${template.description}`.toLocaleLowerCase().includes(needle));
  }, [library, query]);
  const detailHtml = detail?.html || '';
  const srcDoc = useMemo(() => typeof window === 'undefined' || !detailHtml ? '' : safeDocument(detailHtml, PREVIEW_POLICY), [detailHtml]);

  useEffect(() => {
    const element = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); closeButton.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  const loadLibrary = useCallback(async (signal?: AbortSignal, refresh = false) => {
    if (refresh) { setLoading(true); setError(''); }
    try { setLibrary(await request<LibrarySnapshot>('/api/app-templates', undefined, signal)); }
    catch (cause) { if (!signal?.aborted) setError(errorText(cause, '模板库暂时无法读取。')); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => { if (!controller.signal.aborted) return loadLibrary(controller.signal); }); return () => controller.abort(); }, [loadLibrary]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void request<{ template: TemplateDetail }>(`/api/app-templates/${encodeURIComponent(selectedId)}`, undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setDetail(value.template); setName(value.template.name); setDescription(value.template.description); setEditing(false); setDeleting(false); setCopyOpen(false); setFeedback(''); } })
      .catch(cause => { if (!controller.signal.aborted) setDetailError(errorText(cause, '模板详情暂时无法读取。')); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, detailReload]);

  function selectTemplate(id: string | null) {
    setSelectedId(id); setDetail(null); setDetailError(''); setDetailLoading(!!id); setEditing(false); setDeleting(false); setCopyOpen(false); setFeedback('');
  }

  async function loadProjects() {
    if (projects.length || projectsLoading) return;
    setProjectsLoading(true); setProjectError('');
    try {
      const snapshot = await request<WorkspaceSnapshot>('/api/workspace?listOnly=true');
      const available = snapshot.projects.filter(item => !item.archived);
      setProjects(available); setDefaultProjectId(snapshot.workspace.defaultProjectId);
      setTargetProjectId(current => available.some(item => item.id === current) ? current : snapshot.workspace.defaultProjectId);
    } catch (cause) { setProjectError(errorText(cause, '无法读取目标项目。')); }
    finally { setProjectsLoading(false); }
  }

  function beginMutation(path: string, body: Record<string, unknown>) {
    const fingerprint = appTemplateRequestFingerprint(path, body);
    const attempt = stableAppTemplateRequestId(requestRef.current, fingerprint, () => crypto.randomUUID());
    requestRef.current = attempt;
    return { ...body, requestId: attempt.requestId };
  }
  function completeMutation(path: string, body: Record<string, unknown>) {
    const fingerprint = appTemplateRequestFingerprint(path, body);
    if (requestRef.current?.fingerprint === fingerprint) requestRef.current = null;
  }
  function installSnapshot(value: MutationResult) {
    if (!Array.isArray(value.templates) || typeof value.workspaceId !== 'string' || typeof value.limit !== 'number') throw new Error(hostText('服务返回的模板列表格式无效；原操作是否完成尚未确认。'));
    setLibrary({ workspaceId: value.workspaceId, templates: value.templates, limit: value.limit });
  }

  async function mutateLibrary(action: 'create' | 'update' | 'delete', body: Record<string, unknown>) {
    if (inFlight.current) return;
    const path = '/api/app-templates', stableBody = { action, ...body };
    inFlight.current = true; setBusy(action); setError(''); setFeedback('');
    const payload = beginMutation(path, stableBody);
    try {
      const value = await request<MutationResult>(path, payload);
      installSnapshot(value); completeMutation(path, stableBody);
      setFeedback(action === 'delete' ? t('模板已删除。') : action === 'create' ? t('当前已保存版本已另存为模板。') : t('模板信息已更新。'));
      if (action === 'delete') { selectTemplate(null); setFeedback(t('模板已删除。')); }
      else if (action === 'create') selectTemplate(value.templateId);
      else if (detail) setDetail({ ...detail, name: String(body.name), description: String(body.description) });
    } catch (cause) {
      setError(`${errorText(cause, '操作未完成。')} ${t('可点击相同操作重试同一请求；修改表单后会作为新操作提交。')}`);
    } finally { inFlight.current = false; setBusy(''); }
  }

  async function copyTemplate() {
    if (!selectedId || !targetProjectId || inFlight.current) return;
    const path = `/api/app-templates/${encodeURIComponent(selectedId)}/copy`, body = { managedProjectId: targetProjectId };
    inFlight.current = true; setBusy('copy'); setError(''); setFeedback('');
    const payload = beginMutation(path, body);
    try {
      const value = await request<{ project: Project; copied: true }>(path, payload);
      if (!value.project?.id || !value.copied) throw new Error(hostText('服务未确认复制完成；可使用相同请求重试核对。'));
      completeMutation(path, body); setFeedback(t('已复制为独立应用；未调用模型。')); onCopied(value.project); onClose();
    } catch (cause) { setError(`${errorText(cause, '复制未完成。')} ${t('可在目标项目不变时重试同一请求；切换项目会作为新操作提交。')}`); }
    finally { inFlight.current = false; setBusy(''); }
  }

  function close() { if (inFlight.current) return; onClose(); }
  const currentSaveBody = { name: name.trim(), description: description.trim(), sourceAppId: project?.id, sourceVersionId: currentVersion?.id };
  const sourceVersion = project && detail?.sourceAppId === project.id ? project.versions.find(version => version.id === detail.sourceVersionId) : undefined;

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="app-template-library-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.header}><div><h2 id="app-template-library-title">{t('应用模板库')}</h2><p>{t('模板保存的是已保存版本的 HTML 快照，不包含运行时输入。')}</p></div><button ref={closeButton} type="button" onClick={close} disabled={!!busy} aria-label={t('关闭应用模板库')}>{t('关闭')}</button></header>
    <div className={styles.body}>
      {project && <form className={styles.saveForm} onSubmit={event => { event.preventDefault(); if (currentVersion && currentSaveBody.sourceAppId && currentSaveBody.sourceVersionId && currentSaveBody.name) void mutateLibrary('create', currentSaveBody); }}>
        <div><strong>{t('保存当前已保存版本为模板')}</strong><p>{t('来源：')}{project.title} · v{currentVersion?.number ?? '—'}。{t('预览中的临时输入不会被保存。')}</p></div>
        <label>{t('模板名称')}<input value={name} onChange={event => setName(event.target.value)} disabled={!currentVersion || !!busy} required /></label>
        <label>{t('说明（可选）')}<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} disabled={!currentVersion || !!busy} /></label>
        <button type="submit" className={styles.primary} disabled={!currentVersion || !name.trim() || !!busy}>{busy === 'create' ? t('正在保存…') : t('保存为模板')}</button>
        {!currentVersion && <p className={styles.hint}>{t('当前应用没有可保存的已存版本。')}</p>}
      </form>}
      <div className={styles.libraryLayout}>
        <section className={styles.listPane} aria-label={t('模板列表')}>
          <div className={styles.listHeading}><div><h3>{t('已保存模板')}</h3><small>{library ? `${library.templates.length}/${library.limit}` : t('读取中')}</small></div><button type="button" onClick={() => void loadLibrary(undefined, true)} disabled={loading || !!busy}>{t('刷新')}</button></div>
          <label className={styles.search}>{t('搜索模板')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('名称或说明')} /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {feedback && <p className={styles.notice} role="status">{feedback}</p>}
          {loading ? <p className={styles.empty} role="status">{t('正在读取模板库…')}</p> : !library ? <div className={styles.empty}><p>{t('模板库暂不可用；没有显示示例数据。')}</p><button type="button" onClick={() => void loadLibrary(undefined, true)}>{t('重新读取')}</button></div> : !visibleTemplates.length ? <div className={styles.empty}><p>{query.trim() ? t('没有匹配的模板。') : t('还没有已保存的应用模板。')}</p></div> : <ul className={styles.templateList}>{visibleTemplates.map(template => <li key={template.id}><button type="button" className={selectedId === template.id ? styles.selected : ''} onClick={() => selectTemplate(template.id)} aria-pressed={selectedId === template.id}><strong>{template.name}</strong><span>{template.description || t('暂无说明')}</span><small>{t('已保存快照')} · {new Date(template.updatedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN')}</small></button></li>)}</ul>}
        </section>
        <section className={styles.detailPane} aria-label={t('模板详情')}>
          {!selectedId ? <div className={styles.empty}><p>{t('选择一个模板查看隔离预览、修改信息或复制到项目。')}</p></div> : detailLoading ? <p className={styles.empty} role="status">{t('正在读取模板和已保存 HTML…')}</p> : detailError ? <div className={styles.empty}><p className={styles.error} role="alert">{detailError}</p><button type="button" onClick={() => { setDetailLoading(true); setDetailError(''); setDetailReload(value => value + 1); }}>{t('重试读取详情')}</button></div> : detail && selected ? <>
            <div className={styles.detailHeading}><div><h3>{selected.name}</h3><p>{selected.description || t('暂无说明')}</p></div><span>{t('独立快照')}</span></div>
            <dl className={styles.source}><div><dt>{t('来源应用')}</dt><dd>{project?.id === detail.sourceAppId ? project.title : t('其他来源应用')}</dd></div><div><dt>{t('来源版本')}</dt><dd>{sourceVersion ? `v${sourceVersion.number}${sourceVersion.name ? ` · ${sourceVersion.name}` : ''}` : t('版本详情不可用')}</dd></div></dl>
            <details className={styles.sourceIds}><summary>{t('查看内部来源编号')}</summary><dl><div><dt>{t('来源应用编号')}</dt><dd>{detail.sourceAppId}</dd></div><div><dt>{t('来源版本编号')}</dt><dd>{detail.sourceVersionId}</dd></div></dl></details>
            <p className={styles.note}>{t(shared ? '模板内容固定于来源版本。复制会创建公共演示应用，所有访客可见和修改；不会带入原应用的讨论、分享链接、应用设置或预览运行时输入。' : '模板内容固定于来源版本。复制会创建独立私有应用；不会带入原应用的讨论、分享链接、应用设置或预览运行时输入。')}</p>
            <div className={styles.preview}><div className={styles.previewTitle}>{t('隔离预览')}</div><iframe title={t('模板“{name}”的隔离预览', { name: detail.name })} srcDoc={srcDoc} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" /></div>
            <div className={styles.detailActions}><button type="button" onClick={() => { setEditing(value => !value); setDeleting(false); setCopyOpen(false); setName(selected.name); setDescription(selected.description); }} disabled={!!busy}>{t('修改名称和说明')}</button><button type="button" onClick={() => { setCopyOpen(value => !value); setEditing(false); setDeleting(false); if (!copyOpen) void loadProjects(); }} disabled={!!busy}>{t('复制为新应用')}</button><button type="button" className={styles.deleteAction} onClick={() => { setDeleting(true); setEditing(false); setCopyOpen(false); }} disabled={!!busy}>{t('删除模板')}</button></div>
            {editing && <form className={styles.editForm} onSubmit={event => { event.preventDefault(); if (name.trim()) void mutateLibrary('update', { id: selected.id, name: name.trim(), description: description.trim() }); }}><label>{t('模板名称')}<input value={name} onChange={event => setName(event.target.value)} required disabled={!!busy} /></label><label>{t('说明')}<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} disabled={!!busy} /></label><div><button type="button" onClick={() => setEditing(false)} disabled={!!busy}>{t('取消')}</button><button type="submit" className={styles.primary} disabled={!name.trim() || !!busy}>{busy === 'update' ? t('正在保存…') : t('保存修改')}</button></div></form>}
            {deleting && <div className={styles.confirm} role="alertdialog" aria-labelledby="delete-template-title"><strong id="delete-template-title">{t('确认删除“{name}”？', { name: selected.name })}</strong><p>{t('删除只移除模板，不影响由它复制的独立应用和版本。')}</p><div><button type="button" onClick={() => setDeleting(false)} disabled={!!busy}>{t('取消')}</button><button type="button" className={styles.deleteAction} onClick={() => void mutateLibrary('delete', { id: selected.id })} disabled={!!busy}>{busy === 'delete' ? t('正在删除…') : t('确认删除')}</button></div></div>}
            {copyOpen && <div className={styles.copyForm}><strong>{t('选择目标项目')}</strong><p>{t('新应用使用此模板的快照作为起点。原应用和模板都不会被修改。')}</p>{projectsLoading ? <p role="status">{t('正在读取项目…')}</p> : projectError ? <p className={styles.error} role="alert">{projectError}<button type="button" onClick={() => void loadProjects()}>{t('重试读取项目')}</button></p> : !projects.length ? <p className={styles.hint}>{t('没有可用的未归档项目。')}</p> : <><label>{t('目标项目')}<select value={targetProjectId} onChange={event => setTargetProjectId(event.target.value)} disabled={!!busy}>{projects.map(item => <option key={item.id} value={item.id}>{item.name}{item.id === defaultProjectId ? ` · ${t('默认')}` : ''}</option>)}</select></label><button type="button" className={styles.primary} onClick={() => void copyTemplate()} disabled={!targetProjectId || !!busy}>{busy === 'copy' ? t('正在复制…') : t('复制为独立应用')}</button></>}</div>}
            {feedback && <p className={styles.notice} role="status">{feedback}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </> : null}
        </section>
      </div>
      <p className={styles.footnote}>{t('创建、修改和复制仅使用已保存的 HTML 与模板元数据；不会调用模型。')}</p>
    </div>
  </dialog>;
}
