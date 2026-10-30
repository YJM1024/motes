"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Archive, Folder, MoreHorizontal, Plus, Search, Star, Tag as TagIcon, X } from "lucide-react";
import type { ManagedApp, ManagedProject, Tag, WorkspaceAction, WorkspaceSnapshot } from "@/lib/motes/types";
import "./manage.css";
import { filterApps } from "./filter-apps";
import BackupPanel from "../components/BackupPanel";

type Editor = { kind: "app"; item: ManagedApp } | { kind: "project"; item?: ManagedProject } | { kind: "tag"; item?: Tag } | { kind: "profile" };
async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json().catch(() => ({ error: "服务没有返回有效结果，请稍后重试。" })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "暂时无法完成，请稍后重试。");
  return data as T;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; const previous = document.activeElement as HTMLElement | null; el?.showModal(); return () => { el?.close(); previous?.focus(); }; }, []);
  return <dialog ref={dialog} className="manage-dialog" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }} aria-labelledby="manage-dialog-title"><div className="manage-dialog-head"><h2 id="manage-dialog-title">{title}</h2><button type="button" className="manage-icon" aria-label="关闭编辑" onClick={onClose}><X size={18}/></button></div>{children}</dialog>;
}
function EditorForm({ editor, snapshot, busy, error, onSave, onCancel }: { editor: Editor; snapshot: WorkspaceSnapshot; busy: boolean; error: string; onSave: (action: WorkspaceAction) => Promise<void>; onCancel: () => void }) {
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
  return <form onSubmit={submit} className="manage-form"><fieldset disabled={busy}><label>{editor.kind === "profile" ? "显示名称" : "名称"}<input autoFocus value={name} onChange={e => setName(e.target.value)} required maxLength={editor.kind === "tag" || editor.kind === "profile" ? 40 : 80}/></label>
    {(editor.kind === "app" || editor.kind === "project") && <label>描述 <span>可选</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={500}/></label>}
    {editor.kind === "profile" && <p className="manage-hint">这是当前浏览器的测试资料，不是正式账号。修改名称不会创建登录或跨设备同步能力。</p>}
    {editor.kind === "app" && <><label>所属项目<select value={projectId} onChange={e => setProjectId(e.target.value)}>{snapshot.projects.filter(p => !p.archived || p.id === projectId).map(p => <option key={p.id} value={p.id}>{p.name}{p.archived ? "（已归档）" : ""}</option>)}</select></label><div className="manage-field-title">标签 <span>{tagIds.length}/{snapshot.limits.tagsPerApp}</span></div><div className="manage-tag-options">{snapshot.tags.length ? snapshot.tags.map(t => <label key={t.id}><input type="checkbox" checked={tagIds.includes(t.id)} disabled={!tagIds.includes(t.id) && tagIds.length >= snapshot.limits.tagsPerApp} onChange={e => setTagIds(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))}/><i style={{ background: t.color }}/>{t.name}</label>) : <p className="manage-hint">还没有标签，可先在“标签管理”中创建。</p>}</div></>}
    {editor.kind === "tag" && <label>标签颜色<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label>}
    </fieldset>{error && <p className="manage-error" role="alert">{error}</p>}<div className="manage-form-actions"><button type="button" onClick={onCancel} disabled={busy}>取消</button><button className="manage-primary" disabled={busy || !name.trim()}>{busy ? "正在保存…" : "保存"}</button></div></form>;
}

