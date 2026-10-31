"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Production vinext Link/RSC navigation is incompatible; native anchors retain synchronous draft persistence and existing leave guards. */

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Archive, Folder, MoreHorizontal, Plus, Search, Star, Tag as TagIcon, X } from "lucide-react";
import type { ManagedApp, ManagedProject, Tag, WorkspaceAction, WorkspaceSnapshot } from "@/lib/motes/types";
import "./manage.css";
import { filterApps } from "./filter-apps";
import BackupPanel from "../components/BackupPanel";
import PalettePicker from "../components/PalettePicker";
import { bulkAppAction, MAX_BULK_SELECTION, mergeBulkResult, retryFailedIds, selectVisible, type BulkOperation, type BulkResult } from './bulk-actions';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import type { HostMessageKey } from '@/lib/motes/locale';

type Editor = { kind: "app"; item: ManagedApp } | { kind: "project"; item?: ManagedProject } | { kind: "tag"; item?: Tag } | { kind: "profile" };
async function request<T>(url: string, body: object | undefined, t: (key: HostMessageKey) => string): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json().catch(() => ({ error: t('服务没有返回有效结果，请稍后重试。') })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || t('暂时无法完成，请稍后重试。'));
  return data as T;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useHostLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; const previous = document.activeElement as HTMLElement | null; el?.showModal(); return () => { el?.close(); previous?.focus(); }; }, []);
  return <dialog ref={dialog} className="manage-dialog" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }} aria-labelledby="manage-dialog-title"><div className="manage-dialog-head"><h2 id="manage-dialog-title">{title}</h2><button type="button" className="manage-icon" aria-label={t('关闭编辑')} onClick={onClose}><X size={18}/></button></div>{children}</dialog>;
}
function EditorForm({ editor, snapshot, busy, error, onSave, onCancel }: { editor: Editor; snapshot: WorkspaceSnapshot; busy: boolean; error: string; onSave: (action: WorkspaceAction) => Promise<void>; onCancel: () => void }) {
  const { t } = useHostLocale();
  const item = "item" in editor ? editor.item : undefined;
  const [name, setName] = useState(editor.kind === "profile" ? snapshot.profile.displayName : item?.name || "");
  const [description, setDescription] = useState(item && "description" in item ? item.description : "");
  const [projectId, setProjectId] = useState(editor.kind === "app" ? editor.item.projectId : "");
  const [tagIds, setTagIds] = useState<string[]>(editor.kind === "app" ? editor.item.tagIds : []);
  const [color, setColor] = useState(editor.kind === "tag" ? editor.item?.color || "#64748b" : "#64748b");
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    if (editor.kind === "app") await onSave({ action: "app.update", appId: editor.item.id, name, description, ...(projectId !== editor.item.projectId ? { projectId } : {}), tagIds });
    else if (editor.kind === "project") await onSave(editor.item ? { action: "project.update", projectId: editor.item.id, name, description } : { action: "project.create", name, description });
    else if (editor.kind === "tag") await onSave(editor.item ? { action: "tag.update", tagId: editor.item.id, name, color } : { action: "tag.create", name, color });
    else await onSave({ action: "profile.update", displayName: name });
  }
  return <form onSubmit={submit} className="manage-form"><fieldset disabled={busy}><label>{t(editor.kind === "profile" ? "显示名称" : "名称")}<input autoFocus value={name} onChange={e => setName(e.target.value)} required maxLength={editor.kind === "tag" || editor.kind === "profile" ? 40 : 80}/></label>
    {(editor.kind === "app" || editor.kind === "project") && <label>{t('描述')} <span>{t('可选')}</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={500}/></label>}
    {editor.kind === "profile" && <p className="manage-hint">{t('这是当前浏览器的测试资料，不是正式账号。修改名称不会创建登录或跨设备同步能力。')}</p>}
    {editor.kind === "app" && <><label>{t('所属项目')}<select value={projectId} onChange={e => setProjectId(e.target.value)}>{snapshot.projects.filter(p => !p.archived || p.id === projectId).map(p => <option key={p.id} value={p.id}>{p.name}{p.archived ? t("（已归档）") : ""}</option>)}</select></label><div className="manage-field-title">{t('标签')} <span>{tagIds.length}/{snapshot.limits.tagsPerApp}</span></div><div className="manage-tag-options">{snapshot.tags.length ? snapshot.tags.map(tg => <label key={tg.id}><input type="checkbox" checked={tagIds.includes(tg.id)} disabled={!tagIds.includes(tg.id) && tagIds.length >= snapshot.limits.tagsPerApp} onChange={e => setTagIds(ids => e.target.checked ? [...ids, tg.id] : ids.filter(id => id !== tg.id))}/><i style={{ background: tg.color }}/>{tg.name}</label>) : <p className="manage-hint">{t('还没有标签，可先在“标签管理”中创建。')}</p>}</div></>}
    {editor.kind === "tag" && <label>{t('标签颜色')}<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label>}
    </fieldset>{error && <p className="manage-error" role="alert">{error}</p>}<div className="manage-form-actions"><button type="button" onClick={onCancel} disabled={busy}>{t('取消')}</button><button className="manage-primary" disabled={busy || !name.trim()}>{busy ? t("正在保存…") : t("保存")}</button></div></form>;
}

