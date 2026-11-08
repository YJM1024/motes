'use client';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Code2, Download, Eye, GitCompareArrows, History, LoaderCircle, Menu, MessageSquare, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { useWorkspaceDraft } from '@/app/hooks/useWorkspaceDraft';
import type { Project } from '@/lib/forma/types';
import { contextKey } from '@/lib/motes/recovery-state';
import { selectLiteMode, useLiteWorkspace } from './useLiteWorkspace';
import { useLiteGeneration } from './useLiteGeneration';
import { liteApi } from './api';
import { litePreview } from './preview';
import { previewIdentity, safeFilename, validLiteProject } from './state';
import LiteRuntimeDataBridge from './LiteRuntimeDataBridge';
import LitePublication from './LitePublication';
import LiteGenerationSteps from './LiteGenerationSteps';
import LiteVersionDiff from './LiteVersionDiff';
import LiteSourceViewer from './LiteSourceViewer';
import { renderApplicationHtml } from '@/lib/motes/react-render';
import { exportApplicationHtml } from '@/lib/motes/application-export';
import './lite.css';
const examples = [
  { title: '旅行预算', icon: '↗', text: '帮我做一个旅行预算规划工具，可以添加交通、住宿和餐饮支出，设置预算上限。' },
  { title: '任务看板', icon: '▦', text: '帮我做一个任务看板，可以添加任务，在待办、进行中和已完成之间移动。' },
  { title: '番茄钟', icon: '◷', text: '帮我做一个番茄钟，支持专注倒计时、暂停和重新开始。' },
];
export default function LiteWorkbench() {
  const w = useLiteWorkspace(), [preferredMode, setMode] = useState<string | null>(() => {
    try { return typeof window === 'undefined' ? null : sessionStorage.getItem('motes-lite-mode'); } catch { return null; }
  }), [pane, setPane] = useState<'chat' | 'preview'>('chat');
  const mode = w.session ? selectLiteMode(preferredMode, w.session) : 'demo';
  const [sidebar, setSidebar] = useState(false), [history, setHistory] = useState(false), [source, setSource] = useState(false), [diff, setDiff] = useState(false), [viewId, setViewId] = useState<string | null>(null), [reload, setReload] = useState(0);
  const [groupForm, setGroupForm] = useState(false), [groupName, setGroupName] = useState(''), [groupBusy, setGroupBusy] = useState(false), [restoring, setRestoring] = useState(false), [loadedIdentity, setLoaded] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null), chatScrollRef = useRef<HTMLDivElement>(null), appRef = useRef(w.project?.id), draft = useWorkspaceDraft(w.session?.workspaceId || null, 'lite:' + contextKey(w.context));
  useLayoutEffect(() => { appRef.current = w.project?.id; }, [w.project?.id]);
  const g = useLiteGeneration({ workspaceId: w.session?.workspaceId || null, context: w.context, baseVersionId: w.project?.currentVersionId, navigation: w.navigation, navigationVersion: w.navigationVersion, enabled: !w.loading,
    onAcceptedSend: attempt => draft.set(current => current.trim() === attempt.text.trim() ? '' : current),
    onExplicitRejection: attempt => draft.set(current => current.trim() ? current : attempt.text),
    onSaved: (project, attempt) => { const nextDraft = draft.value.trim() === attempt.text.trim() ? "" : draft.value; if (!attempt.projectId && nextDraft) { draft.writeTo("lite:" + contextKey({ projectId: project.id }), nextDraft); draft.set(""); } else draft.set(current => current.trim() === attempt.text.trim() ? "" : current); w.adopt(project); setViewId(null); setReload(n => n + 1); setPane('preview'); void w.refresh().catch(() => {}); } });
  const [resultNote, setResultNote] = useState('');
  const scope = contextKey(w.context);
  const [viewScope, setViewScope] = useState(scope);
  if (viewScope !== scope) { setViewScope(scope); setViewId(null); setSource(false); setHistory(false); setDiff(false); setResultNote(''); }
  const sendingRequestId = g.attempts.find(attempt => attempt.state === 'sending')?.requestId ?? null;
  useEffect(() => { if (sendingRequestId) chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' }); }, [sendingRequestId]);
  const displayed = w.project?.versions.find(v => v.id === (viewId || w.project?.currentVersionId));
  const completionForProject = g.completed?.projectId === w.project?.id ? g.completed : null;
  const identity = !w.loading && w.project && displayed ? previewIdentity(w.project.id, displayed.id, reload) + ':' + w.navigationVersion : '';
  const loaded = !!identity && loadedIdentity === identity;
  const [previewResult, setPreviewResult] = useState<{ identity: string; channel: string; html: string } | null>(null);
  const [previewFailure, setPreviewFailure] = useState<{ identity: string; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const preview = previewResult?.identity === identity ? previewResult : null;
  const previewError = previewFailure?.identity === identity ? previewFailure.message : '';
  useEffect(() => {
    let active = true;
    if (!displayed || !identity) return;
    const navigation = w.navigation.current;
    const channel = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    void litePreview(displayed.html, channel, window.location.origin, w.session?.visibility === 'shared').then(html => {
      if (active && navigation === w.navigation.current) { setPreviewResult({ identity, channel, html }); setPreviewFailure(null); }
    }).catch(error => { if (active && navigation === w.navigation.current) setPreviewFailure({ identity, message: error instanceof Error ? error.message : '编译失败，请修改代码后重试。' }); });
    return () => { active = false; };
  }, [identity, displayed, w.session?.visibility, w.navigation]);
  const apps = w.snapshot?.apps.filter(a => a.projectId === w.groupId && !a.archived) || [], group = w.snapshot?.projects.find(p => p.id === w.groupId);
  const canSend = !!w.session && !w.loading && !g.busy && !restoring && !g.attempts.length && !!draft.value.trim();
  function send() { if (!canSend) return; void g.send(draft.value, mode); }
  async function restore(versionId: string) {
    const appId = w.project?.id, navigation = w.navigation.current; if (!appId || restoring || g.busy || g.attempts.length) return;
    setRestoring(true); w.setError('');
    try {
      const result = await liteApi<{ project: Project }>('/api/projects/' + appId + '/restore', { versionId });
      if (appRef.current !== appId || w.navigation.current !== navigation) return;
      if (!validLiteProject(result.project, appId)) throw new Error('还原结果尚未完整返回，请重新读取应用。'); w.adopt(result.project); setViewId(null); setReload(n => n + 1); setResultNote('已还原代码版本。预览已重新载入；已保存业务数据保持当前值。'); void w.refresh().catch(() => {});
    } catch (e) { if (appRef.current === appId && w.navigation.current === navigation) w.setError(e instanceof Error ? e.message : '还原失败。'); }
    finally { setRestoring(false); }
  }
  async function download() {
    if (!displayed || exporting) return;
    const appId = w.project?.id, navigation = w.navigation.current, title = w.project?.title || 'motes-app';
    setExporting(true);
    try {
      const html = await renderApplicationHtml(displayed.html);
      if (appRef.current !== appId || w.navigation.current !== navigation) return;
      const url = URL.createObjectURL(new Blob([exportApplicationHtml(displayed.html, html)], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = safeFilename(title); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResultNote('已导出独立 HTML。离开工作台后 SDK 数据桥不可用，输入仅作临时使用。');
    } catch (error) { if (appRef.current === appId && w.navigation.current === navigation) w.setError(error instanceof Error ? error.message : '编译失败，无法导出。'); }
    finally { setExporting(false); }
  }
  async function createGroup(event: React.FormEvent) { event.preventDefault(); if (!groupName.trim()) return; setGroupBusy(true); try { await w.createGroup(groupName); setGroupForm(false); setGroupName(''); } catch (e) { w.setError(e instanceof Error ? e.message : '创建失败。'); } finally { setGroupBusy(false); } }
  return <div className="lite-shell">
    <header className="lite-topbar"><div className="lite-brand"><button className="lite-icon lite-mobile-menu" onClick={() => setSidebar(!sidebar)} aria-label="打开项目导航"><Menu size={18}/></button><span className="lite-mark">✣</span><strong>motes<span>.</span></strong><span className="lite-edition">轻量工作台</span></div><div className="lite-space"><span className="lite-live-dot"/>{w.session?.visibility === 'shared' ? '游客 · 公共空间' : w.session ? '游客工作空间' : '正在连接'}</div></header>
    <div className="lite-shared-banner">{w.session?.visibility === 'shared' ? '这是公共演示空间，无需注册。所有访客共享作品与业务数据，请勿填写隐私或秘密。' : '通过匿名浏览器会话使用工作台。连接完成后显示当前空间范围。'}</div>
    <div className="lite-body">
      {sidebar && <button className="lite-backdrop" aria-label="关闭项目导航" onClick={() => setSidebar(false)}/>}
      <aside className={`lite-sidebar ${sidebar ? 'is-open' : ''}`}>
        <div className="lite-sidebar-label"><span>我的项目</span><button className="lite-icon" title="新建项目" aria-label="新建项目" disabled={!w.session || w.loading} onClick={() => setGroupForm(!groupForm)}><Plus size={16}/></button></div>
        {groupForm && <form className="lite-group-form" onSubmit={createGroup}><input aria-label="项目名称" placeholder="项目名称" maxLength={80} value={groupName} onChange={e => setGroupName(e.target.value)} autoFocus/><button disabled={groupBusy || !groupName.trim()}>{groupBusy ? '创建中' : '创建'}</button></form>}
        <div className="lite-groups">{w.snapshot?.projects.filter(p => !p.archived).map(p => <button className={p.id === w.groupId ? 'selected' : ''} key={p.id} onClick={() => { w.switchGroup(p.id); }}><span>▱</span><span>{p.name}</span><small>{w.snapshot?.apps.filter(a => a.projectId === p.id && !a.archived).length || 0}</small></button>)}</div>
        <div className="lite-sidebar-label"><span>{group?.name || '项目'}中的应用</span></div>
        <button className="lite-new-app" disabled={!w.session || w.loading} onClick={() => { w.create(); setPane('chat'); setSidebar(false); }}><Plus size={16}/>新建应用</button>
        <nav className="lite-apps" aria-label="应用列表">{apps.map(a => <button key={a.id} className={a.id === w.project?.id ? 'selected' : ''} onClick={() => { void w.open(a.id); setSidebar(false); }}><span className="lite-app-symbol">◇</span><span>{a.name}</span></button>)}{!apps.length && <p className="lite-note">这个项目还没有应用。从一句话开始。</p>}</nav>
        <div className="lite-sidebar-bottom"><span>想法 → 页面 → 可运行链接</span><small>React + Tailwind · 云端保存</small></div>
      </aside>
      <main className="lite-workbench">
        <div className="lite-mobile-tabs"><button aria-pressed={pane === 'chat'} onClick={() => setPane('chat')}><MessageSquare size={15}/>聊天</button><button aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}><Eye size={15}/>预览{displayed ? ` · v${displayed.number}` : ''}</button></div>
        {w.error && <div className="lite-error" role="alert">{w.error}<button onClick={() => void w.reconnect()}>重新连接</button></div>}
        <section className={`lite-chat ${pane === 'chat' ? 'mobile-active' : ''}`} aria-label="创作对话">
          <div className="lite-panel-header"><div><span className="lite-eyebrow">CREATE WITH MOTES</span><h1>{w.project?.title || '把想法变成小应用'}</h1></div><span className="lite-status-pill">{g.busy ? '处理中' : w.loading ? '连接中' : '准备就绪'}</span></div>
          <div className="lite-chat-scroll" ref={chatScrollRef}>
            {!w.project && !g.attempts.length && <div className="lite-welcome"><div className="lite-orbit"><Sparkles size={25}/></div><h2>你想做点什么？</h2><p>描述一个想法，生成可交互的页面。<br/>新建默认使用 React + Tailwind。<br/>已有应用沿用原有技术继续修改。</p><div className="lite-examples">{examples.map(example => <button key={example.title} onClick={() => draft.set(example.text)}><span>{example.icon}</span>{example.title}<small>↗</small></button>)}</div></div>}
            {w.project?.versions.map(v => <article className="lite-message-pair" key={v.id}><div className="lite-user-message">{v.prompt}</div><div className="lite-assistant-message"><span className="lite-message-avatar">✣</span><div><strong><Check size={14}/>已保存 v{v.number}<small>{v.mode === 'demo' ? '示例生成' : v.mode === 'manual' ? '手工版本' : 'AI 生成'}</small></strong><p>{v.summary}</p>{completionForProject && completionForProject.versionId === v.id && <LiteGenerationSteps progress={completionForProject.progress}/>}<button onClick={() => { setViewId(v.id); setPane('preview'); }}>查看这一版 <Eye size={12}/></button></div></div></article>)}
            {g.attempts.map(attempt => { const status = g.recovery.stateFor(attempt), retry = attempt.retryConfirmed || status?.retry === 'new' || status?.retry === 'same' || status?.retry === 'save'; return <article className="lite-message-pair" key={attempt.id}><div className="lite-user-message">{attempt.text}</div><div className="lite-attempt" role="status"><strong>{attempt.state === 'sending' ? <><LoaderCircle size={15} className="lite-spin"/>请求已发出，等待响应</> : '原请求需要核对'}</strong>{g.progress?.requestId === attempt.requestId && <LiteGenerationSteps progress={g.progress}/>}<p>{status?.message || attempt.error || '接收、生成与保存状态尚未确认。'}</p>{attempt.state === 'sending' ? <button onClick={g.stop}>停止本页等待</button> : <div><button disabled={g.busy} onClick={() => g.recovery.checkAgain()}>再次核对</button>{retry && <button disabled={g.busy} onClick={() => void g.send(attempt.text, attempt.mode, attempt)}>{status?.retry === 'save' ? '仅重试保存' : status?.retry === 'same' ? '沿用原编号重试' : '重新发送原需求'}</button>}{(attempt.retryConfirmed || status?.retry === 'new') && <button disabled={g.busy} onClick={() => g.dismiss(attempt)}>结束此请求，编辑新需求</button>}</div>}<details><summary>请求记录</summary><code>{attempt.requestId}</code><p>停止等待不会保证取消服务端执行。核对结果前不重复生成。</p></details></div></article>; })}
            {g.notice && <p className="lite-note" role="status">{g.notice}</p>}{resultNote && <p className="lite-note" role="status">{resultNote}</p>}
          </div>
          <form className="lite-composer" onSubmit={e => { e.preventDefault(); send(); }}>
            <div className="lite-mode"><select aria-label="生成模式" value={mode} onChange={e => { const next = e.target.value as 'demo' | 'model'; setMode(next); try { sessionStorage.setItem('motes-lite-mode', next); } catch {} }} disabled={g.busy}><option value="demo">示例模式</option>{w.session?.mode === 'model' && w.session.model && <option value="model">真实 AI · {w.session.model}</option>}</select><small>{mode === 'demo' ? w.session?.mode === 'model' && !w.session.model ? '当前空间没有可用模型，使用示例模式；不调用模型' : '不调用模型' : '需求与当前代码将发送给模型'}</small></div>
            <div className="lite-input-wrap">
              <textarea aria-label="应用需求" aria-describedby="lite-composer-hint" placeholder={w.project ? '继续描述你想修改的地方…' : '例如：做一个可以保存支出的旅行预算工具…'} value={draft.value} onChange={e => draft.set(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && e.ctrlKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                  e.preventDefault();
                  if (!e.repeat) send();
                }
              }} maxLength={4000} rows={3}/>
              <button className="lite-send" type="submit" aria-label="发送需求" aria-keyshortcuts="Control+Enter" title="发送需求（Ctrl + Enter）" disabled={!canSend}>{g.busy ? <LoaderCircle size={18} className="lite-spin"/> : <ArrowUp size={19}/>}</button>
            </div>
            <p className="lite-composer-hint" id="lite-composer-hint">Ctrl + Enter 发送 · Enter 换行。{mode === 'demo' ? '示例仅支持旅行预算、任务看板、番茄钟及有限修改。其他需求会如实提示。' : '生成结果需在预览中检查；完整性检查不等于功能正确。'}{draft.unavailable && ' 浏览器草稿保存不可用，请保留输入。'}</p>
          </form>
        </section>
        <section className={`lite-preview-panel ${pane === 'preview' ? 'mobile-active' : ''}`} aria-label="应用预览">
          <div className="lite-panel-header lite-preview-header"><div className="lite-preview-title"><span className="lite-preview-dot"/><strong>实时预览</strong>{displayed && <span className="lite-version-pill">v{displayed.number}{displayed.id !== w.project?.currentVersionId ? ' · 历史预览' : ' · 当前'}</span>}</div><div className="lite-preview-tools"><button aria-label="版本历史" title="版本历史" disabled={!w.project} onClick={() => { setHistory(!history); setSource(false); setDiff(false); }}><History size={16}/></button><button aria-label="版本对比" title="版本对比" disabled={!w.project} onClick={() => { setDiff(true); setHistory(false); setSource(false); }}><GitCompareArrows size={16}/></button><button aria-label="查看代码" title="查看代码" disabled={!displayed} onClick={() => { setSource(!source); setHistory(false); setDiff(false); }}><Code2 size={16}/></button><button aria-label="导出 HTML" title="导出 HTML" disabled={!displayed || exporting} onClick={() => void download()}><Download size={16}/></button><button aria-label="重新载入预览" title="重新载入预览" disabled={!displayed} onClick={() => setReload(n => n + 1)}><RotateCcw size={16}/></button></div></div>
          {displayed && <div className="lite-preview-meta"><span>{loaded ? <><Check size={13}/>预览已加载 · 请检查实际功能</> : previewError ? '编译失败' : preview ? '正在载入预览…' : '正在编译预览…'}</span>{w.session?.visibility === 'shared' && <small>仅通过 SDK 显式保存的业务数据会持久保留</small>}</div>}
          <div className="lite-preview-stage">
            {w.loading && <div className="lite-loading"><LoaderCircle className="lite-spin" size={22}/>正在读取云端工作空间…</div>}
            {displayed && !preview ? <div className="lite-loading" role={previewError ? "alert" : "status"}>{previewError || <><LoaderCircle className="lite-spin" size={22}/>正在编译预览…</>}</div> : preview && displayed && w.project ? <Fragment key={identity}><iframe ref={frameRef} title={`${w.project.title} v${displayed.number} 预览`} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" srcDoc={preview.html} onLoad={() => setLoaded(identity)}/><LiteRuntimeDataBridge frameRef={frameRef} appId={w.project.id} versionId={displayed.id} channel={preview.channel} enabled={w.session?.visibility === 'shared'}/></Fragment> : <div className="lite-empty-preview"><div className="lite-window-illustration"><div><i/><i/><i/></div><span>✣</span><b/><b/></div><h2>下一份作品，从这里开始</h2><p>在左侧描述需求，应用会出现在这里。<br/>可以操作、继续修改，再发布成公开链接。</p><span className="lite-empty-label">你的想法，值得一个可以运行的版本</span></div>}
            {history && w.project && <div className="lite-overlay"><header><strong>代码历史</strong><button aria-label="关闭历史" onClick={() => setHistory(false)}><X size={17}/></button></header><p>查看历史只切换预览；继续修改仍基于当前保存版。还原会重新载入页面，未保存的临时输入会重置。</p>{[...w.project.versions].reverse().map(v => <div className="lite-history-item" key={v.id}><button className={displayed?.id === v.id ? 'selected' : ''} onClick={() => setViewId(v.id)}><strong>v{v.number}{v.id === w.project?.currentVersionId ? ' · 当前保存' : ''}</strong><span>{v.prompt}</span><small>{new Date(v.createdAt).toLocaleString('zh-CN')}</small></button>{v.id !== w.project?.currentVersionId && <button disabled={restoring || g.busy || !!g.attempts.length} onClick={() => void restore(v.id)}><RotateCcw size={13}/>{restoring ? '还原中' : '还原此版'}</button>}</div>)}</div>}
            {diff && w.project && <LiteVersionDiff versions={w.project.versions} currentVersionId={w.project.currentVersionId} onClose={() => setDiff(false)}/>}
            {source && displayed && <LiteSourceViewer key={displayed.id} html={displayed.html} number={displayed.number} onClose={() => setSource(false)}/>}

          </div>
          {displayed && w.project && !w.loading && <LitePublication key={w.project.id} appId={w.project.id} versionId={displayed.id} number={displayed.number} html={displayed.html}/>}
        </section>
      </main>
    </div>
  </div>;
}







