"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Preferences, SettingsSnapshot } from "@/lib/motes/settings";
import type { WorkspaceSnapshot } from "@/lib/motes/types";
import DisplayModeToggle from './components/DisplayModeToggle';
import PreviewControls from './components/PreviewControls';
import RequirementBuilder from './components/RequirementBuilder';
import TaskCenter from './components/TaskCenter';
import { useDisplayMode } from './hooks/useDisplayMode';
import type { TaskCenterItem } from '@/lib/motes/task-center';
import VersionTools from "./components/VersionTools";
import SourceEditor from "./components/SourceEditor";
import PromptLibrary from "./components/PromptLibrary";
import { composeTemplateDraft } from "@/lib/motes/template-draft";
import { runtimePreview } from "@/lib/motes/runtime-preview";
import { diagnosticCollector, runtimeRepairRequest, type RuntimeDiagnostic } from "@/lib/motes/runtime-diagnostics";
import { RuntimeErrorPanel, RuntimeRepairDialog } from "./components/RuntimeErrorPanel";
import type { Version, Project, Summary } from "@/lib/forma/types";
import DiscussionPane, { IntentSwitch, IntentQuestion } from "./components/DiscussionPane";
import { useWorkspaceDraft } from "./hooks/useWorkspaceDraft";
import { suggestDiscussion } from "@/lib/motes/discussion-intent";
import { useAttemptRecovery } from "./hooks/useAttemptRecovery";
import { contextKey, draftAfterSend, failOriginalAttempt, matchesContext, preferSavedProject, prepareRecoveryRetry, removeFinishedAttempt, restoredAttempts } from "@/lib/motes/recovery-state";
import type { RecoveryAttempt } from "@/lib/motes/recovery-state";
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Code2, Download, Eye, Globe2, History, Layers3, LoaderCircle, MessageSquare, Monitor, Plus, RotateCcw, Smartphone, Sparkles, X } from "lucide-react";