export default function ManagePage() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [notice, setNotice] = useState("");
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
  const lock = useRef(false);
  async function load() {
    setLoading(true); setError("");
    try { await request("/api/session"); setSnapshot(await request<WorkspaceSnapshot>("/api/workspace?archived=all")); }
    catch (e) { setError(e instanceof Error ? e.message : "加载失败，请重试。"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); const closeMenus = (event: KeyboardEvent) => { if (event.key === "Escape") document.querySelectorAll(".manage-app-menu[open]").forEach(menu => menu.removeAttribute("open")); }; document.addEventListener("keydown", closeMenus); return () => document.removeEventListener("keydown", closeMenus); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
  function edit(next: Editor) { setEditorError(""); setTagsOpen(false); setEditor(next); }
  async function mutate(action: WorkspaceAction, closeEditor = false) {
    if (!snapshot || lock.current) return;
    lock.current = true; setBusy(true); setError(""); setEditorError("");
    try {
      const next = await request<WorkspaceSnapshot>("/api/workspace", { ...action, workspaceId: snapshot.workspace.id });
      setSnapshot(next); setNotice("已保存"); if (closeEditor) setEditor(null); setConfirmDelete(null);
      if (action.action === "tag.delete" && tagId === action.tagId) setTagId("");
    } catch (e) { const message = e instanceof Error ? e.message : "保存失败，请重试。"; if (closeEditor) setEditorError(message); else setError(message); }
    finally { lock.current = false; setBusy(false); }
  }
  function newApp(event: { preventDefault(): void }) { if (selectedProject?.archived) event.preventDefault(); }
  function openApp(app: ManagedApp) {
    try { localStorage.setItem("forma-current-project", app.id); window.location.assign("/"); }
    catch { setError("无法记录应用选择，请允许此站点使用浏览器存储后重试。"); }
  }
  const apps = useMemo(() => filterApps(snapshot?.apps || [], snapshot?.projects || [], { query, projectId, tagId, starred, archived, sort }), [snapshot, query, projectId, tagId, starred, archived, sort]);
  const groups = snapshot?.projects.filter(p => (!projectId || p.id === projectId) && (projectId || apps.some(a => a.projectId === p.id))) || [];
  const selectedProject = snapshot?.projects.find(p => p.id === projectId);
  const creationProject = selectedProject || snapshot?.projects.find(p => p.isDefault);
  const createHref = "/?new=1" + (creationProject ? "&managedProjectId=" + encodeURIComponent(creationProject.id) : "");
  function resetFilters() { setQuery(""); setProjectId(""); setTagId(""); setArchived("active"); setStarred(false); }
  return <main className="manage-shell">
    <header className="manage-top"><a href="/" className="manage-back"><ArrowLeft size={16}/>回到创作</a><a href="/" className="manage-wordmark">motes<span>.</span></a><span className="manage-test-badge">测试模式</span></header>
    <div className="manage-layout"><aside className="manage-sidebar"><div className="manage-space"><span className="manage-avatar">{snapshot?.profile.displayName.slice(0, 1) || "M"}</span><div><strong>{snapshot?.profile.displayName || "工作空间"}</strong><small>当前浏览器的独立测试空间</small></div></div><button className="manage-profile-edit" disabled={!snapshot || busy} onClick={() => edit({ kind: "profile" })}>编辑测试资料</button>
      <div className="manage-nav-head"><span>项目</span><button className="manage-icon" aria-label="新建项目" disabled={!snapshot || busy || snapshot.projects.length >= snapshot.limits.projects} onClick={() => edit({ kind: "project" })}><Plus size={17}/></button></div>
      <nav aria-label="项目筛选"><button className={!projectId ? "selected" : ""} onClick={() => setProjectId("")}><Folder size={16}/>全部项目<span>{snapshot?.apps.length || 0}</span></button>{snapshot?.projects.filter(p => !p.archived).map(p => <button className={projectId === p.id ? "selected" : ""} key={p.id} onClick={() => setProjectId(p.id)}><Folder size={16}/><span className="manage-nav-name">{p.name}</span><span>{p.appCount}</span></button>)}
      {!!snapshot?.projects.some(p => p.archived) && <details className="manage-archived-projects"><summary>已归档项目</summary>{snapshot.projects.filter(p => p.archived).map(p => <button key={p.id} className={projectId === p.id ? "selected" : ""} onClick={() => { setProjectId(p.id); setArchived("all"); }}><Archive size={15}/><span className="manage-nav-name">{p.name}</span><span>{p.appCount}</span></button>)}</details>}</nav>
      <button className="manage-tags-link" disabled={!snapshot || busy} onClick={() => { setError(""); setTagsOpen(true); }}><TagIcon size={16}/>标签管理<span>{snapshot?.tags.length || 0}</span></button><p className="manage-identity-note">无需登录。清除 Cookie 或更换设备后，无法找回当前测试身份；显示名称不用于身份认证。</p>
    <button className="manage-tags-link" disabled={!snapshot} onClick={()=>setBackupOpen(true)}>JSON 备份与导入</button></aside><section className="manage-content" aria-busy={loading}>
      <div className="manage-heading"><div><p className="manage-eyebrow">你的创作空间</p><h1>{selectedProject?.name || "应用管理"}</h1><p>{selectedProject?.description || "整理灵感，让每个应用各得其所。"}</p></div><a href={createHref} onClick={newApp} aria-disabled={selectedProject?.archived || undefined} title={selectedProject?.archived ? "请先恢复项目再创建应用" : undefined} className="manage-primary manage-create"><Plus size={16}/>创建应用</a></div>
      {selectedProject && <div className="manage-project-tools"><span>{selectedProject.archived ? "已归档项目 · 应用仍可查看和移动" : selectedProject.isDefault ? "默认项目" : "项目"}</span><button disabled={busy} onClick={() => edit({ kind: "project", item: selectedProject })}>编辑项目</button><button disabled={busy} onClick={() => void mutate({ action: "project.update", projectId: selectedProject.id, starred: !selectedProject.starred })}>{selectedProject.starred ? "取消收藏项目" : "收藏项目"}</button><button disabled={busy || selectedProject.isDefault} title={selectedProject.isDefault ? "默认项目不能归档" : "归档不删除应用"} onClick={() => void mutate({ action: "project.update", projectId: selectedProject.id, archived: !selectedProject.archived })}>{selectedProject.archived ? "恢复项目" : "归档项目"}</button></div>}
      <div className="manage-filters"><label className="manage-search"><Search size={17}/><input aria-label="搜索应用名称或描述" placeholder="搜索应用…" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="按标签筛选" value={tagId} onChange={e => setTagId(e.target.value)}><option value="">全部标签</option>{snapshot?.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><select aria-label="按归档状态筛选" value={archived} onChange={e => setArchived(e.target.value)}><option value="active">未归档应用</option><option value="archived">已归档应用</option><option value="all">全部状态</option></select><select aria-label="排序方式" value={sort} onChange={e => setSort(e.target.value)}><option value="updated">最近更新</option><option value="created">最近创建</option><option value="name">名称排序</option></select><button className={`manage-star-filter ${starred ? "selected" : ""}`} aria-pressed={starred} onClick={() => setStarred(!starred)}><Star size={15} fill={starred ? "currentColor" : "none"}/>收藏</button></div>
      {error && <div className="manage-error" role="alert">{error}<button disabled={busy || loading} onClick={() => void load()}>重新加载</button></div>}
      {notice && <p className="manage-notice" role="status">{notice}</p>}
      {loading ? <div className="manage-empty" role="status"><div className="manage-loading"/><h2>正在整理你的空间…</h2><p>读取项目、应用和标签</p></div> : !snapshot ? <div className="manage-empty"><h2>暂时无法打开工作空间</h2><p>你的已有作品不会因此被修改，请重新加载。</p><button onClick={() => void load()}>重新加载</button></div> : !apps.length ? <div className="manage-empty"><Folder size={30}/><h2>{snapshot.apps.length ? "没有符合条件的应用" : "让第一个想法开始生长"}</h2><p>{snapshot.apps.length ? "试试其他筛选条件，或清空搜索。" : "先在创作台生成应用，回来后即可按项目和标签整理。"}</p>{snapshot.apps.length ? <button onClick={resetFilters}>重置筛选</button> : <a className="manage-primary" href={createHref} onClick={newApp} aria-disabled={selectedProject?.archived || undefined} title={selectedProject?.archived ? "请先恢复项目再创建应用" : undefined}>去创建应用<ArrowUpRight size={15}/></a>}</div> : <><p className="manage-result-count">{apps.length} 个应用<span>选择项目后创建，新应用会直接保存到该项目。</span></p>{groups.map(group => <section className="manage-group" key={group.id}><div className="manage-group-heading"><h2><Folder size={17}/>{group.name}{group.archived && <small>项目已归档</small>}{group.starred && <Star size={13} fill="currentColor"/>}</h2><span>{apps.filter(a => a.projectId === group.id).length}</span></div><div className="manage-grid">{apps.filter(a => a.projectId === group.id).map(app => <article className="manage-card" key={app.id}><div className="manage-card-top"><span className="manage-app-icon">M</span><button className="manage-icon" disabled={busy} aria-label={`${app.starred ? "取消收藏" : "收藏"}${app.name}`} aria-pressed={app.starred} onClick={() => void mutate({ action: "app.update", appId: app.id, starred: !app.starred })}><Star size={17} fill={app.starred ? "currentColor" : "none"}/></button></div><button className="manage-app-title" onClick={() => openApp(app)}>{app.name}<ArrowUpRight size={15}/></button><p className="manage-card-description">{app.description || "一个等待继续打磨的想法。"}</p><div className="manage-card-tags">{app.archived && <span className="manage-archive-label">已归档</span>}{app.tagIds.map(id => snapshot.tags.find(t => t.id === id)).filter((t): t is Tag => !!t).map(t => <span key={t.id}><i style={{ background: t.color }}/>{t.name}</span>)}</div><div className="manage-card-bottom"><time dateTime={app.updatedAt}>{new Date(app.updatedAt).toLocaleDateString("zh-CN")} 更新</time><details className="manage-app-menu"><summary aria-label={`${app.name}的更多操作`}><MoreHorizontal size={19}/></summary><div><button disabled={busy} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); edit({ kind: "app", item: app }); }}>编辑与移动</button><button disabled={busy} onClick={e => { e.currentTarget.closest("details")?.removeAttribute("open"); void mutate({ action: "app.update", appId: app.id, archived: !app.archived }); }}>{app.archived ? "恢复应用" : "归档应用"}</button></div></details></div></article>)}</div></section>)}</>}
    </section></div>
    {snapshot && editor && <Modal title={editor.kind === "profile" ? "编辑测试资料" : editor.kind === "app" ? "编辑应用" : editor.kind === "project" ? editor.item ? "编辑项目" : "新建项目" : editor.item ? "编辑标签" : "新建标签"} onClose={() => { if (!busy) setEditor(null); }}><EditorForm editor={editor} snapshot={snapshot} busy={busy} error={editorError} onSave={action => mutate(action, true)} onCancel={() => setEditor(null)}/></Modal>}
    {snapshot && tagsOpen && <Modal title="标签管理" onClose={() => { if (!busy) setTagsOpen(false); }}><div className="manage-tag-manager"><p className="manage-hint">标签可跨项目使用。删除标签会移除应用上的关联，应用本身保留。</p>{error && <p className="manage-error" role="alert">{error}</p>}{snapshot.tags.length ? snapshot.tags.map(t => <div className="manage-tag-row" key={t.id}><i style={{ background: t.color }}/><span>{t.name}</span><button disabled={busy} onClick={() => edit({ kind: "tag", item: t })}>编辑</button><button disabled={busy} onClick={() => setConfirmDelete(t)}>删除</button></div>) : <p className="manage-hint">还没有标签，创建一个用于整理应用。</p>}<button className="manage-primary" disabled={busy || snapshot.tags.length >= snapshot.limits.tags} onClick={() => edit({ kind: "tag" })}><Plus size={15}/>新建标签</button><small className="manage-hint">{snapshot.tags.length}/{snapshot.limits.tags} 个标签</small></div></Modal>}
    {confirmDelete && <Modal title="删除标签" onClose={() => { if (!busy) setConfirmDelete(null); }}><div className="manage-tag-manager"><p>删除“{confirmDelete.name}”？所有应用上的此标签都会移除，应用和版本保留。</p>{error && <p className="manage-error" role="alert">{error}</p>}<div className="manage-form-actions"><button disabled={busy} onClick={() => setConfirmDelete(null)}>取消</button><button className="manage-danger" disabled={busy} onClick={() => void mutate({ action: "tag.delete", tagId: confirmDelete.id })}>{busy ? "删除中…" : "删除标签"}</button></div></div></Modal>}
    {snapshot && backupOpen && <BackupPanel snapshot={snapshot} onClose={()=>setBackupOpen(false)} onImported={result=>{setProjectId(result.projectId);setArchived("all");void load();}}/>}
  </main>;
}