export default function ManagePage() {
  const { locale, t } = useHostLocale();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const [tagId, setTagId] = useState("");
  const [archived, setArchived] = useState("active");
  const [starred, setStarred] = useState(false);
  const [sort, setSort] = useState("updated");
  const [confirmDelete, setConfirmDelete] = useState<Tag | null>(null);
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(() => new Set());
  const [batchOperation, setBatchOperation] = useState<BulkOperation | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<BulkOperation | null>(null);
  const [batchResult, setBatchResult] = useState<BulkResult | null>(null);
  const [moveTargetId, setMoveTargetId] = useState('');
  const lock = useRef(false);
  function clearBatchScope() { setSelectedAppIds(new Set()); setBatchResult(null); setConfirmBatch(null); setBatchOperation(null); setError(""); }
  async function load() {
    clearBatchScope();
    setLoading(true); setError("");
    try { await request("/api/session", undefined, t); setSnapshot(await request<WorkspaceSnapshot>("/api/workspace?archived=all", undefined, t)); }
    catch (e) { setError(e instanceof Error ? e.message : t('加载失败，请重试。')); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- Bootstrap the workspace once and keep it stable during local filter edits.
  useEffect(() => { void load(); const closeMenus = (event: KeyboardEvent) => { if (event.key === "Escape") document.querySelectorAll(".manage-app-menu[open]").forEach(menu => menu.removeAttribute("open")); }; document.addEventListener("keydown", closeMenus); return () => document.removeEventListener("keydown", closeMenus); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
  function edit(next: Editor) { setEditorError(""); setTagsOpen(false); setEditor(next); }
  async function mutate(action: WorkspaceAction, closeEditor = false) {
    if (!snapshot || lock.current) return;
    lock.current = true; setBusy(true); setError(""); setEditorError("");
    try {
      const next = await request<WorkspaceSnapshot>("/api/workspace", { ...action, workspaceId: snapshot.workspace.id }, t);
      setSnapshot(next); clearBatchScope(); setNotice(t('已保存')); if (closeEditor) setEditor(null); setConfirmDelete(null);
      if (action.action === "tag.delete" && tagId === action.tagId) setTagId("");
    } catch (e) { const message = e instanceof Error ? e.message : t('保存失败，请重试。'); if (closeEditor) setEditorError(message); else setError(message); }
    finally { lock.current = false; setBusy(false); }
  }
  function newApp(event: { preventDefault(): void }) { if (selectedProject?.archived) event.preventDefault(); }
  function openApp(app: ManagedApp) {
    try { localStorage.setItem("forma-current-project", app.id); router.push("/"); }
    catch { setError(t('无法记录应用选择，请允许此站点使用浏览器存储后重试。')); }
  }
  const apps = useMemo(() => filterApps(snapshot?.apps || [], snapshot?.projects || [], { query, projectId, tagId, starred, archived, sort }), [snapshot, query, projectId, tagId, starred, archived, sort]);
  const groups = snapshot?.projects.filter(p => (!projectId || p.id === projectId) && (projectId || apps.some(a => a.projectId === p.id))) || [];
  const selectedProject = snapshot?.projects.find(p => p.id === projectId);
  const creationProject = selectedProject || snapshot?.projects.find(p => p.isDefault);
  const createHref = "/?new=1" + (creationProject ? "&managedProjectId=" + encodeURIComponent(creationProject.id) : "");
  function resetFilters() { clearBatchScope(); setQuery(""); setProjectId(""); setTagId(""); setArchived("active"); setStarred(false); }
  const visibleSelected = apps.filter(app => selectedAppIds.has(app.id));
  function toggleAppSelection(appId:string, checked:boolean) { setError('');setBatchResult(null);setBatchOperation(null);setSelectedAppIds(current=>{const next=new Set(current);if(checked&&next.size<MAX_BULK_SELECTION)next.add(appId);else if(!checked)next.delete(appId);return next;}); }
  function selectCurrentList() { const result=selectVisible(apps.map(app=>app.id));if(result.tooMany){setError(t('当前列表有 {count} 个应用，批量操作最多选择 {limit} 个。请先筛选或手动选择。',{count:apps.length,limit:MAX_BULK_SELECTION}));return;}setSelectedAppIds(new Set(result.ids));setBatchResult(null);setError(''); }
  async function runBatch(operation:BulkOperation, ids:string[], prior:BulkResult|null=null) {
    if(!snapshot||lock.current||!ids.length)return;
    const targets=apps.filter(app=>ids.includes(app.id));
    if(targets.length!==ids.length||targets.length>MAX_BULK_SELECTION){setError(t('所选范围已变化，请重新选择当前列表中的应用。'));clearBatchScope();return;}
    lock.current=true;setBusy(true);setError('');setConfirmBatch(null);
    const succeeded:{id:string;name:string}[]=[],failed:BulkResult['failures']=[];
    try {
      for(const app of targets){
        try{const next=await request<WorkspaceSnapshot>('/api/workspace',bulkAppAction(snapshot.workspace.id,app.id,operation),t);setSnapshot(next);succeeded.push({id:app.id,name:app.name});}
        catch(cause){failed.push({id:app.id,name:app.name,error:cause instanceof Error?cause.message:t('保存失败，请重试。')});}
      }
      const result=mergeBulkResult(prior,succeeded,failed);setBatchOperation(operation);setBatchResult(result);setSelectedAppIds(new Set(failed.map(item=>item.id)));
      setNotice(failed.length?t('批量操作累计成功 {successes} 项，{failures} 项失败。只会重试失败项。',{successes:result.successes.length,failures:result.failures.length}):t('已逐项完成，累计成功 {successes} 项。',{successes:result.successes.length}));
    } finally {lock.current=false;setBusy(false);}
  }
  function askBatch(operation:BulkOperation) { if(!visibleSelected.length||visibleSelected.length>MAX_BULK_SELECTION)return;if(batchOperation&&JSON.stringify(batchOperation)!==JSON.stringify(operation))setBatchResult(null);setBatchOperation(operation);setConfirmBatch(operation); }
  function askRetryFailures() { if(!batchResult||!batchOperation)return;setSelectedAppIds(new Set(retryFailedIds(batchResult)));setConfirmBatch(batchOperation); }
  function describeBatch(operation:BulkOperation) { if(operation.kind==='move')return t('移动到「{project}」',{project:snapshot?.projects.find(project=>project.id===operation.projectId)?.name||t('所选项目')});if(operation.kind==='starred')return t(operation.value?'收藏':'取消收藏');return t(operation.value?'归档':'恢复归档'); }
  function describeBatchScope() { return [projectId?snapshot?.projects.find(p=>p.id===projectId)?.name:t('所有项目'),archived==='active'?t('未归档'):archived==='archived'?t('已归档'):t('全部归档状态'),tagId?snapshot?.tags.find(tag=>tag.id===tagId)?.name:t('全部标签'),starred?t('仅收藏应用'):t('全部收藏状态'),query.trim()?t('搜索“{query}”',{query:query.trim()}):'' ].filter(Boolean).join(' · '); }
  return <main className="manage-shell">
    <header className="manage-top"><a href="/" className="manage-back"><ArrowLeft size={16}/>{t('回到创作')}</a><a href="/" className="manage-wordmark">motes<span>.</span></a><span className="manage-test-badge">{t('测试模式')}</span><span className="manage-palette-slot"><PalettePicker/></span></header>
    <div className="manage-layout"><aside className="manage-sidebar"><div className="manage-space"><span className="manage-avatar">{snapshot?.profile.displayName.slice(0, 1) || "M"}</span><div><strong>{snapshot?.profile.displayName || t('工作空间')}</strong><small>{t('当前浏览器的独立测试空间')}</small></div></div><button className="manage-profile-edit" disabled={!snapshot || busy} onClick={() => edit({ kind: "profile" })}>{t('编辑测试资料')}</button>
      <div className="manage-nav-head"><span>{t('项目')}</span><button className="manage-icon" aria-label={t('新建项目')} disabled={!snapshot || busy || snapshot.projects.length >= snapshot.limits.projects} onClick={() => edit({ kind: "project" })}><Plus size={17}/></button></div>
      <nav aria-label={t('项目筛选')}><button disabled={busy} className={!projectId ? "selected" : ""} onClick={() => {clearBatchScope();setProjectId("");}}><Folder size={16}/>{t('全部项目')}<span>{snapshot ? snapshot.apps.length : '—'}</span></button>{snapshot?.projects.filter(p => !p.archived).map(p => <button disabled={busy} className={projectId === p.id ? "selected" : ""} key={p.id} onClick={() => {clearBatchScope();setProjectId(p.id);}}><Folder size={16}/><span className="manage-nav-name">{p.name}</span><span>{p.appCount}</span></button>)}
      {!!snapshot?.projects.some(p => p.archived) && <details className="manage-archived-projects"><summary>{t('已归档项目')}</summary>{snapshot.projects.filter(p => p.archived).map(p => <button disabled={busy} key={p.id} className={projectId === p.id ? "selected" : ""} onClick={() => { clearBatchScope();setProjectId(p.id); setArchived("all"); }}><Archive size={15}/><span className="manage-nav-name">{p.name}</span><span>{p.appCount}</span></button>)}</details>}</nav>
      <button className="manage-tags-link" disabled={!snapshot || busy} onClick={() => { setError(""); setTagsOpen(true); }}><TagIcon size={16}/>{t('标签管理')}<span>{snapshot ? snapshot.tags.length : '—'}</span></button><p className="manage-identity-note">{t('无需登录。清除 Cookie 或更换设备后，无法找回当前测试身份；显示名称不用于身份认证。')}</p>
      <button className="manage-tags-link" disabled={!snapshot||busy} onClick={()=>setBackupOpen(true)}>{t('JSON 备份与导入')}</button><a className="manage-tags-link" href="/compare">{t('高级 · 多方案比较')}</a></aside><section className="manage-content" aria-busy={loading||busy}>
      <div className="manage-heading"><div><p className="manage-eyebrow">{t('你的创作空间')}</p><h1>{selectedProject?.name || t('应用管理')}</h1><p>{selectedProject?.description || t('整理灵感，让每个应用各得其所。')}</p></div><a href={createHref} onClick={newApp} aria-disabled={selectedProject?.archived || undefined} title={selectedProject?.archived ? t('请先恢复项目再创建应用') : undefined} className="manage-primary manage-create"><Plus size={16}/>{t('创建应用')}</a></div>
      {selectedProject && <div className="manage-project-tools"><span>{selectedProject.archived ? t('已归档项目 · 应用仍可查看和移动') : selectedProject.isDefault ? t('默认项目') : t('项目')}</span><button disabled={busy} onClick={() => edit({ kind: "project", item: selectedProject })}>{t('编辑项目')}</button><button disabled={busy} onClick={() => void mutate({ action: "project.update", projectId: selectedProject.id, starred: !selectedProject.starred })}>{t(selectedProject.starred ? "取消收藏项目" : "收藏项目")}</button><button disabled={busy || selectedProject.isDefault} title={selectedProject.isDefault ? t("默认项目不能归档") : t("归档不删除应用")} onClick={() => void mutate({ action: "project.update", projectId: selectedProject.id, archived: !selectedProject.archived })}>{t(selectedProject.archived ? "恢复项目" : "归档项目")}</button></div>}
      <div className="manage-filters"><label className="manage-search"><Search size={17}/><input disabled={busy} aria-label={t('搜索应用名称或描述')} placeholder={t('搜索应用…')} value={query} onChange={e => {clearBatchScope();setQuery(e.target.value);}}/></label><select disabled={busy} aria-label={t('按标签筛选')} value={tagId} onChange={e => {clearBatchScope();setTagId(e.target.value);}}><option value="">{t('全部标签')}</option>{snapshot?.tags.map(tg => <option key={tg.id} value={tg.id}>{tg.name}</option>)}</select><select disabled={busy} aria-label={t('按归档状态筛选')} value={archived} onChange={e => {clearBatchScope();setArchived(e.target.value);}}><option value="active">{t('未归档应用')}</option><option value="archived">{t('已归档应用')}</option><option value="all">{t('全部状态')}</option></select><select disabled={busy} aria-label={t('排序方式')} value={sort} onChange={e => {clearBatchScope();setSort(e.target.value);}}><option value="updated">{t('最近更新')}</option><option value="created">{t('最近创建')}</option><option value="name">{t('名称排序')}</option></select><button disabled={busy} className={`manage-star-filter ${starred ? "selected" : ""}`} aria-pressed={starred} onClick={() => {clearBatchScope();setStarred(!starred);}}><Star size={15} fill={starred ? "currentColor" : "none"}/>{t('收藏')}</button></div>
      {error && <div className="manage-error" role="alert">{error}<button disabled={busy || loading} onClick={() => void load()}>{t('重新加载')}</button></div>}
      {notice && <p className="manage-notice" role="status">{notice}</p>}
      {loading ? <div className="manage-empty" role="status"><div className="manage-loading"/><h2>{t('正在整理你的空间…')}</h2><p>{t('读取项目、应用和标签')}</p></div> : !snapshot ? <div className="manage-empty"><h2>{t('暂时无法打开工作空间')}</h2><p>{t('你的已有作品不会因此被修改，请重新加载。')}</p><button onClick={() => void load()}>{t('重新加载')}</button></div> : !apps.length ? <div className="manage-empty"><Folder size={30}/><h2>{t(snapshot.apps.length ? '没有符合条件的应用' : '让第一个想法开始生长')}</h2><p>{t(snapshot.apps.length ? '试试其他筛选条件，或清空搜索。' : '先在创作台生成应用，回来后即可按项目和标签整理。')}</p>{snapshot.apps.length ? <button onClick={resetFilters}>{t('重置筛选')}</button> : <a className="manage-primary" href={createHref} onClick={newApp} aria-disabled={selectedProject?.archived || undefined} title={selectedProject?.archived ? t('请先恢复项目再创建应用') : undefined}>{t('去创建应用')}<ArrowUpRight size={15}/></a>}</div> : <><p className="manage-result-count">{t('{count} 个应用',{count:apps.length})}<span>{t('选择项目后创建，新应用会直接保存到该项目。')}</span></p>
        <section className="manage-bulk" aria-label={t('批量整理应用')}><div className="manage-bulk-select"><strong>{t('已选择 {selected}/{limit}',{selected:visibleSelected.length,limit:MAX_BULK_SELECTION})}</strong><button type="button" disabled={busy||!apps.length||apps.length>MAX_BULK_SELECTION} title={apps.length>MAX_BULK_SELECTION?t('当前列表超过{limit}项，请筛选或手动选择。',{limit:MAX_BULK_SELECTION}):undefined} onClick={selectCurrentList}>{t('全选当前列表')}</button><button type="button" disabled={busy||!selectedAppIds.size} onClick={clearBatchScope}>{t('清除选择')}</button>{apps.length>MAX_BULK_SELECTION&&<small>{t('列表有 {count} 项；批量最多 {limit} 项，请筛选或手动选择。',{count:apps.length,limit:MAX_BULK_SELECTION})}</small>}</div><details className="manage-bulk-tools"><summary>{t('批量整理')}</summary><div className="manage-bulk-actions"><button type="button" disabled={busy||!visibleSelected.length} onClick={()=>askBatch({kind:'starred',value:true})}>{t('收藏所选')}</button><button type="button" disabled={busy||!visibleSelected.length} onClick={()=>askBatch({kind:'starred',value:false})}>{t('取消收藏')}</button><button type="button" disabled={busy||!visibleSelected.length} onClick={()=>askBatch({kind:'archived',value:true})}>{t('归档所选')}</button><button type="button" disabled={busy||!visibleSelected.length} onClick={()=>askBatch({kind:'archived',value:false})}>{t('恢复所选')}</button><label>{t('移动到')}<select value={moveTargetId} disabled={busy} onChange={e=>setMoveTargetId(e.target.value)}><option value="">{t('选择项目…')}</option>{snapshot.projects.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" disabled={busy||!visibleSelected.length||!moveTargetId} onClick={()=>askBatch({kind:'move',projectId:moveTargetId})}>{t('移动所选')}</button></div><p>{t('操作会逐项保存，不是全有或全无；失败项可单独重试。归档应用可恢复。')}</p></details></section>
        {batchResult&&<section className="manage-bulk-result" aria-live="polite"><strong>{t('批量结果：成功 {successes} 项，失败 {failures} 项',{successes:batchResult.successes.length,failures:batchResult.failures.length})}</strong>{batchResult.successes.length>0&&<p>{t('已完成：')}{batchResult.successes.map(item=>item.name).join('、')}</p>}{batchResult.failures.map(item=><p className="manage-bulk-failure" key={item.id}>{item.name}：{item.error}</p>)}{batchResult.failures.length>0&&<button type="button" disabled={busy} onClick={askRetryFailures}>{t('仅重试失败项（{count}）',{count:batchResult.failures.length})}</button>}</section>}
        {groups.map(group => <section className="manage-group" key={group.id}><div className="manage-group-heading"><h2><Folder size={17}/>{group.name}{group.archived && <small>{t("项目已归档")}</small>}{group.starred && <Star size={13} fill="currentColor"/>}</h2><span>{apps.filter(a => a.projectId === group.id).length}</span></div><div className="manage-grid">{apps.filter(a => a.projectId === group.id).map(app => <article className="manage-card" key={app.id}><div className="manage-card-top"><span className="manage-app-icon">M</span><label className="manage-bulk-checkbox"><input type="checkbox" checked={selectedAppIds.has(app.id)} disabled={busy||(!selectedAppIds.has(app.id)&&visibleSelected.length>=MAX_BULK_SELECTION)} onChange={e=>toggleAppSelection(app.id,e.target.checked)} aria-label={t("选择{app}",{app:app.name})}/><span>{t("选择")}</span></label><button className="manage-icon" disabled={busy} aria-label={t(app.starred ? "取消收藏{app}" : "收藏{app}",{app:app.name})} aria-pressed={app.starred} onClick={() => void mutate({ action: "app.update", appId: app.id, starred: !app.starred })}><Star size={17} fill={app.starred ? "currentColor" : "none"}/></button></div><button className="manage-app-title" disabled={busy} onClick={() => openApp(app)}>{app.name}<ArrowUpRight size={15}/></button><p className="manage-card-description">{app.description || t("一个等待继续打磨的想法。")}</p><div className="manage-card-tags">{app.archived && <span className="manage-archive-label">{t("已归档")}</span>}{app.tagIds.map(id => snapshot.tags.find(t => t.id === id)).filter((t): t is Tag => !!t).map(t => <span key={t.id}><i style={{ background: t.color }}/>{t.name}</span>)}</div><div className="manage-card-bottom"><time dateTime={app.updatedAt}>{new Date(app.updatedAt).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN")} {t("更新")}</time><details className="manage-app-menu"><summary aria-label={t("{app}的更多操作",{app:app.name})}><MoreHorizontal size={19}/></summary><div><button disabled={busy} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); edit({ kind: "app", item: app }); }} >{t("编辑与移动")}</button><button disabled={busy} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); void mutate({ action: "app.update", appId: app.id, archived: !app.archived }); }}>{t(app.archived ? "恢复应用" : "归档应用")}</button></div></details></div></article>)}</div></section>)}</>}
    </section></div>
    {snapshot && editor && <Modal title={t(editor.kind === "profile" ? "编辑测试资料" : editor.kind === "app" ? "编辑应用" : editor.kind === "project" ? editor.item ? "编辑项目" : "新建项目" : editor.item ? "编辑标签" : "新建标签")} onClose={() => { if (!busy) setEditor(null); }}><EditorForm editor={editor} snapshot={snapshot} busy={busy} error={editorError} onSave={action => mutate(action, true)} onCancel={() => setEditor(null)}/></Modal>}
    {snapshot && tagsOpen && <Modal title={t("标签管理")} onClose={() => { if (!busy) setTagsOpen(false); }}><div className="manage-tag-manager"><p className="manage-hint" >{t("标签可跨项目使用。删除标签会移除应用上的关联，应用本身保留。")}</p>{error && <p className="manage-error" role="alert">{error}</p>}{snapshot.tags.length ? snapshot.tags.map(tag => <div className="manage-tag-row" key={tag.id}><i style={{ background: tag.color }}/><span>{tag.name}</span><button disabled={busy} onClick={() => edit({ kind: "tag", item: tag })} >{t("编辑")}</button><button disabled={busy} onClick={() => setConfirmDelete(tag)} >{t("删除")}</button></div>) : <p className="manage-hint" >{t("还没有标签，创建一个用于整理应用。")}</p>}<button className="manage-primary" disabled={busy || snapshot.tags.length >= snapshot.limits.tags} onClick={() => edit({ kind: "tag" })}><Plus size={15}/>{t("新建标签")}</button><small className="manage-hint">{t("{count}/{limit} 个标签",{count:snapshot.tags.length,limit:snapshot.limits.tags})}</small></div></Modal>}
    {confirmDelete && <Modal title={t("删除标签")} onClose={() => { if (!busy) setConfirmDelete(null); }}><div className="manage-tag-manager"><p>{t("删除“{tag}”？所有应用上的此标签都会移除，应用和版本保留。",{tag:confirmDelete.name})}</p>{error && <p className="manage-error" role="alert">{error}</p>}<div className="manage-form-actions"><button disabled={busy} onClick={() => setConfirmDelete(null)}>{t("取消")}</button><button className="manage-danger" disabled={busy} onClick={() => void mutate({ action: "tag.delete", tagId: confirmDelete.id })}>{busy ? t("删除中…") : t("删除标签")}</button></div></div></Modal>}
    {confirmBatch&&snapshot&&<Modal title={t("确认批量整理")} onClose={()=>{if(!busy)setConfirmBatch(null);}}><div className="manage-tag-manager"><p >{t("范围：{scope}。将对选中的 {count} 个应用逐项执行“{action}”。每项单独保存；部分失败时仅保留失败项供重试，已成功项不会重复提交。",{scope:describeBatchScope(),count:visibleSelected.length,action:describeBatch(confirmBatch)})}</p>{confirmBatch.kind==='archived'&&<p className="manage-hint" >{t("归档会隐藏应用但保留其内容和版本；之后可在“已归档应用”筛选中恢复。")}</p>}<div className="manage-form-actions"><button type="button" disabled={busy} onClick={()=>setConfirmBatch(null)}>{t("取消")}</button><button type="button" className="manage-primary" disabled={busy||!visibleSelected.length} onClick={()=>void runBatch(confirmBatch,[...selectedAppIds],batchResult)} >{t("确认并逐项保存")}</button></div></div></Modal>}
    {snapshot && backupOpen && <BackupPanel snapshot={snapshot} onClose={()=>setBackupOpen(false)} onImported={result=>{clearBatchScope();setQuery("");setTagId("");setStarred(false);setProjectId(result.projectId);setArchived("all");setMoveTargetId("");void load();}}/>}
  </main>;
}
