"use client";
/* Production vinext Link/RSC navigation is incompatible; native anchors retain synchronous draft persistence and existing leave guards. */

import {homeNotice} from "@/lib/motes/locale/home-notices";
import {useHostLocale,hostText} from "./components/HostLocaleProvider";
import {useRouter} from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState,type CSSProperties } from "react";
import type { Preferences, SettingsSnapshot } from "@/lib/motes/settings";
import type { WorkspaceSnapshot } from "@/lib/motes/types";
import WorkbenchLayoutControls,{WorkbenchResizeHandle} from './components/WorkbenchLayoutControls';
import { useWorkbenchLayout } from './hooks/useWorkbenchLayout';
import { usePanelScrollMemory } from './hooks/usePanelScrollMemory';
import workspaceToolsStyles from "./components/WorkspaceTools.module.css";
import WorkspaceOutcomeCard from "./components/WorkspaceOutcome";
import {outcomeIsCurrent,transferCreationDraft,finishRecoveredView,workspaceCallbackCurrent,type WorkspaceOutcome} from "./hooks/workspace-outcome";
import PreviewVersionStatus from "./components/PreviewVersionStatus";
import previewVersionStyles from "./components/PreviewVersionStatus.module.css";
import BuildAttemptFeedback from "./components/BuildAttemptFeedback";
import ArtifactCard from "./components/ArtifactCard";
import CandidateModeEntry from "./components/CandidateModeEntry";
import RaceWorkspace from "./components/RaceWorkspace";
import RacePreview,{RacePreviewTabs} from "./components/RacePreview";
import {racePresentation,type RacePreviewChoice} from "@/lib/motes/race-presentation";
import {PREVIEW_POLICY,safeDocument} from "@/lib/motes/preview-document";
import {useInlineRace} from "./hooks/useInlineRace";
import CreationJourneyGuide from "./components/CreationJourneyGuide";
import OfflineWorkspaceControls from "./components/OfflineWorkspaceControls";
import {useOfflineWorkspace} from "./components/OfflineProvider";
import {offlineFetch} from "@/lib/motes/offline-fetch";
import {readOfflineProject} from "@/lib/motes/offline-engine";
import ExpandableText from "./components/ExpandableText";
import PalettePicker from "./components/PalettePicker";
import WorkspaceTools,{type WorkspaceToolGroup} from "./components/WorkspaceTools";
import WorkspaceStatus from "./components/WorkspaceStatus";
import WorkspaceConnection from "./components/WorkspaceConnection";
import {workspaceConnectionState} from "./hooks/workspace-connection";
import ContextPanel from './components/ContextPanel';
import NewAppOptions from './components/NewAppOptions';
import DataManagementPanel from './components/DataManagementPanel';
import {LOCAL_DATA_EVENT,clearWorkspaceDraftStorage,resetWorkspaceDisplayStorage,usageAlertStorageKey,parseUsageAlerts,showUsageAlert,DEFAULT_USAGE_ALERTS,type UsageAlertPreferences} from '@/lib/motes/local-data';
import type {UsageSnapshot} from '@/lib/motes/usage';
import PublicationPanel from './components/PublicationPanel';
import WorkspaceBackupPanel from './components/WorkspaceBackupPanel';
import AppTemplateLibrary from './components/AppTemplateLibrary';
import VersionConfigPanel from './components/VersionConfigPanel';
import StylePresetPanel from './components/StylePresetPanel';
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
import { ELEMENT_PROTOCOL,elementCollector,type ElementContext } from '@/lib/motes/element-selection';
import { runtimePreview } from "@/lib/motes/runtime-preview";
import { diagnosticCollector, runtimeRepairRequest, type RuntimeDiagnostic } from "@/lib/motes/runtime-diagnostics";
import { RuntimeErrorPanel, RuntimeRepairDialog } from "./components/RuntimeErrorPanel";
import RuntimeDataBridge from "./components/RuntimeDataBridge";
import type { Version, Project, Summary } from "@/lib/forma/types";
import DiscussionPane, { IntentSwitch, IntentQuestion } from "./components/DiscussionPane";
import { useWorkspaceDraft } from "./hooks/useWorkspaceDraft";
import { suggestDiscussion } from "@/lib/motes/discussion-intent";
import { useAttemptRecovery } from "./hooks/useAttemptRecovery";
import { contextKey, draftAfterSend, failOriginalAttempt, matchesContext, preferSavedProject, prepareRecoveryRetry, removeFinishedAttempt, restoredAttempts } from "@/lib/motes/recovery-state";
import type { RecoveryAttempt } from "@/lib/motes/recovery-state";
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Code2, Download, Eye, Globe2, History, Layers3, LoaderCircle, MessageSquare, Monitor, Plus, RotateCcw, Smartphone, Sparkles, X } from "lucide-react";