type Session = { workspaceId: string; mode: "demo" | "model"; model: string | null; persistence: "cloud"; projects: Summary[] };
type Attempt = RecoveryAttempt;
const examples = [
  { icon: "✈", title: "旅行预算规划", tag: "让每一程都心中有数", prompt: "帮我做一个旅行预算规划工具，可以添加交通、住宿和餐饮支出，设置预算上限。", color: "peach" },
  { icon: "▦", title: "轻量任务看板", tag: "把想法变成下一步行动", prompt: "帮我做一个任务看板，可以添加任务，在待办、进行中和已完成之间移动。", color: "lavender" },
  { icon: "◷", title: "专注番茄钟", tag: "给专注留一点空间", prompt: "帮我做一个番茄钟，支持专注倒计时、暂停和重新开始。", color: "mint" },
];
class ApiError extends Error { constructor(message: string, public status: number, public retry?: "new") { super(message); } }
async function api<T>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
  const readSignal=body?signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal } : { cache: "no-store", signal:readSignal });
  const data = await response.json().catch(() => ({ error: "服务暂时没有返回有效结果，请重试。" })) as T & { error?: string; retry?: "new" };
  if (!response.ok) throw new ApiError(data.error || "暂时无法完成，请稍后重试。", response.status, data.retry);
  return data;
}
function Logo({ small = false }: { small?: boolean }) { return <span className={`forma-logo ${small ? "small" : ""}`}><span className="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="2.5"/><circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="3"/></svg></span>{!small && <span>motes<span className="brand-dot">.</span></span>}</span>; }
function dateLabel(value: string) { return new Date(value).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }); }

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [projects, setProjects] = useState<Summary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [creationTarget, setCreationTarget] = useState<{ id: string; name: string } | null>(null);
  const [creationContextId, setCreationContextId] = useState<string | undefined>();
  const [recoveryGeneration, setRecoveryGeneration] = useState(0);
  const [recoveryPaused, setRecoveryPaused] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const displayMode=useDisplayMode(workspaceId,true),detailed=displayMode.mode==='detail';
  const [tasksOpen,setTasksOpen]=useState(false),[taskItems,setTaskItems]=useState<TaskCenterItem[]>([]),[tasksBusy,setTasksBusy]=useState(false);
  const [previewWidth,setPreviewWidth]=useState<number|null>(null),[previewScale,setPreviewScale]=useState(1);
  const previewSurface=useRef<HTMLElement>(null);
  const workspaceRef = useRef<string | null>(null);
  const [intent, setIntent] = useState<"build" | "discuss">("build");
  const [discussionBusy, setDiscussionBusy] = useState(false);
  const [preDiscussionActive, setPreDiscussionActive] = useState(false);
  const [discussionReset, setDiscussionReset] = useState(0);
  const [questionChoice, setQuestionChoice] = useState<string | null>(null);
  const [discussionSeed, setDiscussionSeed] = useState<{ id: number; text: string }>();
  const preDraftPrefix = "pre:" + (creationTarget?.id || "default") + "|";
  const draftContextKey = project ? "app:" + project.id : preDraftPrefix + (creationContextId || "default");
  const buildDraft = useWorkspaceDraft(workspaceId, draftContextKey);
  const prompt = buildDraft.value, setPrompt = buildDraft.set;
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateChoice, setTemplateChoice] = useState<{ name: string; prompt: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"demo" | "model">("demo");
  const [preferences, setPreferences] = useState<Preferences>({ creationMode: "demo", previewDevice: "desktop", autoFollow: true, showWaitTimer: true, language: "zh-CN", visualStyle: "minimal" });
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pane, setPane] = useState<"chat" | "preview">("preview");
  const [history, setHistory] = useState(false);
  const [source, setSource] = useState(false);
  const [editorVersionId, setEditorVersionId] = useState<string | null>(null);
  const [viewVersion, setViewVersion] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [sidebar, setSidebar] = useState(false);
  const operationLock = useRef(false);
  const operationEpoch = useRef(0), activeOperation = useRef<string | null>(null), mounted = useRef(true), activeFetch = useRef<AbortController | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [notice, setNotice] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeDiagnostic[]>([]);
  const [repairCandidate, setRepairCandidate] = useState<string | null>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const followChat = useRef(true);
  const outboxReady = useRef(false);
  const recoveryContext = { projectId: project?.id, managedProjectId: project ? undefined : creationTarget?.id, contextId: project ? undefined : creationContextId };
  const visibleAttempts = attempts.filter(a => matchesContext(a, recoveryContext));
  const workspace = !!project || visibleAttempts.length > 0 || intent === "discuss" || preDiscussionActive;
  const current = project?.versions.find(v => v.id === project.currentVersionId) || project?.versions.at(-1);
  const displayed = project?.versions.find(v => v.id === viewVersion) || current;
  const displayedId = displayed?.id;
  const diagnosticScope = useMemo(() => {
    if (!displayedId) return null;
    const channel = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
    return { channel, collector: diagnosticCollector(channel) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- App switches and explicit iframe refreshes require a fresh channel even if the immutable version ID is unchanged.
  }, [project?.id, displayedId, refresh]);
  const srcDoc = useMemo(() => displayed && diagnosticScope && typeof window !== "undefined" ? runtimePreview(displayed.html, diagnosticScope.channel, window.location.origin) : "", [displayed, diagnosticScope]);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the previous frame's reports before a new iframe can post messages.
    setRuntimeErrors([]); setRepairCandidate(null);
    if (!diagnosticScope) return;
    const receive = (event: MessageEvent) => { const report = diagnosticScope.collector.accept(event, previewFrame.current?.contentWindow, Date.now()); if (report) setRuntimeErrors(previous => [...previous, report]); };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [diagnosticScope]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const recovery = useAttemptRecovery({attempts,context:recoveryContext,generation:recoveryGeneration,
    enabled:!!session && intent === "build" && !questionChoice && !sessionLoading && !busy && !opening && !recoveryPaused,
    isCurrentGeneration:epoch=>mounted.current && operationEpoch.current===epoch,
    onRecovered:async(attempt,receipt,guard)=>{
      if(!guard.isCurrent() || !matchesContext(attempt,recoveryContext))return;
      const result=await api<{project:Project}>(`/api/projects/${encodeURIComponent(receipt.projectId)}`,undefined,guard.signal);
      if(!guard.isCurrent() || !mounted.current || !matchesContext(attempt,recoveryContext))return;
      if(!result.project.versions.some(v=>v.id===receipt.resultVersionId))throw new Error("已保存版本暂未完整返回，请稍后核对。");
      if(project?.id!==result.project.id)interruptRecovery();
      setAttempts(previous=>removeFinishedAttempt(previous,attempt));
      await linkAdoptedDiscussion(attempt,result.project,guard.signal);if(!guard.isCurrent())return;
      remember(result.project,true);setNotice("已取回原请求保存的结果，未重复生成；下一条草稿已保留");
    }});
  const unresolvedRecovery = visibleAttempts.some(a=>a.recovered && !["failed","expired"].includes(recovery.stateFor(a)?.phase??"checking"));
  function interruptRecovery() { const epoch=++operationEpoch.current;setRecoveryGeneration(epoch);return epoch; }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- This mutable operation token intentionally invalidates every outstanding callback at teardown.
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operationEpoch.current++;activeFetch.current?.abort();};},[]);
  function checkRecovery() {interruptRecovery();setRecoveryPaused(false);recovery.checkAgain();}
  function pauseRecovery() {interruptRecovery();setRecoveryPaused(true);setNotice("已暂停本页核对；不会取消已经开始的服务端调用或费用。");}

  async function initialize() {
    const epoch=interruptRecovery();setRecoveryPaused(false);
    setSessionLoading(true); setError("");
    try {
      const data = await api<Session>("/api/session");
      if(!mounted.current || epoch!==operationEpoch.current)return;
      if (!data.workspaceId) throw new Error("会话未返回草稿归属，请刷新后重试。");
      if (workspaceRef.current && workspaceRef.current !== data.workspaceId) { setTasksOpen(false);setTaskItems([]);setProject(null); setPreDiscussionActive(false);  }
      workspaceRef.current = data.workspaceId; setWorkspaceId(data.workspaceId);
      let owned = restoredAttempts(sessionStorage.getItem("motes-outbox:" + data.workspaceId));
      if (!owned.length) { const legacy = restoredAttempts(sessionStorage.getItem("motes-outbox")).slice(-10); const checked = await Promise.allSettled(legacy.map(async a => { const receipt = await api<{requestId:string;status:string}>("/api/requests/" + encodeURIComponent(a.requestId)); if(receipt.requestId!==a.requestId||!["running","done","failed","expired","save_pending"].includes(receipt.status))throw new Error("旧请求归属尚未确认"); return a; })); owned = checked.flatMap(r => r.status === "fulfilled" ? [r.value] : []); }
      if (!mounted.current || epoch !== operationEpoch.current) return;
      setAttempts(owned); try { sessionStorage.setItem("motes-outbox:" + data.workspaceId, JSON.stringify(owned)); const savedIntent=localStorage.getItem("motes-intent:"+data.workspaceId); setIntent(savedIntent === "discuss" ? "discuss" : "build");setPreDiscussionActive(localStorage.getItem("motes-pre-active:"+data.workspaceId)==="true"); } catch {}
      setProjects(data.projects); setMode(data.mode);
      const context = new URLSearchParams(window.location.search), targetId = context.get("managedProjectId");
      if (targetId !== null) {
        const snapshot = await api<WorkspaceSnapshot>("/api/workspace?listOnly=true");
        if(!mounted.current || epoch!==operationEpoch.current)return;
        const target = snapshot.projects.find(p => p.id === targetId && !p.archived);
        if (!target) throw new Error("目标项目不存在或已归档，请返回应用管理重新选择。");
        setCreationTarget({ id: target.id, name: target.name });
      }
      setSession(data);
      try {
        const saved=JSON.parse(sessionStorage.getItem("motes-new-context:" + data.workspaceId)||"null") as {managedProjectId?:string|null;contextId?:string}|null;
        const pending=owned.slice().reverse().find(a=>!a.projectId && a.managedProjectId===(targetId??undefined));
        setCreationContextId(saved?.managedProjectId===(targetId??null) && typeof saved.contextId==="string" && saved.contextId.length<=128?saved.contextId:pending?.contextId);
      }catch{}
      if (context.get("new") === "1" || targetId !== null) { setProject(null); return; }
      let saved: string | null = null; try { saved = localStorage.getItem("forma-current-project"); } catch {}
      if (saved && data.projects.some(p => p.id === saved)) {
        const result = await api<{ project: Project }>(`/api/projects/${saved}`);
        if(!mounted.current || epoch!==operationEpoch.current)return;
        setProject(result.project); setMode(result.project.versions.find(v => v.id === result.project.currentVersionId)?.mode === "demo" ? "demo" : data.mode);
      }
    } catch (e) { if(mounted.current && epoch===operationEpoch.current){setSession(null);setError(e instanceof Error ? e.message : "初始化失败，请重试。");} }
    finally { if(mounted.current && epoch===operationEpoch.current)setSessionLoading(false); }
  }
  useEffect(() => {
    let live=true;
    void Promise.resolve().then(()=>{if(!live)return;void initialize();});
    return()=>{live=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Bootstrap once; the reconnect button invokes the current initialize function explicitly.
  }, []);
  useEffect(() => {
    if (!session) return;
    let current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Block sending until the newly selected scope's preferences have loaded.
    setPreferencesLoading(true);
    void api<SettingsSnapshot>("/api/settings" + (project?.id ? "?appId=" + encodeURIComponent(project.id) : creationTarget?.id ? "?projectId=" + encodeURIComponent(creationTarget.id) : "")).then(data => { if (!current) return; setPreferences(data.effective); setDevice(data.effective.previewDevice); setMode(data.effective.creationMode); }).catch(e => { if (current) setError("读取设置失败：" + (e instanceof Error ? e.message : "请重试。")); }).finally(() => { if (current) setPreferencesLoading(false); });
    return () => { current = false; };
  }, [session, project?.id, creationTarget?.id]);
  useEffect(() => { if (!workspaceId) return; if (!outboxReady.current) { outboxReady.current = true; return; } try { sessionStorage.setItem("motes-outbox:" + workspaceId, JSON.stringify(attempts)); } catch {} }, [attempts, workspaceId]);
  useEffect(() => { if (preferences.autoFollow && followChat.current) chatEnd.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); }, [project?.versions.length, attempts, pane, preferences.autoFollow]);
  useEffect(() => { if (!busy || !preferences.showWaitTimer) return; const timer = setInterval(() => setElapsed(n => n + 1), 1000); return () => clearInterval(timer); }, [busy, preferences.showWaitTimer]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setSource(false); setHistory(false); setSidebar(false); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  function remember(next: Project, preserveView=false) {
    setCreationTarget(null); const url = new URL(window.location.href); url.searchParams.delete("new"); url.searchParams.delete("managedProjectId"); window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (!project) buildDraft.transfer("app:" + next.id);
    setProject(previous=>preferSavedProject(previous,next)); if(!preserveView)setViewVersion(null);
    try { localStorage.setItem("forma-current-project", next.id); sessionStorage.removeItem("motes-new-context:" + workspaceRef.current); } catch {}
    setProjects(previous => [{ id: next.id, title: next.title, createdAt: next.createdAt, updatedAt: next.updatedAt, currentVersionId: next.currentVersionId }, ...previous.filter(p => p.id !== next.id)]);
  }
  async function openProject(id: string) {
    if (busy || discussionBusy || opening || sessionLoading) return;
    const epoch=interruptRecovery();setRecoveryPaused(false);
    setOpening(true); setError("");
    try { const result = await api<{ project: Project }>(`/api/projects/${id}`); if(!mounted.current || epoch!==operationEpoch.current)return;remember(result.project); setSidebar(false); setHistory(false); setSource(false); setMode(result.project.versions.find(v => v.id === result.project.currentVersionId)?.mode === "demo" ? "demo" : session?.mode || "demo"); }
    catch (e) { if(mounted.current && epoch===operationEpoch.current)setError(e instanceof Error ? e.message : "项目加载失败。"); }
    finally { if(mounted.current && epoch===operationEpoch.current)setOpening(false); }
  }
  function newProject() { if (busy || discussionBusy || opening || sessionLoading) return; interruptRecovery();setRecoveryPaused(false);const nextContext=crypto.randomUUID();setCreationContextId(nextContext);setNotice(visibleAttempts.some(a=>a.recovered)?"已切换到新建应用；停止本页等待不会取消服务端调用或费用。":"");setProject(null);setOpening(false);setPreDiscussionActive(false);setDiscussionReset(value=>value+1);setIntent("build");try{if(workspaceId){localStorage.setItem("motes-pre-active:"+workspaceId,"false");localStorage.setItem("motes-intent:"+workspaceId,"build")}}catch{}setError("");setViewVersion(null);setHistory(false);setSidebar(false);try{localStorage.removeItem("forma-current-project");sessionStorage.setItem("motes-new-context:" + workspaceRef.current,JSON.stringify({managedProjectId:creationTarget?.id??null,contextId:nextContext}));}catch{} }
  async function loadTasks(){const scope=workspaceRef.current;setTasksBusy(true);try{const result=await api<{items:TaskCenterItem[]}>('/api/tasks');if(workspaceRef.current!==scope)return;setTaskItems(result.items);}catch(e){setTasksOpen(false);setError(e instanceof Error?e.message:'读取任务失败。');}finally{setTasksBusy(false);}}
  async function saveTask(requestId:string){if(operationLock.current||discussionBusy||opening)return;operationLock.current=true;setBusy(true);setTasksBusy(true);try{const result=await api<{project?:Project}>('/api/tasks/'+encodeURIComponent(requestId)+'/save',{});const attempt=attempts.find(a=>a.requestId===requestId);if(result.project&&(result.project.id===project?.id||(attempt&&matchesContext(attempt,recoveryContext)))){remember(result.project,true);if(attempt)setAttempts(previous=>removeFinishedAttempt(previous,attempt));}setNotice('原结果已保存，未重新调用模型。');await loadTasks();}catch(e){setTasksOpen(false);setError(e instanceof Error?e.message:'保存未完成，原结果仍暂存。');}finally{operationLock.current=false;setBusy(false);setTasksBusy(false);}}
  function refreshPreview(){if(window.confirm('刷新会清空预览中未保存的临时输入，已保存版本不受影响。'))setRefresh(n=>n+1);}
  async function fullscreenPreview(){try{if(document.fullscreenElement)await document.exitFullscreen();else await previewSurface.current?.requestFullscreen();}catch{setNotice('当前浏览器未允许全屏，可继续调整预览宽度。');}}
  async function saveAttempt(a:Attempt){
    if(operationLock.current||opening||discussionBusy)return;
    const epoch=interruptRecovery();operationLock.current=true;setBusy(true);setError('');
    try{const result=await api<{project:Project}>('/api/tasks/'+encodeURIComponent(a.requestId)+'/save',{});if(!mounted.current||epoch!==operationEpoch.current)return;remember(result.project,true);setAttempts(previous=>removeFinishedAttempt(previous,a));setNotice('原结果已保存，未重新调用模型；下一条草稿已保留。');}
    catch(e){if(mounted.current&&epoch===operationEpoch.current)setError(e instanceof Error?e.message:'保存暂未完成，原结果仍保留。');}
    finally{operationLock.current=false;if(mounted.current)setBusy(false);}
  }
  async function generate(value = prompt, retry?: Attempt, confirmedQuestion = false) {
    if (value.length > 4000) { setError("构建需求最多 4000 字，请先精简草稿。"); return; }
    if (!session || !workspaceId || sessionLoading || discussionBusy || preferencesLoading || operationLock.current || opening || !value.trim()) return;
    if (!retry && !confirmedQuestion && suggestDiscussion(value)) { setQuestionChoice(value); return; }
    if(!retry && unresolvedRecovery){setNotice("请先核对原请求结果，或重试原消息；当前草稿会保留。");return;}
    let attempt:Attempt;
    if(retry){
      if(!matchesContext(retry,recoveryContext))return;
      const recovered=recovery.stateFor(retry);
      const prepared=retry.recovered && recovered?prepareRecoveryRetry(retry,recovered,contextKey(recoveryContext),()=>crypto.randomUUID()):null;
      if(retry.recovered && !prepared){checkRecovery();return;}
      // eslint-disable-next-line react-hooks/purity -- This timestamp is captured only by the user-triggered send handler, never during render.
      attempt=prepared??{...retry,requestId:retry.retryConfirmed?crypto.randomUUID():retry.requestId,state:"sending",error:undefined,recovered:false,retryConfirmed:undefined,startedAt:Date.now()};
    }else{
      const draftContext=project?undefined:creationContextId??crypto.randomUUID();
      if(!project){setCreationContextId(draftContext);try{sessionStorage.setItem("motes-new-context:"+workspaceRef.current,JSON.stringify({managedProjectId:creationTarget?.id??null,contextId:draftContext}));}catch{}}
      // eslint-disable-next-line react-hooks/purity -- This timestamp belongs to an explicit send event, not a component render.
      attempt={id:crypto.randomUUID(),requestId:crypto.randomUUID(),text:value.trim(),projectId:project?.id,managedProjectId:project?undefined:creationTarget?.id,contextId:draftContext,baseVersionId:project?.currentVersionId,mode,state:"sending",startedAt:Date.now()};
    }
    const epoch=interruptRecovery(),operation=crypto.randomUUID(),controller=new AbortController();
    activeOperation.current=operation;activeFetch.current=controller;setRecoveryPaused(false);
    operationLock.current = true; setBusy(true); setElapsed(0); setPrompt(current=>draftAfterSend(current,attempt.text,!!retry)); setError(""); setNotice(""); setPane("chat"); followChat.current = true;
    const nextAttempts=retry?attempts.map(a=>a.id===attempt.id?attempt:a):[...attempts,attempt];setAttempts(nextAttempts);
    // Record the original ID before sending, even if the tab refreshes before
    // React's outbox effect has run. A retry never consumes the next draft.
    try{sessionStorage.setItem("motes-outbox:" + workspaceRef.current,JSON.stringify(nextAttempts));}catch{}
    try {
      const result = await api<{ project: Project }>("/api/generate", { prompt: attempt.text, projectId: attempt.projectId, managedProjectId: attempt.managedProjectId, baseVersionId: attempt.baseVersionId, mode: attempt.mode, requestId: attempt.requestId },controller.signal);
      if(!mounted.current || epoch!==operationEpoch.current || activeOperation.current!==operation)return;
      const linkNote = await linkAdoptedDiscussion(attempt,result.project,controller.signal);
      if(!mounted.current || epoch!==operationEpoch.current || activeOperation.current!==operation)return;
      remember(result.project); setAttempts(previous=>removeFinishedAttempt(previous,attempt)); setNotice(linkNote || "新版本已保存，可切换到预览查看");
    } catch (e) {
      const message = e instanceof Error ? e.message : "连接中断，请重试。";
      const confirmed=e instanceof ApiError && (e.retry==="new" || (e.status>=400 && e.status<500 && e.status!==409));
      if(mounted.current)setAttempts(previous=>failOriginalAttempt(previous,attempt,message,confirmed));
    } finally {
      if(activeFetch.current===controller)activeFetch.current=null;
      if(mounted.current && activeOperation.current===operation){activeOperation.current=null;operationLock.current=false;setBusy(false);if(epoch===operationEpoch.current)textarea.current?.focus({preventScroll:true});}
    }
  }
  async function restore(versionId: string) {
    if (!project || operationLock.current) return;
    if(unresolvedRecovery){setNotice("请先核对原请求的保存结果，再还原历史版本。");return;}
    const epoch=interruptRecovery(),operation=crypto.randomUUID();activeOperation.current=operation;
    operationLock.current = true; setBusy(true); setError("");
    try { const result = await api<{ project: Project }>(`/api/projects/${project.id}/restore`, { versionId });if(!mounted.current || epoch!==operationEpoch.current || activeOperation.current!==operation)return;remember(result.project);setHistory(false);setNotice("已还原版本，历史记录完整保留"); }
    catch (e) { if(mounted.current && epoch===operationEpoch.current)setError(e instanceof Error ? e.message : "还原失败。"); }
    finally { if(mounted.current && activeOperation.current===operation){activeOperation.current=null;operationLock.current=false;setBusy(false);} }
  }
  function adoptSavedProject(next:Project) {
    interruptRecovery();activeFetch.current?.abort();activeOperation.current=null;operationLock.current=false;setBusy(false);setRecoveryPaused(false);
    setAttempts(previous=>previous.map(a=>a.state==="sending"?{...a,state:"failed",recovered:true,error:"页面已切换，正在核对原请求保存结果。"}:a));remember(next);
  }
  function changeIntent(next: "build" | "discuss") {
    if (busy || discussionBusy || opening || sessionLoading) return; interruptRecovery(); setIntent(next); setPane("chat");
    if (next === "discuss") setPreDiscussionActive(true);
    try { if (workspaceId) { localStorage.setItem("motes-intent:"+workspaceId,next); if(next==="discuss")localStorage.setItem("motes-pre-active:"+workspaceId,"true"); } } catch {}
  }
  async function linkAdoptedDiscussion(attempt: Attempt, next: Project, signal?: AbortSignal) {
    if (attempt.projectId || !workspaceRef.current || !attempt.contextId) return "";
    let threadId: string | null = null; try { threadId=sessionStorage.getItem("motes-adoption:"+workspaceRef.current+":"+attempt.contextId); } catch {}
    if (!threadId) return "";
    try { await api("/api/discussions/threads/"+encodeURIComponent(threadId)+"/attach",{appId:next.id},signal);return "新版本已保存，所采用的构建前讨论已关联；下一条草稿保留"; }
    catch { return "应用已保存；原构建前讨论仍保留，关联状态请稍后核对。"; }
  }
  function adoptDiscussion(text: string, placement: "replace" | "append", threadId: string) {
    const next=composeTemplateDraft(prompt,text,placement); setPrompt(next); if(!project)buildDraft.writeTo(preDraftPrefix+threadId,next); interruptRecovery();
    if (!project) { setCreationContextId(threadId); try { if(workspaceId) { sessionStorage.setItem("motes-adoption:"+workspaceId+":"+threadId,threadId);sessionStorage.setItem("motes-new-context:"+workspaceId,JSON.stringify({managedProjectId:creationTarget?.id??null,contextId:threadId})); } } catch {} }
    changeIntent("build");setPreDiscussionActive(true);setNotice("讨论方向已填入构建草稿，请编辑确认后再发送；尚未生成代码。");
    requestAnimationFrame(()=>textarea.current?.focus());
  }
  function fillRepair(text: string, placement: "replace" | "append") {
    changeIntent("build"); setPrompt(composeTemplateDraft(prompt, text, placement)); setMode("model"); setRepairCandidate(null); setNotice("修复需求已填入，可编辑后发送；尚未调用模型"); requestAnimationFrame(() => textarea.current?.focus());
  }
  function prepareRepair() {
    if (busy || discussionBusy || session?.mode !== "model" || !project || displayed?.id !== project.currentVersionId) return;
    const text = runtimeRepairRequest(runtimeErrors); if (prompt.trim()) setRepairCandidate(text); else fillRepair(text, "replace");
  }
  function fillTemplate(text: string, placement: "replace" | "append") {
    setPrompt(composeTemplateDraft(prompt, text, placement)); setTemplatesOpen(false); setTemplateChoice(undefined); setNotice("模板已填入，可编辑后发送；尚未生成应用"); requestAnimationFrame(() => textarea.current?.focus());
  }
  function chooseInspiration(item: { title: string; prompt: string }) {
    if (prompt.trim()) { setTemplateChoice({ name: item.title, prompt: item.prompt }); setTemplatesOpen(true); } else fillTemplate(item.prompt, "replace");
  }
  function download() {
    if (!displayed) return;
    const url = URL.createObjectURL(new Blob([displayed.html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${project?.title.replace(/[\\/:*?"<>|]/g, "_") || "forma-app"}.html`; anchor.click(); setNotice("HTML 已导出"); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const versionMessage = (v: Version) => <div className="conversation-pair" key={v.id}><div className="user-message">{v.prompt}</div><div className="assistant-message"><span className="assistant-avatar"><Sparkles size={14}/></span><div><div className="message-author">Motes <span>{v.mode === "manual" ? "手工编辑" : v.mode === "demo" ? "示例模式" : v.model || "AI"}</span></div><p>{v.summary}</p><button className="version-card" onClick={() => { setViewVersion(v.id === current?.id ? null : v.id); setPane("preview"); }}><span><Code2 size={16}/></span><div>应用已更新<small>版本 {v.number}{v.name ? ` · ${v.name}` : ""}{v.important ? " ★" : ""} · {dateLabel(v.createdAt)}</small></div><ArrowUpRight size={14}/></button></div></div></div>;
  const attemptMessage = (a: Attempt) => {
    const status=a.recovered?recovery.stateFor(a):undefined;
    const saveOnly=status?.phase==="save_pending";
    const terminal=!!status && ["failed","expired","not-found"].includes(status.phase);
    const checking=!!a.recovered && !recoveryPaused && (!status || ["checking","running","unavailable"].includes(status.phase));
    const checkOnly=!!a.recovered && !terminal;
    return <div className="conversation-pair" key={a.id}><div className="user-message">{a.text}</div><div className={`message-delivery ${a.state==="sending"||checking?"sending":"failed"}`} role={a.state==="sending"||checking||checkOnly?"status":"alert"}>
      {a.state==="sending"?<><LoaderCircle size={17} className="spin"/><div><strong>{a.mode==="demo"?"正在准备示例…":elapsed>=30?"仍在等待请求结果，请稍候…":"正在构建你的应用…"}</strong><small>{preferences.showWaitTimer?`已等待 ${elapsed} 秒 · `:""}完成后自动保存{displayed?"，当前预览仍可使用":""}</small></div></>:checking?<><LoaderCircle size={17} className="spin"/><div><strong>{status?.phase==="running"?"正在核对原请求进度…":"正在取回原请求结果…"}</strong><small>{status?.message??"先核对保存结果，不会重复发起生成。"}</small><button className="edit-failed" disabled={busy||discussionBusy||opening} onClick={pauseRecovery}>暂停核对</button></div></>:<><button className="retry-message" aria-label={saveOnly?"仅重试保存，不调用模型":checkOnly?"再次检查原请求状态":status?.retry==="same"?"重试原请求（沿用编号）":"重试这条消息"} title={checkOnly?"再次检查原请求状态":"重试这条消息"} disabled={busy||opening} onClick={()=>saveOnly?void saveAttempt(a):checkOnly?checkRecovery():void generate(a.text,a)}><RotateCcw size={16}/></button><div><strong>{saveOnly?"生成结果已暂存 · 仅重试保存":checkOnly?"结果尚未确认":status?.phase==="expired"?"原请求已超期":status?.phase==="failed"?"原请求已确认失败":"发送未完成"}</strong><small>{checkOnly&&recoveryPaused?"核对已暂停，可再次检查。停止等待不保证取消服务端调用或费用。":status?.message??a.error}</small>{status?.phase==="not-found"&&a.error&&<small>{a.error}</small>}<button className="edit-failed" disabled={busy||opening} onClick={()=>{changeIntent("build");if(prompt.trim()&&prompt!==a.text){setTemplateChoice({name:"未完成的需求",prompt:a.text});setTemplatesOpen(true);}else{setPrompt(a.text);textarea.current?.focus();}}}>编辑需求</button></div></>}
    </div></div>;
  };
  const composer = (home: boolean) => <div className={`composer ${home ? "home-composer" : "chat-composer"}`}>
    {buildDraft.unavailable&&<small role="status" style={{fontSize:10,color:"#ac947d"}}>浏览器存储暂不可用，草稿仅在本页保留。</small>}
    {detailed&&<RequirementBuilder draft={prompt} disabled={busy||opening||discussionBusy} onApply={fillTemplate}/>}
    <textarea ref={textarea} aria-label={home ? "描述你想创建的应用" : "描述修改需求"} placeholder={home ? "描述你的想法，剩下的交给 Motes…" : "继续描述你想调整的地方…"} value={prompt} disabled={opening || sessionLoading || !workspaceId} onChange={e => { setPrompt(e.target.value);  }} onKeyDown={e => { if (!e.nativeEvent.isComposing && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate(); } }}/>
    <div className="composer-footer"><span className="composer-hint"><Sparkles size={14}/>{mode === "demo" ? "示例模式" : preferences.model || session?.model || "AI 模式"}<span className="keyboard-hint">⌘ / Ctrl + Enter</span></span><button type="button" aria-label="打开需求模板库" disabled={!session || sessionLoading || opening} style={{ background: "transparent", border: "1px solid #e0e6ef", color: "#8b9bb3", borderRadius: 6, fontSize: 11, padding: "5px 8px", marginLeft: "auto", marginRight: 10 }} onClick={() => { setTemplateChoice(undefined); setTemplatesOpen(true); }}>模板</button><button aria-label="生成应用" title={busy ? "正在处理上一条消息" : unresolvedRecovery ? "请先核对或重试原请求；当前草稿会保留" : "发送需求（Ctrl / ⌘ + Enter）"} className="send-button" disabled={!session || sessionLoading || busy || discussionBusy || opening || preferencesLoading || unresolvedRecovery || prompt.length>4000 || !prompt.trim()} onClick={() => void generate()}><ArrowUp size={19}/></button></div>
  </div>;
  return <div className={`forma-app ${workspace ? "is-workspace" : ""}`}>
    <aside className={`app-sidebar ${sidebar ? "is-open" : ""}`}>
      <button className="brand-button" onClick={newProject} aria-label="Motes 首页"><Logo/></button>
      <button className="new-project" onClick={newProject} disabled={busy||discussionBusy}><Plus size={17}/>新建应用</button>
      <div className="sidebar-label">工作空间</div><button className={`nav-item ${!project ? "active" : ""}`} disabled={busy || discussionBusy || opening} onClick={newProject}><Layers3 size={17}/>我的应用<span>{projects.length}</span></button>
      <div className="recent-heading">最近项目<History size={13}/></div>
      <div className="project-list">{projects.length ? projects.map(p => <button key={p.id} disabled={busy || discussionBusy || opening} onClick={() => void openProject(p.id)} className={`project-item ${project?.id === p.id ? "selected" : ""}`}><span className="project-mini"><Globe2 size={14}/></span><span>{p.title}<small>{dateLabel(p.updatedAt)}</small></span></button>) : <p className="empty-projects">你的第一个想法，<br/>会从这里开始。</p>}</div>
      <div className="sidebar-bottom"><div className="local-note"><span className="status-dot"/>云端自动保存</div><div className="profile"><span className="avatar">M</span><div>访客工作空间<small>同一浏览器可恢复项目</small></div><ChevronDown size={14}/></div></div>
    </aside>
    {sidebar && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebar(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" aria-label="打开导航" onClick={() => setSidebar(true)}><Layers3 size={20}/></button><span>工作空间</span><span className="slash">/</span><strong>{project?.title || (creationTarget ? creationTarget.name + " · 新建应用" : "我的应用")}</strong>{opening && <LoaderCircle size={14} className="spin"/>}</div><div className="topbar-right"><DisplayModeToggle value={displayMode.mode} onChange={displayMode.setMode}/><button className="workbench-text-button" disabled={!session||sessionLoading} onClick={()=>{setTasksOpen(true);void loadTasks();}}>任务中心</button><a hidden={!detailed} href="/settings" style={{ fontSize: 12, color: "#6b7d99", textDecoration: "none", marginRight: 12 }}>设置</a><a href="/compare" hidden={!detailed} style={{fontSize:12,color:"#6b7d99",textDecoration:"none",marginRight:12}}>比较候选</a><a href="/manage" style={{ fontSize: 12, color: "#6b7d99", textDecoration: "none", marginRight: 12 }}>应用管理</a><span className="demo-badge"><span/>{intent === "discuss" ? session?.mode === "model" ? "AI 讨论" : "讨论未连接" : mode === "demo" ? "示例模式" : "AI 模式"}</span></div></header>
      <div className="mode-notice"><Sparkles size={14}/><span>{intent === "discuss" ? session?.mode === "model" ? `讨论将使用 ${preferences.model || session.model || "AI"} 返回文字，不更新预览或版本。` : "尚未连接模型，讨论草稿可保留；可切回示例构建。" : mode === "demo" ? "当前为示例模式：使用预设模板体验创建与迭代，不调用 AI。" : `已连接 ${preferences.model || session?.model || "AI 模型"}，可以自由描述你的应用。`}</span>{intent === "build" && session?.mode === "model" && <button disabled={busy || discussionBusy || opening} onClick={() => setMode(mode === "demo" ? "model" : "demo")}>{mode === "demo" ? "切换 AI 模式" : "体验示例"}<ArrowUpRight size={12}/></button>}</div>
      {error && <div className="error-banner" role="alert"><span>{error}</span>{!session && <button onClick={() => void initialize()}>重新连接</button>}<button className="icon-button" aria-label="关闭错误" onClick={() => setError("")}><X size={15}/></button></div>}
      {!workspace ? <div className="home-content"><h1>一个想法，<br className="mobile-break"/>就能开始<span>创造。</span></h1><p className="home-description">用自然语言构建属于你的应用。<br className="mobile-break"/> 无需代码，让灵感即刻成形。</p><div style={{display:"flex",justifyContent:"center",marginBottom:14}}><IntentSwitch value={intent} disabled={!session||sessionLoading||busy||discussionBusy} onChange={changeIntent}/></div>{composer(true)}{Object.entries(buildDraft.entries).some(([key,text])=>key.startsWith(preDraftPrefix)&&!!text.trim()&&key!==draftContextKey)&&<select aria-label="恢复构建前草稿" value="" style={{marginTop:12,fontSize:11,color:"#91a2bc",border:"1px solid #e1e8f2",borderRadius:6,padding:7}} onChange={e=>{if(!e.target.value)return;const id=e.target.value.slice(preDraftPrefix.length);interruptRecovery();setCreationContextId(id==="default"?undefined:id);try{if(workspaceId)sessionStorage.setItem("motes-new-context:"+workspaceId,JSON.stringify({managedProjectId:creationTarget?.id??null,contextId:id==="default"?undefined:id}))}catch{}}}><option value="">恢复其他未发送构建草稿…</option>{Object.entries(buildDraft.entries).filter(([key,text])=>key.startsWith(preDraftPrefix)&&!!text.trim()&&key!==draftContextKey).map(([key,text])=><option key={key} value={key}>{text.slice(0,35)}</option>)}</select>}<div className="inspiration-label"><span/>或从一个灵感开始<span/></div><div className="example-grid">{examples.map(item => <button className={`example-card ${item.color}`} key={item.title} disabled={busy || !session || preferencesLoading} onClick={() => chooseInspiration(item)}><span className="example-icon">{item.icon}</span><span className="example-copy"><strong>{item.title}</strong><small>{item.tag}</small></span><ArrowUpRight size={17}/></button>)}</div><div className="home-footnote"><Check size={13}/>即时预览<span>·</span>历史版本<span>·</span>导出 HTML，带走你的作品</div>{sessionLoading && <p className="connecting"><LoaderCircle size={14} className="spin"/>正在连接你的工作空间…</p>}</div> : <div className="workspace-body">
        <div className="mobile-workspace-tabs"><button className={pane === "chat" ? "active" : ""} onClick={() => setPane("chat")}><MessageSquare size={14}/>对话</button><button className={pane === "preview" ? "active" : ""} onClick={() => setPane("preview")}><Eye size={14}/>预览</button></div>
        {session && !sessionLoading ? <DiscussionPane key={workspaceId+":"+(project?.id||creationTarget?.id||"pre")+":"+discussionReset} context={project?{appId:project.id}:creationTarget?{managedProjectId:creationTarget.id}:{}} intent={intent} visible={pane==="chat"} fresh={!project&&discussionReset>0} buildBusy={busy||opening} modelAvailable={!opening&&session?.mode==="model"} model={preferences.model||session?.model||undefined} baseVersionId={project?.currentVersionId} autoFollow={preferences.autoFollow} showWaitTimer={preferences.showWaitTimer} events={[...(project?.versions||[]).map(v=>({id:"version:"+v.id,time:Date.parse(v.createdAt),node:versionMessage(v)})),...visibleAttempts.map(a=>({id:"build:"+a.id,time:a.startedAt,node:attemptMessage(a)}))]} buildComposer={<>{mode==="demo"&&<div className="suggestion-row">{["改成深色主题","改成蓝色主题","改成绿色主题"].map(text=><button disabled={busy} key={text} onClick={()=>setPrompt(text)}>{text}</button>)}</div>}{composer(false)}<p className="composer-disclaimer">{mode==="demo"?"示例支持主题色调整；旅行预算另支持修改预算上限。":"构建将生成代码版本；讨论只返回文字。"}</p></>} buildDraft={prompt} seed={discussionSeed} onIntentChange={changeIntent} onBusyChange={setDiscussionBusy} onAdopt={adoptDiscussion}/> : <section className={`chat-panel ${pane==="chat"?"mobile-visible":""}`}><p style={{padding:24,color:"#9cabc0",fontSize:12}}>正在确认工作空间和草稿归属…</p></section>}
        <section ref={previewSurface} className={`preview-panel ${pane === "preview" ? "mobile-visible" : ""}`}><div className="preview-toolbar"><div className="preview-title"><Eye size={15}/><span>实时预览</span>{displayed && <span className="preview-version">v{displayed.number}</span>}</div><div className="preview-actions"><div className="device-toggle" hidden={detailed}><button aria-label="桌面预览" title="桌面预览" className={device === "desktop" ? "active" : ""} onClick={() => {setDevice("desktop");setPreviewWidth(null)}}><Monitor size={15}/></button><button aria-label="手机预览" title="手机预览" className={device === "mobile" ? "active" : ""} onClick={() => {setDevice("mobile");setPreviewWidth(null)}}><Smartphone size={15}/></button></div><span className="toolbar-divider"/><button hidden={detailed} className="icon-button" aria-label="刷新预览" title="刷新预览" disabled={!displayed} onClick={refreshPreview}><RotateCcw size={15}/></button><button hidden={!detailed} className={`icon-button ${history ? "selected" : ""}`} aria-label="版本历史" title="版本历史" onClick={() => setHistory(!history)}><History size={16}/></button><button hidden={!detailed} className="icon-button" aria-label="源码与版本" title="源码与版本比较" disabled={!displayed} onClick={() => setSource(true)}><Code2 size={17}/></button><button className="export-button" aria-label="导出 HTML" title="导出 HTML" disabled={!displayed} onClick={download}><Download size={14}/><span>导出 HTML</span></button></div></div>
          {displayed&&<div className="advanced-preview-controls" hidden={!detailed}><PreviewControls device={device} onDeviceChange={setDevice} width={previewWidth??(device==='mobile'?390:1100)} onWidthChange={setPreviewWidth} scale={previewScale} onScaleChange={setPreviewScale} fullscreenAvailable={!!session&&typeof document!=='undefined'&&document.fullscreenEnabled} onFullscreen={()=>void fullscreenPreview()} onRefresh={()=>setRefresh(n=>n+1)}/></div>}
          {viewVersion && viewVersion !== current?.id && <div className="history-notice">正在查看历史版本 v{displayed?.number}<button onClick={() => setViewVersion(null)}>回到当前版本<ArrowUpRight size={12}/></button></div>}
          <div className="preview-stage">{displayed ? <div className={`browser-frame ${device}`} style={{...(previewWidth?{width:previewWidth,maxWidth:"none",minWidth:previewWidth,flexShrink:0}:{}),zoom:previewScale}}><div className="browser-chrome"><div className="traffic-lights"><i/><i/><i/></div><span><Globe2 size={11}/>{(project?.title || "新应用").toLowerCase().replace(/\s+/g, "-")}<span className="preview-url-end">.motes.preview</span></span><span className="secure-dot"/></div><iframe ref={previewFrame} key={`${displayed?.id}-${refresh}`} title={`${project?.title || "新应用"} 应用预览`} srcDoc={srcDoc} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"/></div> : <div className="preview-empty"><Layers3 size={32}/><h2>你的应用将在这里呈现</h2><p>{busy ? "正在构建，完成后即可预览和操作。" : "尚未生成应用，可以在对话中重试或调整需求。"}</p></div>}{busy && displayed && <div className="preview-busy"><LoaderCircle size={14} className="spin"/>正在更新，当前预览仍可使用</div>}</div><RuntimeErrorPanel key={diagnosticScope?.channel} errors={runtimeErrors} modelAvailable={session?.mode === "model"} current={!!project && displayed?.id === project.currentVersionId} busy={busy||discussionBusy} onPrepare={prepareRepair} onSource={() => { if (displayed) { setSource(false); setHistory(false); setEditorVersionId(displayed.id); } }}/><div className="preview-bottom"><span><span className="status-dot"/>独立安全预览</span><span>{device === "mobile" ? "手机 · 390px" : "桌面 · 自适应"}<span className="bottom-separator">/</span>Made with Motes</span></div>
          {history && <div className="history-panel"><div className="panel-heading"><strong>版本历史</strong><button className="icon-button" aria-label="关闭历史" onClick={() => setHistory(false)}><X size={16}/></button></div><p>每一次迭代，都有迹可循。</p>{[...(project?.versions || [])].reverse().map(v => <div className="history-item" key={v.id}><button onClick={() => setViewVersion(v.id === current?.id ? null : v.id)}><span>版本 {v.number}{v.name ? ` · ${v.name}` : ""}{v.important ? " ★" : ""}{v.mode === "manual" ? " · 手工" : ""}{v.id === current?.id && <small>当前</small>}</span><p>{v.prompt}</p><time>{new Date(v.createdAt).toLocaleString("zh-CN")}</time></button>{v.id !== current?.id && <button className="restore-button" disabled={busy} onClick={() => void restore(v.id)}><RotateCcw size={12}/>还原此版</button>}</div>)}</div>}
        </section>
      </div>}
      {notice && <div className="workspace-toast" role="status"><Check size={15}/>{notice}</div>}
    </main>
    {questionChoice && <IntentQuestion onCancel={()=>setQuestionChoice(null)} onDiscuss={()=>{const text=questionChoice;setQuestionChoice(null);changeIntent("discuss");setDiscussionSeed({id:Date.now(),text})}} onBuild={()=>{const text=questionChoice;setQuestionChoice(null);void generate(text,undefined,true)}}/>}
    {tasksOpen&&<TaskCenter items={taskItems} busy={tasksBusy||busy||discussionBusy} onCheck={()=>void loadTasks()} onSave={id=>void saveTask(id)} onClose={()=>setTasksOpen(false)}/>}
    {repairCandidate && <RuntimeRepairDialog initial={repairCandidate} draft={prompt} onClose={() => setRepairCandidate(null)} onApply={fillRepair}/>}
    {templatesOpen && <PromptLibrary draft={prompt} initialChoice={templateChoice} onClose={() => { setTemplatesOpen(false); setTemplateChoice(undefined); }} onUse={fillTemplate}/>}
    {editorVersionId && project && <SourceEditor project={project} selectedVersionId={editorVersionId} onClose={() => setEditorVersionId(null)} onMetadataUpdated={next => setProject(next)} onSaved={next => { adoptSavedProject(next); setEditorVersionId(null); setSource(false); setHistory(false); setViewVersion(null); setNotice("手工新版本已保存，未调用模型"); }}/>}
    {source && project && <VersionTools project={project} selectedVersionId={viewVersion ?? project.currentVersionId} onEdit={versionId => { setSource(false); setHistory(false); setEditorVersionId(versionId); }} onClose={() => setSource(false)} onSaved={next => { adoptSavedProject(next); setSource(false); setHistory(false); setViewVersion(null); setNotice("已创建独立副本，原应用与历史完整保留"); }}/>}
  </div>;
}