type Session = { workspaceId: string; mode: "demo" | "model"; model: string | null; persistence: "cloud"; projects: Summary[]; visibility?: "shared" | "private" };
type QuotaLimit = { used:number; remaining:number; limit:number };
type UsageLayerLimits = Record<'visitor'|'shared'|'global',Record<'model'|'demo',QuotaLimit>>;
type WorkbenchUsageSnapshot = UsageSnapshot & { limits?:UsageLayerLimits };
type Attempt = RecoveryAttempt;
const examples = [
  { icon: "✈", title: "旅行预算规划", tag: "让每一程都心中有数", prompt: "帮我做一个旅行预算规划工具，可以添加交通、住宿和餐饮支出，设置预算上限。", color: "peach" },
  { icon: "▦", title: "轻量任务看板", tag: "把想法变成下一步行动", prompt: "帮我做一个任务看板，可以添加任务，在待办、进行中和已完成之间移动。", color: "lavender" },
  { icon: "◷", title: "专注番茄钟", tag: "给专注留一点空间", prompt: "帮我做一个番茄钟，支持专注倒计时、暂停和重新开始。", color: "mint" },
] as const;
class ApiError extends Error { constructor(message: string, public status: number, public retry?: "new") { super(message); } }
async function api<T>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
  const readSignal=body?signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  const response = await offlineFetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal } : { cache: "no-store", signal:readSignal });
  const data = await response.json().catch(() => ({ error: hostText("服务暂时没有返回有效结果，请重试。") })) as T & { error?: string; retry?: "new" };
  if (!response.ok) throw new ApiError(data.error || hostText("暂时无法完成，请稍后重试。"), response.status, data.retry);
  return data;
}
function Logo({ small = false }: { small?: boolean }) { return <span className={`forma-logo ${small ? "small" : ""}`}><span className="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="2.5"/><circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="3"/></svg></span>{!small && <span>motes<span className="brand-dot">.</span></span>}</span>; }
function dateLabel(value: string, locale: string) { return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" }); }

export default function Home() {
  const {locale,t}=useHostLocale();
  const router=useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [connectionError,setConnectionError]=useState(""),[revealedWorkspaceId,setRevealedWorkspaceId]=useState<string|null>(null);
  const [projects, setProjects] = useState<Summary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const currentAppRef=useRef<string|undefined>(undefined);
  useLayoutEffect(()=>{currentAppRef.current=project?.id;},[project?.id]);
  const [creationTarget, setCreationTarget] = useState<{ id: string; name: string } | null>(null);
  const [creationContextId, setCreationContextId] = useState<string | undefined>();
  const [recoveryGeneration, setRecoveryGeneration] = useState(0);
  const [recoveryPaused, setRecoveryPaused] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const offline=useOfflineWorkspace(workspaceId);
  const layout=useWorkbenchLayout(workspaceId,true);
  const {ref:previewScrollRef,onScroll:rememberPreviewScroll}=usePanelScrollMemory(workspaceId,project?.id??null,'preview');
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
  const [workspaceBackup,setWorkspaceBackup]=useState<WorkspaceSnapshot|null>(null),[backupLoading,setBackupLoading]=useState(false);
  const [newAppOptions,setNewAppOptions]=useState(false),[dataManagement,setDataManagement]=useState(false);
  const seedAttempt=useRef<{fingerprint:string;requestId:string}|null>(null),usageEpoch=useRef(0);
  const [usageRefresh,setUsageRefresh]=useState(0);
  const [usageSnapshot,setUsageSnapshot]=useState<WorkbenchUsageSnapshot|null>(null),[usageAlerts,setUsageAlerts]=useState<UsageAlertPreferences>(DEFAULT_USAGE_ALERTS);
  const [publicationOpen,setPublicationOpen]=useState(false);
  const [appTemplatesOpen,setAppTemplatesOpen]=useState(false);
  const [versionConfig,setVersionConfig]=useState<{appId:string;versionId:string}|null>(null);
  const [styleBase,setStyleBase]=useState<{appId:string;baseVersionId:string;expectedCurrentVersionId:string;html:string}|null>(null);
  const styleAttempt=useRef<{fingerprint:string;requestId:string}|null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateChoice, setTemplateChoice] = useState<{ name: string; prompt: string } | undefined>();
  const [singleBusy, setBusy] = useState(false);
  const [savingAttemptId,setSavingAttemptId]=useState<string|null>(null),[buildReceiptId,setBuildReceiptId]=useState<string|null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"demo" | "model">("demo");
  const [candidateMode,setCandidateMode]=useState<'single'|'race'>('single');
  const [candidateCount,setCandidateCount]=useState<2|3|4>(2);
  const [raceConfirmed,setRaceConfirmed]=useState(false),[raceConfirmationOpen,setRaceConfirmationOpen]=useState(false);
  const raceScope=JSON.stringify([workspaceId??'pending',project?.id??null,creationTarget?.id??null,project?null:creationContextId??'default']);
  const race=useInlineRace(raceScope);
  const [racePreviewChoice,setRacePreviewChoice]=useState<RacePreviewChoice|null>(null);
  const [newRaceRoundFor,setNewRaceRoundFor]=useState<string|null>(null);
  const raceView=racePresentation(race.state,raceScope,racePreviewChoice,project?.id);
  const raceScopeRef=useRef(raceScope);
  const raceChoiceTouched=useRef<string|null>(null),restoredRaceChoice=useRef<string|null>(null);
  useEffect(()=>{
    if(race.state.restoring||restoredRaceChoice.current===raceScope)return;
    restoredRaceChoice.current=raceScope;
    if(raceChoiceTouched.current===raceScope)return;
    const count=race.state.group?.count||race.state.pending?.count;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore the composer selection once from the externally persisted scoped request.
    setCandidateMode(count?'race':'single');if(count)setCandidateCount(count);
  },[raceScope,race.state.restoring,race.state.group?.count,race.state.pending?.count]);
  useLayoutEffect(()=>{raceScopeRef.current=raceScope;},[raceScope]);
  const busy=singleBusy||race.state.busy;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Invalidate paid consent when the externally selected creation context changes.
  useEffect(()=>{setRaceConfirmed(false);setRaceConfirmationOpen(false)},[candidateCount,mode,raceScope]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- The external offline connection cannot execute paid creation.
  useEffect(()=>{if(offline.status==='offline'){setMode('demo');setCandidateMode('single');}},[offline.status]);
  const [preferences, setPreferences] = useState<Preferences>({ creationMode: "demo", previewDevice: "desktop", autoFollow: true, showWaitTimer: true, language: "zh-CN", visualStyle: "minimal" });
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [loadedPreferenceScope,setLoadedPreferenceScope]=useState<string|null>(null),[preferencesError,setPreferencesError]=useState(""),[preferencesReload,setPreferencesReload]=useState(0);
  const preferenceScope=(session?.workspaceId??"pending")+":"+(project?.id??creationTarget?.id??"workspace");
  const connection=workspaceConnectionState({workspaceId,revealedWorkspaceId,sessionAvailable:!!session,sessionLoading,preferencesLoading,preferenceScope,loadedPreferenceScope,preferencesError});
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Reveal external workspace data only after identity and this exact preference scope are verified.
  useLayoutEffect(()=>{if(connection.ready&&workspaceId)setRevealedWorkspaceId(workspaceId);},[connection.ready,workspaceId]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pane, setPane] = useState<"chat" | "preview">("preview");
  const [history, setHistory] = useState(false);
  const [source, setSource] = useState(false);
  const [editorVersionId, setEditorVersionId] = useState<string | null>(null);
  const [viewVersion, setViewVersion] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [sidebar, setSidebar] = useState(false);
  const operationLock = useRef(false);
  const operationEpoch = useRef(0), activeOperation = useRef<string | null>(null), mounted = useRef(true), activeFetch = useRef<AbortController | null>(null), activeAttempt = useRef<Attempt|null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [notice, setNotice] = useState("");
  const [outcome,setOutcome]=useState<WorkspaceOutcome|null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selectingElement,setSelectingElement]=useState(false),[selectedElement,setSelectedElement]=useState<ElementContext|null>(null);
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeDiagnostic[]>([]);
  const [repairCandidate, setRepairCandidate] = useState<string | null>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const followChat = useRef(true);
  const outboxReady = useRef(false);
  const recoveryContext = { projectId: project?.id, managedProjectId: project ? undefined : creationTarget?.id, contextId: project ? undefined : creationContextId };
  const visibleAttempts = attempts.filter(a => matchesContext(a, recoveryContext));
  const workspace = raceView.workbench || !!project || visibleAttempts.length > 0 || intent === "discuss" || preDiscussionActive;
  const current = project?.versions.find(v => v.id === project.currentVersionId) || project?.versions.at(-1);
  const displayed = project?.versions.find(v => v.id === viewVersion) || current;
  const displayedId = raceView.showCandidate?undefined:displayed?.id;
  const diagnosticScope = useMemo(() => {
    if (!displayedId) return null;
    const channel = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
    return { channel, collector: diagnosticCollector(channel),selection:elementCollector(channel) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- App switches and explicit iframe refreshes require a fresh channel even if the immutable version ID is unchanged.
  }, [project?.id, displayedId, refresh]);
  const candidateSrcDoc=useMemo(()=>typeof window!=="undefined"&&raceView.candidate?.html?safeDocument(raceView.candidate.html,PREVIEW_POLICY):"",[raceView.candidate?.html]);
  const hasPreview=raceView.showCandidate?!!raceView.candidate?.html:!!displayed;
  const srcDoc = useMemo(() => displayed && diagnosticScope && typeof window !== "undefined" ? runtimePreview(displayed.html, diagnosticScope.channel, window.location.origin) : "", [displayed, diagnosticScope]);
  const previewDocument=raceView.showCandidate?candidateSrcDoc:srcDoc;
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the previous frame's reports before a new iframe can post messages.
    setRuntimeErrors([]); setRepairCandidate(null);setSelectingElement(false);setSelectedElement(null);
    if (!diagnosticScope) return;
    const receive = (event: MessageEvent) => { const report = diagnosticScope.collector.accept(event, previewFrame.current?.contentWindow, Date.now()); if (report) setRuntimeErrors(previous => [...previous, report]);const selection=diagnosticScope.selection.accept(event,previewFrame.current?.contentWindow,Date.now());if(selection){if(selection.kind==='selected'&&displayedId)setSelectedElement({baseVersionId:displayedId,selector:selection.selector,tag:selection.tag});else{setSelectedElement(null);setSelectingElement(false);if(selection.kind==='invalidated')setNotice(hostText("原元素定位已失效，请在当前预览中重新选择。"));}} };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [diagnosticScope,displayedId]);
  useEffect(()=>{if(!diagnosticScope)return;previewFrame.current?.contentWindow?.postMessage({protocol:ELEMENT_PROTOCOL,channel:diagnosticScope.channel,kind:'control',enabled:selectingElement},'*');},[diagnosticScope,selectingElement]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore only this workspace's external local preference before paint.
  useLayoutEffect(()=>{try{setUsageAlerts(workspaceId?parseUsageAlerts(localStorage.getItem(usageAlertStorageKey(workspaceId))):{...DEFAULT_USAGE_ALERTS});}catch{setUsageAlerts({...DEFAULT_USAGE_ALERTS});}},[workspaceId]);
  useEffect(()=>{usageEpoch.current++;if(!workspaceId||busy||discussionBusy)return;const request=usageEpoch.current;void api<WorkbenchUsageSnapshot>('/api/usage').then(value=>{if(request===usageEpoch.current&&workspaceRef.current===workspaceId)setUsageSnapshot(value);}).catch(()=>{if(request===usageEpoch.current)setUsageSnapshot(null);});},[workspaceId,busy,discussionBusy,usageRefresh]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const recovery = useAttemptRecovery({attempts,context:recoveryContext,generation:recoveryGeneration,
    enabled:!!session && intent === "build" && !questionChoice && !sessionLoading && !busy && !opening && !recoveryPaused,
    isCurrentGeneration:epoch=>mounted.current && operationEpoch.current===epoch,
    onRecovered:async(attempt,receipt,guard)=>{
      if(!guard.isCurrent() || !matchesContext(attempt,recoveryContext))return;
      const result=await api<{project:Project}>(`/api/projects/${encodeURIComponent(receipt.projectId)}`,undefined,guard.signal);
      if(!guard.isCurrent() || !mounted.current || !matchesContext(attempt,recoveryContext))return;
      if(!result.project.versions.some(v=>v.id===receipt.resultVersionId))throw new Error(t("已保存版本暂未完整返回，请稍后核对。"));
      await finishRecoveredView({isCurrent:guard.isCurrent,prepare:()=>linkAdoptedDiscussion(attempt,result.project,guard.signal),apply:()=>{
        setAttempts(previous=>removeFinishedAttempt(previous,attempt));remember(result.project,true);setUsageRefresh(value=>value+1);presentSavedOutcome(result.project,"recovery");
        if(project?.id!==result.project.id)interruptRecovery();
      }});
    }});
  const unresolvedRecovery = visibleAttempts.some(a=>a.recovered && !["failed","expired"].includes(recovery.stateFor(a)?.phase??"checking"));
  function interruptRecovery() { const epoch=++operationEpoch.current;setRecoveryGeneration(epoch);return epoch; }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- This mutable operation token intentionally invalidates every outstanding callback at teardown.
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operationEpoch.current++;activeFetch.current?.abort();};},[]);
  function checkRecovery() {interruptRecovery();setRecoveryPaused(false);recovery.checkAgain();}
  function pauseRecovery(attempt:Attempt) {interruptRecovery();setRecoveryPaused(true);setNotice(attempt.mode==='demo'?t('已暂停本页示例核对；示例使用已有模板，不调用模型。'):t("已暂停本页核对；不会取消已经开始的服务端调用或费用。"));}

  async function initialize() {
    const epoch=interruptRecovery();setRecoveryPaused(false);
    setSessionLoading(true); setConnectionError("");setError("");
    try {
      const data = await api<Session>("/api/session");
      if(!mounted.current || epoch!==operationEpoch.current)return;
      if (!data.workspaceId) throw new Error(t("会话未返回草稿归属，请刷新后重试。"));
      if (workspaceRef.current && workspaceRef.current !== data.workspaceId) { setOutcome(null);setWorkspaceBackup(null);setAppTemplatesOpen(false);setPublicationOpen(false);setVersionConfig(null);setStyleBase(null);setEditorVersionId(null);setSource(false);setHistory(false);setTemplatesOpen(false);setQuestionChoice(null);setRepairCandidate(null);setTasksOpen(false);setTaskItems([]);setDataManagement(false);setNewAppOptions(false);seedAttempt.current=null;setUsageSnapshot(null);setProject(null); setPreDiscussionActive(false);  }
      workspaceRef.current = data.workspaceId; setWorkspaceId(data.workspaceId);
      let owned = restoredAttempts(sessionStorage.getItem("motes-outbox:" + data.workspaceId));
      if (!owned.length) { const legacy = restoredAttempts(sessionStorage.getItem("motes-outbox")).slice(-10); const checked = await Promise.allSettled(legacy.map(async a => { const receipt = await api<{requestId:string;status:string}>("/api/requests/" + encodeURIComponent(a.requestId)); if(receipt.requestId!==a.requestId||!["running","done","failed","expired","save_pending"].includes(receipt.status))throw new Error(t("旧请求归属尚未确认")); return a; })); owned = checked.flatMap(r => r.status === "fulfilled" ? [r.value] : []); }
      if (!mounted.current || epoch !== operationEpoch.current) return;
      setAttempts(owned); try { sessionStorage.setItem("motes-outbox:" + data.workspaceId, JSON.stringify(owned)); const savedIntent=localStorage.getItem("motes-intent:"+data.workspaceId); setIntent(savedIntent === "discuss" ? "discuss" : "build");setPreDiscussionActive(localStorage.getItem("motes-pre-active:"+data.workspaceId)==="true"); } catch {}
      setProjects(data.projects); setMode(data.mode);
      const context = new URLSearchParams(window.location.search), targetId = context.get("managedProjectId");
      if (targetId !== null) {
        const snapshot = await api<WorkspaceSnapshot>("/api/workspace?listOnly=true");
        if(!mounted.current || epoch!==operationEpoch.current)return;
        const target = snapshot.projects.find(p => p.id === targetId && !p.archived);
        if (!target) throw new Error(t("目标项目不存在或已归档，请返回应用管理重新选择。"));
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
    } catch (e) { if(mounted.current && epoch===operationEpoch.current){setSession(null);setConnectionError(e instanceof Error ? e.message : t("初始化失败，请重试。"));} }
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
    setPreferencesLoading(true);setPreferencesError("");
    void api<SettingsSnapshot>("/api/settings" + (project?.id ? "?appId=" + encodeURIComponent(project.id) : creationTarget?.id ? "?projectId=" + encodeURIComponent(creationTarget.id) : "")).then(data => { if (!current) return; setPreferences(data.effective); setDevice(data.effective.previewDevice); setMode(data.effective.creationMode);setLoadedPreferenceScope(preferenceScope); }).catch(e => { if (current) setPreferencesError(e instanceof Error ? e.message : hostText("请重试。")); }).finally(() => { if (current) setPreferencesLoading(false); });
    return () => { current = false; };
  }, [session, sessionLoading,project?.id, creationTarget?.id,preferenceScope,preferencesReload]);
  useEffect(() => { if (!workspaceId) return; if (!outboxReady.current) { outboxReady.current = true; return; } try { sessionStorage.setItem("motes-outbox:" + workspaceId, JSON.stringify(attempts)); } catch {} }, [attempts, workspaceId]);
  useEffect(() => { if (preferences.autoFollow && followChat.current) chatEnd.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); }, [project?.versions.length, attempts, pane, preferences.autoFollow]);
  useEffect(() => { if (!busy || !preferences.showWaitTimer) return; const timer = setInterval(() => setElapsed(n => n + 1), 1000); return () => clearInterval(timer); }, [busy, preferences.showWaitTimer]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setSource(false); setHistory(false); setSidebar(false); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  function presentSavedOutcome(next:Project,source:Exclude<WorkspaceOutcome['source'],'import'>){
    const id=workspaceId,version=next.versions.find(item=>item.id===next.currentVersionId);if(!mounted.current||!id||workspaceRef.current!==id||!version)return;
    setOutcome({workspaceId:id,appId:next.id,versionId:version.id,versionNumber:version.number,source});setNotice('');
  }
  function viewOutcome(){
    if(!outcome||workspaceRef.current!==outcome.workspaceId||busy||discussionBusy||opening)return;
    if(outcome.source==='import'){if(outcome.appId)void openProject(outcome.appId);else router.push('/manage');return;}
    if(project?.id!==outcome.appId||!project.versions.some(version=>version.id===outcome.versionId))return;
    setViewVersion(outcome.versionId===project.currentVersionId?null:outcome.versionId??null);setPane('preview');
  }
  function remember(next: Project, preserveView=false,source:'result'|'navigation'='result') {
    setCreationTarget(null); const url = new URL(window.location.href); url.searchParams.delete("new"); url.searchParams.delete("managedProjectId"); window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (transferCreationDraft(!!project,source)) buildDraft.transfer("app:" + next.id);
    setProject(previous=>preferSavedProject(previous,next)); if(!preserveView)setViewVersion(null);
    try { localStorage.setItem("forma-current-project", next.id); sessionStorage.removeItem("motes-new-context:" + workspaceRef.current); } catch {}
    setProjects(previous => [{ id: next.id, title: next.title, createdAt: next.createdAt, updatedAt: next.updatedAt, currentVersionId: next.currentVersionId }, ...previous.filter(p => p.id !== next.id)]);
  }
  async function openProject(id: string) {
    if (busy || discussionBusy || opening || sessionLoading) return;
    const epoch=interruptRecovery();setRecoveryPaused(false);
    setOpening(true); setError("");
    try { const result = await api<{ project: Project }>(`/api/projects/${id}`); if(!mounted.current || epoch!==operationEpoch.current)return;remember(result.project,false,"navigation");setOutcome(null); setSidebar(false); setHistory(false); setSource(false); setMode(result.project.versions.find(v => v.id === result.project.currentVersionId)?.mode === "demo" ? "demo" : session?.mode || "demo"); }
    catch (e) { if(mounted.current && epoch===operationEpoch.current)setError(e instanceof Error ? e.message : t("项目加载失败。")); }
    finally { if(mounted.current && epoch===operationEpoch.current)setOpening(false); }
  }
  function newProject() { if (busy || discussionBusy || opening || sessionLoading) return; interruptRecovery();setRecoveryPaused(false);const nextContext=crypto.randomUUID();setCreationContextId(nextContext);const recovered=visibleAttempts.filter(a=>a.recovered);setNotice(recovered.some(a=>a.mode==='model')?t("已切换到新建应用；停止本页等待不会取消服务端调用或费用。"):recovered.length?t('已切换到新建应用；原示例可继续按编号核对，不调用模型。'):"");setProject(null);setOpening(false);setPreDiscussionActive(false);setDiscussionReset(value=>value+1);setIntent("build");setOutcome(null);try{if(workspaceId){localStorage.setItem("motes-pre-active:"+workspaceId,"false");localStorage.setItem("motes-intent:"+workspaceId,"build")}}catch{}setError("");setViewVersion(null);setHistory(false);setSidebar(false);try{localStorage.removeItem("forma-current-project");sessionStorage.setItem("motes-new-context:" + workspaceRef.current,JSON.stringify({managedProjectId:creationTarget?.id??null,contextId:nextContext}));}catch{} }
  async function createNewPrivateApp(kind:'empty'|'budget'|'kanban'|'timer'){
    if(operationLock.current||busy||discussionBusy||opening||!workspaceId)throw new Error(t("请等待当前操作完成，再创建新副本。"));
    const fingerprint=JSON.stringify([kind,creationTarget?.id??null]);if(seedAttempt.current?.fingerprint!==fingerprint)seedAttempt.current={fingerprint,requestId:crypto.randomUUID()};
    const epoch=interruptRecovery(),operation=crypto.randomUUID();activeOperation.current=operation;operationLock.current=true;setBusy(true);
    try{const result=await api<{project:Project}>('/api/apps/seed',{requestId:seedAttempt.current.requestId,kind,...creationTarget?{managedProjectId:creationTarget.id}:{}},AbortSignal.timeout(30000));if(!mounted.current||epoch!==operationEpoch.current||activeOperation.current!==operation)return;seedAttempt.current=null;if(!adoptSavedProject(result.project))return;setMode(kind==='empty'?session?.mode??'demo':'demo');setNewAppOptions(false);presentSavedOutcome(result.project,"seed");}
    finally{if(activeOperation.current===operation){activeOperation.current=null;operationLock.current=false;setBusy(false);}}
  }
  async function clearLocalDrafts(){if(!workspaceId||workspaceRef.current!==workspaceId)throw new Error(t("当前空间归属尚未确认。"));clearWorkspaceDraftStorage(localStorage,sessionStorage,workspaceId);window.dispatchEvent(new CustomEvent(LOCAL_DATA_EVENT,{detail:{workspaceId,scope:'drafts'}}));}
  async function resetLocalDisplay(){if(!workspaceId||workspaceRef.current!==workspaceId)throw new Error(t("当前空间归属尚未确认。"));resetWorkspaceDisplayStorage(localStorage,workspaceId);window.dispatchEvent(new CustomEvent(LOCAL_DATA_EVENT,{detail:{workspaceId,scope:'display'}}));}
  function changeUsageAlertPreference(next:UsageAlertPreferences){if(!workspaceId||typeof next.enabled!=='boolean'||!Number.isInteger(next.threshold)||next.threshold<0||next.threshold>10)return;setUsageAlerts(next);try{localStorage.setItem(usageAlertStorageKey(workspaceId),JSON.stringify({schemaVersion:1,...next}));}catch{setNotice(t("额度提醒偏好仅在本页生效，浏览器存储暂不可用。"));}}
  async function openWorkspaceBackup(){if(backupLoading||busy||discussionBusy||opening)return;const scope=workspaceRef.current;setBackupLoading(true);try{const snapshot=await api<WorkspaceSnapshot>('/api/workspace?archived=all');if(workspaceRef.current!==scope||snapshot.workspace.id!==scope)return;setWorkspaceBackup(snapshot);}catch(e){setError(e instanceof Error?e.message:t("读取备份范围失败。"));}finally{setBackupLoading(false);}}
  async function refreshProjectList(){const scope=workspaceRef.current;try{const data=await api<Session>('/api/session');if(workspaceRef.current===scope&&data.workspaceId===scope)setProjects(data.projects);}catch{setNotice(t("导入内容已保存，应用列表暂未刷新；可前往应用管理查看。"));}}
  async function finishOfflineSync(){
    const scope=workspaceId,appId=project?.id;
    const owned=()=>workspaceCallbackCurrent({mounted:mounted.current,expectedWorkspace:scope,currentWorkspace:workspaceRef.current});
    if(!owned()||!scope)return;
    const mapped=appId?await readOfflineProject(scope,appId).catch(()=>undefined):undefined;
    if(!owned())return;
    if(mapped&&currentAppRef.current===appId){if(mapped.id!==appId){buildDraft.transfer('app:'+mapped.id);setProjects(previous=>previous.filter(item=>item.id!==appId));}remember(mapped,true,'navigation');}
    setNotice(locale==='en'?'Local changes synced to the public workspace.':'本地更改已同步到公共空间。');
    void refreshProjectList();
  }
  async function loadTasks(){const scope=workspaceRef.current;setTasksBusy(true);try{const result=await api<{items:TaskCenterItem[]}>('/api/tasks');if(workspaceRef.current!==scope)return;setTaskItems(result.items);setUsageRefresh(value=>value+1);}catch(e){setTasksOpen(false);setError(e instanceof Error?e.message:t("读取任务失败。"));}finally{setTasksBusy(false);}}
  async function saveTask(requestId:string){if(operationLock.current||discussionBusy||opening)return;operationLock.current=true;setBusy(true);setTasksBusy(true);try{const result=await api<{project?:Project}>('/api/tasks/'+encodeURIComponent(requestId)+'/save',{});const attempt=attempts.find(a=>a.requestId===requestId);if(result.project&&(result.project.id===project?.id||(attempt&&matchesContext(attempt,recoveryContext)))){remember(result.project,true);if(attempt)setAttempts(previous=>removeFinishedAttempt(previous,attempt));presentSavedOutcome(result.project,"recovery");}else setNotice(t("原结果已保存，未重新调用模型。"));await loadTasks();}catch(e){setTasksOpen(false);setError(e instanceof Error?e.message:t("保存未完成，原结果仍暂存。"));}finally{operationLock.current=false;setBusy(false);setTasksBusy(false);}}
  function refreshPreview(){if(window.confirm(t("刷新会清空预览中未保存的临时输入，已保存版本不受影响。")))setRefresh(n=>n+1);}
  async function fullscreenPreview(){try{if(document.fullscreenElement)await document.exitFullscreen();else await previewSurface.current?.requestFullscreen();}catch{setNotice(t("当前浏览器未允许全屏，可继续调整预览宽度。"));}}
  async function applyStyle(candidateHtml:string,name:string){
    if(!styleBase||project?.id!==styleBase.appId||project.currentVersionId!==styleBase.expectedCurrentVersionId)throw new Error(t("当前应用或版本已变化，请保留预设并重新核对基准。"));
    if(operationLock.current||discussionBusy||opening)throw new Error(t("请等待当前操作完成，预设仍保留。"));
    const fingerprint=JSON.stringify([styleBase.appId,styleBase.baseVersionId,styleBase.expectedCurrentVersionId,candidateHtml,name]);if(styleAttempt.current?.fingerprint!==fingerprint)styleAttempt.current={fingerprint,requestId:crypto.randomUUID()};
    operationLock.current=true;setBusy(true);
    try{const result=await api<{project:Project}>('/api/projects/'+encodeURIComponent(styleBase.appId)+'/source',{baseVersionId:styleBase.baseVersionId,expectedCurrentVersionId:styleBase.expectedCurrentVersionId,html:candidateHtml,name,requestId:styleAttempt.current.requestId},AbortSignal.timeout(30000));if(!adoptSavedProject(result.project))return;setViewVersion(null);presentSavedOutcome(result.project,"manual");}
    finally{operationLock.current=false;setBusy(false);}
  }
  async function saveAttempt(a:Attempt){
    if(operationLock.current||opening||discussionBusy)return;
    const epoch=interruptRecovery();operationLock.current=true;setBusy(true);setSavingAttemptId(a.requestId);setError('');
    try{const result=await api<{project:Project}>('/api/tasks/'+encodeURIComponent(a.requestId)+'/save',{});if(!mounted.current||epoch!==operationEpoch.current)return;remember(result.project,true);setAttempts(previous=>removeFinishedAttempt(previous,a));presentSavedOutcome(result.project,"recovery");}
    catch(e){if(mounted.current&&epoch===operationEpoch.current)setError(e instanceof Error?e.message:t("保存暂未完成，原结果仍保留。"));}
    finally{operationLock.current=false;if(mounted.current){setBusy(false);setSavingAttemptId(null);}}
  }
  function stopBuildWaiting(attempt:Attempt){
    if(activeAttempt.current?.requestId!==attempt.requestId||!activeOperation.current)return;
    interruptRecovery();setRecoveryPaused(true);const controller=activeFetch.current;activeFetch.current=null;activeAttempt.current=null;activeOperation.current=null;operationLock.current=false;controller?.abort();
    const stopCopy=attempt.mode==='demo'?t('已停止本页示例等待；示例使用已有模板，不调用模型。原需求和草稿已保留。'):t("已停止本页等待；服务端执行及费用是否停止尚未确认，请仅核对原请求。");
    const noticeCopy=attempt.mode==='demo'?t('示例使用已有模板，不调用模型。原请求和草稿已保留；请仅核对原请求。'):t("已停止本页等待，原请求和草稿已保留。服务端可能继续执行并收费；核对原结果前不会重复生成。");
    setAttempts(previous=>failOriginalAttempt(previous,attempt,stopCopy));setBusy(false);setNotice(noticeCopy);
  }
  async function generate(value = prompt, retry?: Attempt, confirmedQuestion = false) {
    if (race.controller.blocked) return;
    if(!retry&&!project&&race.state?.group&&newRaceRoundFor!==raceView.key){setNotice(locale==='en'?'Adopt the selected candidate before editing it, or explicitly choose a new independent round.':'请先采用所选方案，再继续修改；如需独立比较，请点击“另起新轮”。');return;}
    if (!retry && candidateMode === 'race') {
      if(!session||!workspaceId||sessionLoading||discussionBusy||!connection.ready||operationLock.current||opening||unresolvedRecovery||offline.status==='offline'||!value.trim()||value.length>4000)return;
      if(mode==='model'&&!raceConfirmed){setRaceConfirmationOpen(true);return;}
      setPane('preview');setOutcome(null);
      const accepted=await race.controller.start({prompt:value.trim(),mode,...mode==='model'?{model:preferences.model||session.model||undefined}:{},...project?{appId:project.id,baseVersionId:project.currentVersionId}:creationTarget?{managedProjectId:creationTarget.id}:{},count:candidateCount,confirmCalls:candidateCount},()=>{if(raceScopeRef.current===raceScope){setPrompt(current=>draftAfterSend(current,value.trim(),false));setPane('preview');setHistory(false);}});
      if(accepted&&raceScopeRef.current===raceScope){setRaceConfirmed(false);setRaceConfirmationOpen(false);}
      return;
    }
    if (value.length > 4000) { setError(t("构建需求最多 4000 字，请先精简草稿。")); return; }
    if (!session || !workspaceId || sessionLoading || discussionBusy || !connection.ready || operationLock.current || opening || !value.trim()) return;
    if (!retry && !confirmedQuestion && suggestDiscussion(value)) { setQuestionChoice(value); return; }
    if(!retry && unresolvedRecovery){setNotice(t("请先核对原请求结果，或重试原消息；当前草稿会保留。"));return;}
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
      attempt={id:crypto.randomUUID(),requestId:crypto.randomUUID(),text:value.trim(),projectId:project?.id,managedProjectId:project?undefined:creationTarget?.id,contextId:draftContext,baseVersionId:project?.currentVersionId,...mode==="model"&&selectedElement&&displayed?.id===project?.currentVersionId&&selectedElement.baseVersionId===project?.currentVersionId?{elementContext:selectedElement}:{},mode,state:"sending",startedAt:Date.now()};
    }
    const epoch=interruptRecovery(),operation=crypto.randomUUID(),controller=new AbortController();
    activeOperation.current=operation;activeFetch.current=controller;activeAttempt.current=attempt;setRecoveryPaused(false);
    operationLock.current = true; setBusy(true);setBuildReceiptId(null);setOutcome(null); setElapsed(0); setPrompt(current=>draftAfterSend(current,attempt.text,!!retry)); setError(""); setNotice(""); setPane("chat"); followChat.current = true;
    const nextAttempts=retry?attempts.map(a=>a.id===attempt.id?attempt:a):[...attempts,attempt];setAttempts(nextAttempts);
    // Record the original ID before sending, even if the tab refreshes before
    // React's outbox effect has run. A retry never consumes the next draft.
    try{sessionStorage.setItem("motes-outbox:" + workspaceRef.current,JSON.stringify(nextAttempts));}catch{}
    try {
      const result = await api<{ project: Project }>("/api/generate", { prompt: attempt.text, projectId: attempt.projectId, managedProjectId: attempt.managedProjectId, baseVersionId: attempt.baseVersionId, mode: attempt.mode, requestId: attempt.requestId,elementContext:attempt.elementContext },controller.signal);
      if(!mounted.current || epoch!==operationEpoch.current || activeOperation.current!==operation)return;
      setBuildReceiptId(attempt.requestId);
      const linkNote = await linkAdoptedDiscussion(attempt,result.project,controller.signal);
      if(!mounted.current || epoch!==operationEpoch.current || activeOperation.current!==operation)return;
      remember(result.project);setRacePreviewChoice({key:raceView.key,slot:null}); setAttempts(previous=>removeFinishedAttempt(previous,attempt));presentSavedOutcome(result.project,"build");if(linkNote)setNotice(linkNote);
    } catch (e) {
      const message = e instanceof Error ? e.message : t("连接中断，请重试。");
      const confirmed=e instanceof ApiError && (e.retry==="new" || (e.status>=400 && e.status<500 && e.status!==409));
      if(mounted.current&&epoch===operationEpoch.current&&activeOperation.current===operation)setAttempts(previous=>failOriginalAttempt(previous,attempt,message,confirmed));
    } finally {
      if(activeFetch.current===controller)activeFetch.current=null;
      if(mounted.current && activeOperation.current===operation){activeOperation.current=null;activeAttempt.current=null;operationLock.current=false;setBusy(false);if(epoch===operationEpoch.current)textarea.current?.focus({preventScroll:true});}
    }
  }
  async function restore(versionId: string) {
    if (!project || operationLock.current) return;
    if(unresolvedRecovery){setNotice(t("请先核对原请求的保存结果，再还原历史版本。"));return;}
    const epoch=interruptRecovery(),operation=crypto.randomUUID();activeOperation.current=operation;
    operationLock.current = true; setBusy(true); setError("");
    try { const result = await api<{ project: Project }>(`/api/projects/${project.id}/restore`, { versionId });if(!mounted.current || epoch!==operationEpoch.current || activeOperation.current!==operation)return;remember(result.project);setHistory(false);presentSavedOutcome(result.project,"restore"); }
    catch (e) { if(mounted.current && epoch===operationEpoch.current)setError(e instanceof Error ? e.message : t("还原失败。")); }
    finally { if(mounted.current && activeOperation.current===operation){activeOperation.current=null;operationLock.current=false;setBusy(false);} }
  }
  function adoptSavedProject(next:Project) {
    interruptRecovery();activeFetch.current?.abort();activeAttempt.current=null;activeOperation.current=null;operationLock.current=false;setBusy(false);setRecoveryPaused(false);
    setAttempts(previous=>previous.map(a=>a.state==="sending"?{...a,state:"failed",recovered:true,error:t("页面已切换，正在核对原请求保存结果。")}:a));remember(next,false,"navigation");return true;
  }
  function changeIntent(next: "build" | "discuss") {
    if (race.controller.blocked || busy || discussionBusy || opening || sessionLoading) return; interruptRecovery(); setIntent(next); setPane("chat");
    if (next === "discuss") setPreDiscussionActive(true);
    try { if (workspaceId) { localStorage.setItem("motes-intent:"+workspaceId,next); if(next==="discuss")localStorage.setItem("motes-pre-active:"+workspaceId,"true"); } } catch {}
  }
  async function linkAdoptedDiscussion(attempt: Attempt, next: Project, signal?: AbortSignal) {
    if (attempt.projectId || !workspaceRef.current || !attempt.contextId) return "";
    let threadId: string | null = null; try { threadId=sessionStorage.getItem("motes-adoption:"+workspaceRef.current+":"+attempt.contextId); } catch {}
    if (!threadId) return "";
    try { await api("/api/discussions/threads/"+encodeURIComponent(threadId)+"/attach",{appId:next.id},signal);return t("新版本已保存，所采用的构建前讨论已关联；下一条草稿保留"); }
    catch { return t("应用已保存；原构建前讨论仍保留，关联状态请稍后核对。"); }
  }
  function adoptDiscussion(text: string, placement: "replace" | "append", threadId: string) {
    const next=composeTemplateDraft(prompt,text,placement); setPrompt(next); if(!project)buildDraft.writeTo(preDraftPrefix+threadId,next); interruptRecovery();
    if (!project) { setCreationContextId(threadId); try { if(workspaceId) { sessionStorage.setItem("motes-adoption:"+workspaceId+":"+threadId,threadId);sessionStorage.setItem("motes-new-context:"+workspaceId,JSON.stringify({managedProjectId:creationTarget?.id??null,contextId:threadId})); } } catch {} }
    changeIntent("build");setPreDiscussionActive(true);setNotice(t("讨论方向已填入构建草稿，请编辑确认后再发送；尚未生成代码。"));
    requestAnimationFrame(()=>textarea.current?.focus());
  }
  function fillRepair(text: string, placement: "replace" | "append") {
    changeIntent("build"); setPrompt(composeTemplateDraft(prompt, text, placement)); setMode("model"); setRepairCandidate(null); setNotice(t("修复需求已填入，可编辑后发送；尚未调用模型")); requestAnimationFrame(() => textarea.current?.focus());
  }
  function prepareRepair() {
    if (busy || discussionBusy || session?.mode !== "model" || !project || displayed?.id !== project.currentVersionId) return;
    const text = runtimeRepairRequest(runtimeErrors); if (prompt.trim()) setRepairCandidate(text); else fillRepair(text, "replace");
  }
  function fillTemplate(text: string, placement: "replace" | "append") {
    setPrompt(composeTemplateDraft(prompt, text, placement)); setTemplatesOpen(false); setTemplateChoice(undefined); setNotice(t("模板已填入，可编辑后发送；尚未生成应用")); requestAnimationFrame(() => textarea.current?.focus());
  }
  function chooseInspiration(item: { title: string; prompt: string }) {
    if (prompt.trim()) { setTemplateChoice({ name: item.title, prompt: item.prompt }); setTemplatesOpen(true); } else fillTemplate(item.prompt, "replace");
  }
  function exportVersion(version: Version) {
    const url = URL.createObjectURL(new Blob([version.html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${project?.title.replace(/[\\/:*?"<>|]/g, "_") || "forma-app"}.html`; anchor.click(); setNotice(t("HTML 已导出")); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function download() { if (displayed) exportVersion(displayed); }
  const versionMessage = (v: Version) => <div className="conversation-pair" key={v.id}><div className="user-message">{v.prompt}</div><div className="assistant-message"><span className="assistant-avatar"><Sparkles size={14}/></span><div><div className="message-author">Motes <span>{v.mode === "manual" ? t("手工编辑") : v.mode === "demo" ? t("示例模式") : v.model || "AI"}</span></div><p>{v.summary}</p><ArtifactCard versionNumber={v.number} name={v.name || t("应用已更新")} important={!!v.important} current={v.id===current?.id} viewing={displayed?.id===v.id} historical={v.id!==current?.id} mode={v.mode} date={v.createdAt} disabled={opening} onPreview={()=>{setViewVersion(v.id===current?.id?null:v.id);setPane("preview");}} onSource={()=>{setSource(false);setHistory(false);setEditorVersionId(v.id);}} onHistory={()=>{setHistory(true);setPane("preview");}} onExport={()=>exportVersion(v)}/></div></div></div>;
  const attemptMessage = (a: Attempt) => {
    const status=a.recovered?recovery.stateFor(a):undefined;
    const saveOnly=status?.phase==='save_pending',saving=savingAttemptId===a.requestId;
    const terminal=!!status&&['failed','expired','not-found'].includes(status.phase);
    const checking=!!a.recovered&&!recoveryPaused&&(!status||['checking','running','unavailable'].includes(status.phase));
    const checkOnly=!!a.recovered&&!terminal;
    const sending=a.state==='sending',receipt=buildReceiptId===a.requestId;
    const phase=sending||saving||checking?'working':saveOnly?'save':checkOnly?'waiting':'failed';
    const title=saving?t('正在保存原结果'):sending?receipt?t('版本已保存，正在完成记录'):a.mode==='demo'?t('正在准备示例…'):t('正在构建你的应用…'):checking?t('正在核对原请求'):saveOnly?t('结果已返回，等待保存'):checkOnly?t('等待核对原结果'):status?.phase==='not-found'?t('原请求尚未登记'):t('原请求已确认失败');
    const hint=sending?(a.mode==='demo'?t('示例使用已有模板，不调用模型。'):t('仅停止本页等待，服务端可能继续执行并产生费用。')):saving||saveOnly?t('只保存已返回的结果，不会重新调用模型。'):checking||checkOnly?t('先确认原请求是否已保存，不会用新编号重复生成。'):status?.phase==='not-found'?t('继续时沿用原请求编号，避免重复发送。'):a.mode==='model'?t('再次发送可能占用一次模型额度；当前草稿保留。'):t('重新尝试示例需求，当前草稿保留。');
    const primaryLabel=saving?t('正在保存…'):sending?t('停止等待此请求'):checking?t('暂停核对'):saveOnly?t('仅重试保存'):checkOnly?t('核对原请求'):status?.phase==='not-found'?t('继续原请求（同编号）'):t('重试这条消息');
    return <div className="conversation-pair" key={a.id}><div className="user-message"><ExpandableText text={a.text}/></div><BuildAttemptFeedback phase={phase} title={title} hint={hint} requestId={a.requestId} details={homeNotice(locale,status?.message??a.error)} elapsed={sending&&preferences.showWaitTimer?elapsed:undefined} primaryLabel={primaryLabel} disabled={sending?false:busy||discussionBusy||opening} onPrimary={()=>sending?stopBuildWaiting(a):checking?pauseRecovery(a):saveOnly?void saveAttempt(a):checkOnly?checkRecovery():void generate(a.text,a)} onEdit={sending||checking?undefined:()=>{changeIntent('build');if(prompt.trim()&&prompt!==a.text){setTemplateChoice({name:t('未完成的需求'),prompt:a.text});setTemplatesOpen(true);}else{setPrompt(a.text);textarea.current?.focus();}}}/></div>;
  };
  async function openRaceApp(appId:string,versionId:string,isCurrent:()=>boolean=()=>true){
    const scope=raceScope,space=workspaceId;
    try{
      const result=await api<{project:Project}>('/api/projects/'+encodeURIComponent(appId));
      if(!isCurrent()||!mounted.current||raceScopeRef.current!==scope||workspaceRef.current!==space)return;
      if(result.project.currentVersionId!==versionId){setError(locale==='en'?'The adopted app has a newer version. Open it from app management to inspect the current version.':'已采用应用已有更新版本，请从应用管理核对当前版本。');return;}
      remember(result.project,false,'navigation');setRacePreviewChoice({key:raceView.key,slot:null});setPane('preview');setHistory(false);setSource(false);setOutcome(null);setCandidateMode('single');
      setMode(result.project.versions.find(v=>v.id===versionId)?.mode==='demo'?'demo':session?.mode||'demo');
    }catch(e){if(raceScopeRef.current===scope)setError(e instanceof Error?e.message:'无法打开已采用应用。');}
  }
  const raceResults=<RaceWorkspace controller={race.controller} state={race.state} disabled={singleBusy||discussionBusy||opening||!connection.ready} onEdit={text=>{if(prompt.trim()&&prompt!==text){setTemplateChoice({name:t("未完成的需求"),prompt:text});setTemplatesOpen(true)}else{setPrompt(text);textarea.current?.focus()}}}/>;
  const composer = (home: boolean) => <div className={`composer ${home ? "home-composer" : "chat-composer"}`}>
    {intent==='build'&&workspaceId&&<CandidateModeEntry offline={offline.status==='offline'} workspaceId={workspaceId} prompt={prompt} appId={project?.id} baseVersionId={project?.currentVersionId} managedProjectId={project?undefined:creationTarget?.id} mode={candidateMode} count={candidateCount} disabled={busy||race.blocked||discussionBusy||opening||!connection.ready||unresolvedRecovery} creationMode={mode} confirmed={raceConfirmed} confirmationOpen={raceConfirmationOpen} onConfirmedChange={setRaceConfirmed} onModeChange={next=>{raceChoiceTouched.current=raceScope;if(next!==candidateMode){setRaceConfirmed(false);setRaceConfirmationOpen(false)}setCandidateMode(next)}} onCountChange={count=>{raceChoiceTouched.current=raceScope;setCandidateCount(count)}}/>}
    {race.state.group&&<div style={{padding:"8px 16px",fontSize:12,lineHeight:1.6,color:"var(--motes-muted)"}}>{project?(locale==='en'?'The next edit uses the saved app as its base; previewing a candidate does not adopt it.':'下一次修改以原应用当前保存 v'+(current?.number??'—')+' 为基准，预览候选不会自动成为基准。'):newRaceRoundFor===raceView.key?(locale==='en'?'Your next send starts an independent round. Unadopted candidates remain in history.':'下一次发送将另起独立新轮，未采用候选保留在历史中。'):<>{locale==='en'?'Adopt the selected candidate before editing it, or start an independent round.':'当前仍是未采用候选。继续修改请先采用所选方案，或明确另起独立新轮。'} <button type="button" className="workbench-text-button" disabled={busy||opening||!connection.ready} onClick={()=>setNewRaceRoundFor(raceView.key)}>{locale==='en'?'New independent round':'另起新轮'}</button></>}</div>}
    {home&&<ContextPanel intent="build" baseVersion={null}/>}
    {buildDraft.unavailable&&<small role="status" style={{fontSize:10,color:"#ac947d"}}>{t("浏览器存储暂不可用，草稿仅在本页保留。")}</small>}
    {selectedElement&&<div className="element-context" role="status"><strong>{t("下一次修改目标：<")}{selectedElement.tag}&gt;</strong><small>{t("当前版本定位：")}{selectedElement.selector}{t("。只作为修改范围；发送后仍生成完整HTML，请检查结果。")}</small><button type="button" onClick={()=>{setSelectedElement(null);setSelectingElement(false)}}>{t("清除元素范围")}</button></div>}
    {detailed&&<RequirementBuilder draft={prompt} disabled={busy||opening||discussionBusy} onApply={fillTemplate}/>}
    <textarea ref={textarea} aria-label={home ? t("描述你想创建的应用") : t("描述修改需求")} placeholder={home ? t("描述你的想法，剩下的交给 Motes…") : t("继续描述你想调整的地方…")} value={prompt} disabled={opening || sessionLoading || !workspaceId} onChange={e => { setPrompt(e.target.value);  }} onKeyDown={e => { if (!e.nativeEvent.isComposing && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void generate(); } }}/>
    <div className="composer-footer"><span className="composer-hint"><Sparkles size={14}/>{mode === "demo" ? t("示例模式") : preferences.model || session?.model || t("AI 模式")}<span className="keyboard-hint">⌘ / Ctrl + Enter</span></span><button type="button" aria-label={t("打开需求模板库")} disabled={!session || sessionLoading || opening} style={{ background: "transparent", border: "1px solid #e0e6ef", color: "#8b9bb3", borderRadius: 6, fontSize: 11, padding: "5px 8px", marginLeft: "auto", marginRight: 10 }} onClick={() => { setTemplateChoice(undefined); setTemplatesOpen(true); }}>{t("模板")}</button><button aria-label={t("生成应用")} title={busy ? t("正在处理上一条消息") : unresolvedRecovery ? t("请先核对或重试原请求；当前草稿会保留") : t("发送需求（Ctrl / ⌘ + Enter）")} className="send-button" disabled={race.blocked || !session || sessionLoading || busy || discussionBusy || opening || !connection.ready || unresolvedRecovery || prompt.length>4000 || !prompt.trim()} onClick={() => void generate()}><ArrowUp size={19}/></button></div>
  </div>;
  const toolBusy=busy||discussionBusy||opening||!connection.ready;
  const toolReason=!connection.ready?t('请先完成连接'):toolBusy?t('当前操作完成后可用'):undefined;
  const toolGroups:WorkspaceToolGroup[]=[
    ...(detailed?[{id:'create',label:t('创作与复用'),items:[
      {id:'new-copy',label:t('空白 / 示例副本'),disabled:toolBusy,reason:toolReason,onSelect:()=>setNewAppOptions(true)},
      {id:'app-templates',label:t('应用模板'),disabled:toolBusy,reason:toolReason,onSelect:()=>setAppTemplatesOpen(true)},
      {id:'compare',label:t('比较候选'),href:'/compare',disabled:toolBusy,reason:toolReason}
    ]},{id:'versions',label:t('版本与发布'),items:[
      {id:'publication',label:t('发布管理'),disabled:toolBusy||!project,reason:toolReason||(!project?t('先打开一个已保存应用'):undefined),onSelect:()=>setPublicationOpen(true)},
      {id:'version-config',label:t('版本配置'),disabled:!project||!displayed,reason:!project?t('先打开一个已保存应用'):undefined,onSelect:()=>{if(project&&displayed)setVersionConfig({appId:project.id,versionId:displayed.id});}},
      {id:'style',label:t('设计预设'),disabled:toolBusy||!displayed||displayed.id!==project?.currentVersionId,reason:toolReason||(!displayed?t('先打开一个已保存应用'):displayed.id!==project?.currentVersionId?t('请先返回当前保存版本'):undefined),onSelect:()=>{if(!project||!displayed)return;styleAttempt.current=null;setStyleBase({appId:project.id,baseVersionId:displayed.id,expectedCurrentVersionId:project.currentVersionId,html:displayed.html});}},
      {id:'source',label:t('源码与版本比较'),disabled:!displayed,reason:!displayed?t('先打开一个已保存应用'):undefined,onSelect:()=>setSource(true)}
    ]}]:[]),
    {id:'data',label:t('任务与资料'),items:[
      {id:'tasks',label:t('任务中心'),disabled:!session||sessionLoading,reason:!session?t('请先完成连接'):undefined,onSelect:()=>{setTasksOpen(true);void loadTasks();}},
      ...(detailed?[
        {id:'backup',label:backupLoading?t('读取范围…'):t('空间备份'),disabled:toolBusy||backupLoading,reason:toolReason,onSelect:()=>void openWorkspaceBackup()},
        {id:'data',label:t('数据与提醒'),disabled:toolBusy,reason:toolReason,onSelect:()=>setDataManagement(true)}
      ]:[]),
      {id:'settings',label:t('设置'),href:'/settings'}
    ]}
  ];
  return <div className={`forma-app ${workspace ? "is-workspace" : ""} layout-${detailed?layout.mode:"split"} ${detailed&&layout.sidebarCollapsed?"sidebar-collapsed":""}`} style={{"--workbench-chat-width":layout.chatWidth+"px"} as CSSProperties}>
    <aside className={`app-sidebar ${sidebar ? "is-open" : ""}`}>
      <button className="brand-button" onClick={newProject} aria-label={t("Motes 首页")}><Logo/></button>
      <button className="new-project" onClick={newProject} disabled={busy||discussionBusy||!connection.ready}><Plus size={17}/>{t("新建应用")}</button>
      <div className="sidebar-label">{t("工作空间")}</div><button className={`nav-item ${!project ? "active" : ""}`} disabled={busy || discussionBusy || opening||!connection.ready} onClick={newProject}><Layers3 size={17}/>{t("我的应用")}<span>{connection.retained?projects.length:"—"}</span></button>
      <div className="recent-heading">{t("最近项目")}<History size={13}/></div>
      <div className="project-list" aria-busy={!connection.retained&&connection.phase==="restoring"}>{!connection.retained?<p className="empty-projects">{connection.phase==="error"?t("应用列表尚未读取"):t("正在恢复工作空间")}</p>:projects.length ? projects.map(p => <button key={p.id} disabled={busy || discussionBusy || opening} onClick={() => void openProject(p.id)} className={`project-item ${project?.id === p.id ? "selected" : ""}`}><span className="project-mini"><Globe2 size={14}/></span><span>{p.title}<small>{dateLabel(p.updatedAt,locale)}</small></span></button>) : <p className="empty-projects">{t("你的第一个想法，")}<br/>{t("会从这里开始。")}</p>}</div>
      <div className="sidebar-bottom"><div className="local-note"><span className="status-dot"/>{offline.pendingCount>0||offline.conflictCount>0?(locale==='en'?'Saved on this device · pending sync':'本机保存 · 待同步'):offline.status==='offline'?(locale==='en'?'Offline copy':'离线副本'):t("云端自动保存")}</div><div className="profile"><span className="avatar">M</span><div>{session?.visibility==='shared'?t("公共演示空间"):t("访客工作空间")}<small>{session?.visibility==='shared'?t("所有访问者都可查看和修改"):t("同一浏览器可恢复项目")}</small></div><ChevronDown size={14}/></div></div>
    </aside>
    {sidebar && <button className="sidebar-scrim" aria-label={t("关闭导航")} onClick={() => setSidebar(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" aria-label={t("打开导航")} onClick={() => setSidebar(true)}><Layers3 size={20}/></button><span>{t("工作空间")}</span><span className="slash">/</span><strong>{!connection.retained?(connection.phase==="error"?t("工作空间尚未连接"):t("正在恢复工作空间")):project?.title || (creationTarget ? creationTarget.name + t(" · 新建应用") : t("我的应用"))}</strong>{opening && <LoaderCircle size={14} className="spin"/>}</div><div className="topbar-right"><div className="workspace-primary-actions"><DisplayModeToggle value={displayMode.mode} onChange={displayMode.setMode}/><a className={workspaceToolsStyles.primaryLink} href="/manage">{t("应用管理")}</a></div><div className="workspace-secondary-actions"><PalettePicker/><WorkspaceTools groups={toolGroups} disabled={!connection.retained}/></div></div></header>
      <div className="workspace-status-strip"><WorkspaceStatus limitsEnforced={usageSnapshot?.limitsEnforced} todayModelAttempts={usageSnapshot?.tokens.todayModelAttempts??null} visibility={session?.visibility==='shared'?'shared':'private'} limits={usageSnapshot?.limits} ready={connection.ready} error={connection.phase==="error"} intent={intent} mode={mode} model={preferences.model||session?.model||null} connected={session?.mode==="model"} busy={busy||discussionBusy||opening||!connection.ready} remaining={usageSnapshot?.limitsEnforced===false?null:usageSnapshot?.quota.model.remaining??null} limit={usageSnapshot?.limitsEnforced===false?null:usageSnapshot?.quota.model.limit??null} day={usageSnapshot?.day} warning={!!usageSnapshot&&showUsageAlert(usageSnapshot.quota.model.remaining,usageAlerts,usageSnapshot.limitsEnforced)} onToggleMode={()=>{setMode(mode==="demo"?"model":"demo");setSelectedElement(null);setSelectingElement(false);}} onAlertPreferences={()=>setDataManagement(true)}/></div>
      <OfflineWorkspaceControls workspaceId={workspaceId} disabled={busy||discussionBusy||opening} onSynced={()=>void finishOfflineSync()}/>
      {connection.retained&&connection.phase!=="ready"&&<WorkspaceConnection compact phase={connection.phase} error={homeNotice(locale,connectionError||preferencesError)} onRetry={()=>connection.retryScope==="session"?void initialize():setPreferencesReload(value=>value+1)}/>}
      {workspace&&detailed&&<div className="workbench-layout-controls"><WorkbenchLayoutControls mode={layout.mode} onModeChange={value=>{layout.setMode(value);if(value!=="split")setPane(value);}} sidebarCollapsed={layout.sidebarCollapsed} onSidebarCollapsedChange={layout.setSidebarCollapsed} chatWidth={layout.chatWidth} onChatWidthChange={layout.setChatWidth}/></div>}
      {outcomeIsCurrent(outcome,workspaceId,project?.id)&&<WorkspaceOutcomeCard title={outcome.source==='import'?t('导入内容已保存'):outcome.source==='copy'||outcome.source==='seed'?t('独立应用已打开'):outcome.source==='restore'?t('已还原为 v{number}',{number:outcome.versionNumber??'—'}):t('版本 v{number} 已保存',{number:outcome.versionNumber??'—'})} message={outcome.source==='import'?t('已导入 {projects} 个项目、{apps} 个应用；当前应用和草稿保持原位。',{projects:outcome.projectCount??0,apps:outcome.appCount??0}):outcome.source==='copy'||outcome.source==='seed'?t('原作品与草稿保留。可预览新应用，或前往应用管理。'):outcome.source==='manual'?t('手工新版本已保存，未调用模型。'):outcome.source==='restore'?t('当前保存版本已还原，历史和草稿完整保留。'):outcome.source==='recovery'?t('原结果已保存，本次未再次调用模型。'):t('新版本已保存，下一条草稿保留。')} primaryLabel={outcome.source==='import'?outcome.appId?t('打开导入的应用'):t('查看导入的项目'):outcome.source==='copy'||outcome.source==='seed'?t('预览新应用'):t('查看保存版本 v{number}',{number:outcome.versionNumber??'—'})} onPrimary={viewOutcome} onManage={outcome.source==='import'?()=>router.push('/manage'):undefined} onHistory={outcome.source==='import'?undefined:()=>{setHistory(true);setPane('preview');}} onDismiss={()=>setOutcome(null)} disabled={busy||discussionBusy||opening}/>}
      {error && connection.retained && <div className="error-banner" role="alert"><span><strong>{t("操作未完成：")}</strong>{homeNotice(locale,error)}</span>{!session && <button onClick={() => void initialize()}>{t("重新连接")}</button>}<button className="icon-button" aria-label={t("关闭错误")} onClick={() => setError("")}><X size={15}/></button></div>}
      {!connection.retained?<WorkspaceConnection phase={connection.phase==="error"?"error":"restoring"} error={homeNotice(locale,connectionError||preferencesError)} onRetry={()=>connection.retryScope==="session"?void initialize():setPreferencesReload(value=>value+1)}/>:!workspace ? <div className="home-content"><h1>{t("一个想法，")}<br className="mobile-break"/>{t("就能开始")}<span>{t("创造。")}</span></h1><p className="home-description">{t("用自然语言构建属于你的应用。")}<br className="mobile-break"/>{t(" 无需代码，让灵感即刻成形。")}</p><div style={{display:"flex",justifyContent:"center",marginBottom:14}}><IntentSwitch value={intent} disabled={!session||sessionLoading||busy||race.blocked||discussionBusy} onChange={changeIntent}/></div>{composer(true)}<CreationJourneyGuide/>{Object.entries(buildDraft.entries).some(([key,text])=>key.startsWith(preDraftPrefix)&&!!text.trim()&&key!==draftContextKey)&&<select aria-label={t("恢复构建前草稿")} value="" style={{marginTop:12,fontSize:11,color:"#91a2bc",border:"1px solid #e1e8f2",borderRadius:6,padding:7}} onChange={e=>{if(!e.target.value)return;const id=e.target.value.slice(preDraftPrefix.length);interruptRecovery();setCreationContextId(id==="default"?undefined:id);try{if(workspaceId)sessionStorage.setItem("motes-new-context:"+workspaceId,JSON.stringify({managedProjectId:creationTarget?.id??null,contextId:id==="default"?undefined:id}))}catch{}}}><option value="">{t("恢复其他未发送构建草稿…")}</option>{Object.entries(buildDraft.entries).filter(([key,text])=>key.startsWith(preDraftPrefix)&&!!text.trim()&&key!==draftContextKey).map(([key,text])=><option key={key} value={key}>{text.slice(0,35)}</option>)}</select>}<div className="inspiration-label"><span/>{t("或从一个灵感开始")}<span/></div><div className="example-grid">{examples.map(item => <button className={`example-card ${item.color}`} key={item.title} disabled={busy || !session || preferencesLoading} onClick={() => chooseInspiration(item)}><span className="example-icon">{item.icon}</span><span className="example-copy"><strong>{t(item.title)}</strong><small>{t(item.tag)}</small></span><ArrowUpRight size={17}/></button>)}</div><div className="home-footnote"><Check size={13}/>{t("即时预览")}<span>·</span>{t("历史版本")}<span>·</span>{t("导出 HTML，带走你的作品")}</div>{sessionLoading && <p className="connecting"><LoaderCircle size={14} className="spin"/>{t("正在连接你的工作空间…")}</p>}</div> : <div className="workspace-body">
        <div className="mobile-workspace-tabs"><button className={pane === "chat" ? "active" : ""} onClick={() => setPane("chat")}><MessageSquare size={14}/>{t("对话")}</button><button className={pane === "preview" ? "active" : ""} onClick={() => setPane("preview")}><Eye size={14}/>{t("预览")}</button></div>
        {session && !sessionLoading ? <DiscussionPane scrollScope={workspaceId&&project?{workspaceId,appId:project.id}:undefined} key={workspaceId+":"+(project?.id||creationTarget?.id||"pre")+":"+discussionReset} context={project?{appId:project.id}:creationTarget?{managedProjectId:creationTarget.id}:{}} intent={intent} visible={pane==="chat"} fresh={!project&&discussionReset>0} buildBusy={busy||race.blocked||opening||!connection.ready} modelAvailable={connection.ready&&offline.status!=="offline"&&!opening&&session?.mode==="model"} model={preferences.model||session?.model||undefined} baseVersionId={project?.currentVersionId} baseVersionNumber={current?.number} elementSelector={mode==='model'&&selectedElement?.baseVersionId===project?.currentVersionId&&displayed?.id===project?.currentVersionId?selectedElement?.selector:null} autoFollow={preferences.autoFollow} showWaitTimer={preferences.showWaitTimer} events={[...(project?.versions||[]).map(v=>({id:"version:"+v.id,time:Date.parse(v.createdAt),node:versionMessage(v)})),...visibleAttempts.map(a=>({id:"build:"+a.id,time:a.startedAt,node:attemptMessage(a)})),...(race.state.group||race.state.pending||race.state.retry||race.state.error?[{id:"inline-race:"+(race.state.group?.id||race.state.pending?.requestId||"recovery"),time:race.state.group?Date.parse(race.state.group.createdAt):race.state.startedAt,node:raceResults}]:[])]} buildComposer={<>{mode==="demo"&&<div className="suggestion-row">{(["改成深色主题","改成蓝色主题","改成绿色主题"] as const).map(text=><button disabled={busy} key={text} onClick={()=>setPrompt(text)}>{t(text)}</button>)}</div>}{composer(false)}<p className="composer-disclaimer">{mode==="demo"?t("示例支持主题色调整；旅行预算另支持修改预算上限。"):t("构建将生成代码版本；讨论只返回文字。")}</p></>} buildDraft={prompt} seed={discussionSeed} onIntentChange={changeIntent} onBusyChange={setDiscussionBusy} onAdopt={adoptDiscussion}/> : <section className={`chat-panel ${pane==="chat"?"mobile-visible":""}`}><p style={{padding:24,color:"#9cabc0",fontSize:12}}>{t("正在确认工作空间和草稿归属…")}</p></section>}
        {detailed&&layout.mode==="split"&&<div className="workbench-resize"><WorkbenchResizeHandle value={layout.chatWidth} onChange={layout.setChatWidth}/></div>}
        <section ref={previewSurface} className={`preview-panel ${pane === "preview" ? "mobile-visible" : ""}`}><div className="preview-toolbar"><div className="preview-title" style={{minWidth:0,flex:"1 1 auto"}}><Eye size={15}/><span>{t("实时预览")}</span>{!raceView.showCandidate&&displayed && <span className={`preview-version ${previewVersionStyles.label}`}>{displayed.id===current?.id?t("当前保存 v{number}",{number:displayed.number}):t("历史 v{viewed} · 当前 v{current}",{viewed:displayed.number,current:current?.number??"—"})}</span>}{raceView.workbench&&<RacePreviewTabs state={race.state} view={raceView} appAvailable={!!project} onChoose={slot=>{setRacePreviewChoice({key:raceView.key,slot});setHistory(false);setPane("preview")}}/>}</div><div className="preview-actions"><div className="device-toggle" hidden={detailed}><button aria-label={t("桌面预览")} title={t("桌面预览")} className={device === "desktop" ? "active" : ""} onClick={() => {setDevice("desktop");setPreviewWidth(null)}}><Monitor size={15}/></button><button aria-label={t("手机预览")} title={t("手机预览")} className={device === "mobile" ? "active" : ""} onClick={() => {setDevice("mobile");setPreviewWidth(null)}}><Smartphone size={15}/></button></div><span className="toolbar-divider"/><button hidden={!detailed&&!selectingElement} className="workbench-text-button" disabled={raceView.showCandidate||!displayed||displayed.id!==project?.currentVersionId||busy||discussionBusy||mode!=="model"} aria-pressed={selectingElement} title={mode!=="model"?t("元素定向修改需要AI模式"):t("点击预览中的元素，作为下一条修改范围")} onClick={()=>{setSelectingElement(value=>!value);if(selectingElement)setSelectedElement(null);}}>{t("选择元素")}</button><button hidden={detailed} className="icon-button" aria-label={t("刷新预览")} title={t("刷新预览")} disabled={!hasPreview} onClick={refreshPreview}><RotateCcw size={15}/></button><button hidden={raceView.showCandidate} className={`icon-button ${history ? "selected" : ""}`} aria-label={t("版本历史")} title={t("版本历史")} disabled={raceView.showCandidate||!project} onClick={() => setHistory(!history)}><History size={16}/></button><button hidden={raceView.showCandidate} className="export-button" aria-label={t("导出 HTML")} title={t("导出 HTML")} disabled={raceView.showCandidate||!displayed} onClick={download}><Download size={14}/><span>{t("导出 HTML")}</span></button></div></div>
          {hasPreview&&<div className="advanced-preview-controls" hidden={!detailed}><PreviewControls device={device} onDeviceChange={setDevice} width={previewWidth??(device==='mobile'?390:1100)} onWidthChange={setPreviewWidth} scale={previewScale} onScaleChange={setPreviewScale} fullscreenAvailable={!!session&&typeof document!=='undefined'&&document.fullscreenEnabled} onFullscreen={()=>void fullscreenPreview()} onRefresh={()=>setRefresh(n=>n+1)}/></div>}
          {!raceView.showCandidate&&displayed&&current&&displayed.id!==current.id&&<PreviewVersionStatus viewed={displayed.number} current={current.number} onReturn={()=>{setViewVersion(null);setPane("preview");}}/>}
          {!raceView.showCandidate&&selectingElement&&<div className="element-context" role="status">{t("点击预览中的非输入元素以定位；选择时页面操作被拦截。再次点击“选择元素”恢复操作，Esc清除。不会采集输入值或页面文字。")}</div>}
          <div className="preview-stage" ref={previewScrollRef} onScroll={rememberPreviewScroll}>{hasPreview ? <div className={`browser-frame ${device}`} style={{...(previewWidth?{width:previewWidth,maxWidth:"none",minWidth:previewWidth,flexShrink:0}:{}),zoom:previewScale}}><div className="browser-chrome"><div className="traffic-lights"><i/><i/><i/></div><span><Globe2 size={11}/>{(raceView.showCandidate?`${locale==='en'?'Candidate':'方案'} ${String.fromCharCode(65+(raceView.slot??0))}`:project?.title || t("新应用")).toLowerCase().replace(/\s+/g, "-")}<span className="preview-url-end">.motes.preview</span></span><span className="secure-dot"/></div><iframe ref={raceView.showCandidate?undefined:previewFrame} key={`${raceView.showCandidate?raceView.candidate?.attemptId:displayed?.id}-${refresh}`} title={raceView.showCandidate?`${locale==='en'?'Candidate':'候选方案'} ${String.fromCharCode(65+(raceView.slot??0))}`:t("{p0} 应用预览", {p0:project?.title || t("新应用")})} onLoad={()=>{if(diagnosticScope)previewFrame.current?.contentWindow?.postMessage({protocol:ELEMENT_PROTOCOL,channel:diagnosticScope.channel,kind:"control",enabled:selectingElement},"*")}} srcDoc={previewDocument} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"/></div> : <div className="preview-empty"><Layers3 size={32}/><h2>{raceView.showCandidate?(locale==='en'?'Candidate results will appear here':'候选方案将在这里呈现'):t("你的应用将在这里呈现")}</h2><p>{raceView.showCandidate?(race.state.error||(locale==='en'?'Each lane runs independently. Switch above to inspect a ready result.':'各路独立生成，可在上方切换查看已完成的方案。')):busy ? t("正在构建，完成后即可预览和操作。") : t("尚未生成应用，可以在对话中重试或调整需求。")}</p></div>}{busy && hasPreview && <div className="preview-busy"><LoaderCircle size={14} className="spin"/>{t("正在更新，当前预览仍可使用")}</div>}</div>{raceView.workbench&&<RacePreview key={raceView.key} controller={race.controller} state={race.state} view={raceView} appAvailable={!!project} disabled={singleBusy||discussionBusy||opening||!connection.ready} onChoose={slot=>{setRacePreviewChoice({key:raceView.key,slot});setHistory(false);setPane("preview")}} onOpen={openRaceApp}/>}<RuntimeErrorPanel key={diagnosticScope?.channel} errors={raceView.showCandidate?[]:runtimeErrors} modelAvailable={!raceView.showCandidate&&session?.mode === "model"} current={!raceView.showCandidate&&!!project && displayed?.id === project.currentVersionId} busy={busy||discussionBusy} onPrepare={prepareRepair} onSource={() => { if (displayed) { setSource(false); setHistory(false); setEditorVersionId(displayed.id); } }}/><RuntimeDataBridge frameRef={previewFrame} appId={raceView.showCandidate?null:project?.id ?? null} versionId={raceView.showCandidate?null:displayed?.id ?? null} channel={raceView.showCandidate?null:diagnosticScope?.channel ?? null} enabled={!raceView.showCandidate&&session?.visibility === "shared"} /><div className="preview-bottom"><span><span className="status-dot"/>{raceView.showCandidate?(locale==='en'?'Isolated candidate preview':'候选隔离预览'):t("独立安全预览")}</span><span>{previewWidth?t("{p0} · {p1}px", {p0:device==="mobile"?t("手机"):t("桌面"),p1:previewWidth}):device === "mobile" ? t("手机 · 390px") : t("桌面 · 自适应")} · {Math.round(previewScale*100)}%<span className="bottom-separator">/</span>Made with Motes</span></div>
          {history&&!raceView.showCandidate && <div className="history-panel"><div className="panel-heading"><strong>{t("版本历史")}</strong><button className="icon-button" aria-label={t("关闭历史")} onClick={() => setHistory(false)}><X size={16}/></button></div><p>{t("切换版本会重新载入预览，临时运行输入不保留；未发送草稿与保存记录保留。")}</p>{[...(project?.versions || [])].reverse().map(v => <div className={`history-item ${displayed?.id===v.id?previewVersionStyles.selected:""}`} key={v.id}><button aria-pressed={displayed?.id===v.id} onClick={() => setViewVersion(v.id === current?.id ? null : v.id)}><span>{t("版本 ")}{v.number}{v.name ? ` · ${v.name}` : ""}{v.important ? " ★" : ""}{v.mode === "manual" ? t(" · 手工") : ""}{v.id === current?.id ? <small>{t("当前保存")}</small>:displayed?.id===v.id?<small>{t("正在预览")}</small>:null}</span><p>{v.prompt}</p><time>{new Date(v.createdAt).toLocaleString(locale)}</time></button>{v.id !== current?.id && <button className="restore-button" disabled={busy} onClick={() => void restore(v.id)}><RotateCcw size={12}/>{t("还原此版")}</button>}</div>)}</div>}
        </section>
      </div>}
      {notice && <div className="workspace-toast" role="status"><Check size={15}/>{notice}</div>}
    </main>
    {questionChoice && <IntentQuestion onCancel={()=>setQuestionChoice(null)} onDiscuss={()=>{const text=questionChoice;setQuestionChoice(null);changeIntent("discuss");setDiscussionSeed({id:Date.now(),text})}} onBuild={()=>{const text=questionChoice;setQuestionChoice(null);void generate(text,undefined,true)}}/>}
    {newAppOptions&&<NewAppOptions busy={busy||discussionBusy||opening} targetLabel={creationTarget?.name??t("默认项目")} onCreate={createNewPrivateApp} onClose={()=>setNewAppOptions(false)}/>}
    {dataManagement&&<DataManagementPanel onClose={()=>setDataManagement(false)} onClearDrafts={clearLocalDrafts} onResetDisplayPreferences={resetLocalDisplay} onOpenBackup={()=>{setDataManagement(false);void openWorkspaceBackup();}} onOpenArchive={()=>router.push("/manage")} alertPreferences={usageAlerts} onAlertPreferencesChange={changeUsageAlertPreference}/>}
    {publicationOpen&&project&&<PublicationPanel project={project} shared={session?.visibility==='shared'} onClose={()=>setPublicationOpen(false)}/>}
    {workspaceBackup&&<WorkspaceBackupPanel snapshot={workspaceBackup} onClose={()=>setWorkspaceBackup(null)} onImported={result=>{const owner=workspaceBackup.workspace.id;if(!workspaceCallbackCurrent({mounted:mounted.current,expectedWorkspace:owner,currentWorkspace:workspaceRef.current}))return;setWorkspaceBackup(null);if(owner){setOutcome({workspaceId:owner,appId:result.appIds[0]??"",source:"import",appCount:result.appIds.length,projectCount:result.projectIds.length});setNotice("");}else setNotice(t("导入资料已保存，可在应用管理查看新项目。"));void refreshProjectList();}}/>}
    {appTemplatesOpen&&<AppTemplateLibrary project={project} shared={session?.visibility==='shared'} onClose={()=>setAppTemplatesOpen(false)} onCopied={next=>{if(!adoptSavedProject(next))return;setAppTemplatesOpen(false);presentSavedOutcome(next,"copy");}}/>}
    {versionConfig&&<VersionConfigPanel projectId={versionConfig.appId} versionId={versionConfig.versionId} onClose={()=>setVersionConfig(null)}/>}
    {styleBase&&<StylePresetPanel html={styleBase.html} baseVersionId={styleBase.baseVersionId} disabled={busy||discussionBusy||opening} onApply={applyStyle} onClose={()=>setStyleBase(null)}/>}
    {tasksOpen&&<TaskCenter items={taskItems} busy={tasksBusy||busy||discussionBusy} onCheck={()=>void loadTasks()} onSave={id=>void saveTask(id)} onClose={()=>setTasksOpen(false)}/>}
    {repairCandidate && <RuntimeRepairDialog initial={repairCandidate} draft={prompt} onClose={() => setRepairCandidate(null)} onApply={fillRepair}/>}
    {templatesOpen && <PromptLibrary draft={prompt} initialChoice={templateChoice} onClose={() => { setTemplatesOpen(false); setTemplateChoice(undefined); }} onUse={fillTemplate}/>}
    {editorVersionId && project && <SourceEditor project={project} selectedVersionId={editorVersionId} onClose={() => setEditorVersionId(null)} onMetadataUpdated={next => {if(!workspaceCallbackCurrent({mounted:mounted.current,expectedWorkspace:workspaceId,currentWorkspace:workspaceRef.current,checkApp:true,expectedApp:next.id,currentApp:currentAppRef.current}))return;setProject(previous=>workspaceRef.current===workspaceId&&previous?.id===next.id?preferSavedProject(previous,next):previous);}} onSaved={next => { if(!adoptSavedProject(next))return; setEditorVersionId(null); setSource(false); setHistory(false); setViewVersion(null);presentSavedOutcome(next,"manual"); }}/>}
    {source && project && <VersionTools project={project} selectedVersionId={viewVersion ?? project.currentVersionId} onEdit={versionId => { setSource(false); setHistory(false); setEditorVersionId(versionId); }} onClose={() => setSource(false)} onSaved={next => { if(!adoptSavedProject(next))return; setSource(false); setHistory(false); setViewVersion(null);presentSavedOutcome(next,"copy"); }}/>}
  </div>;
}




