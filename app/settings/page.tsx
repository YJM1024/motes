"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Production vinext Link/RSC navigation is incompatible; native anchors retain synchronous draft persistence and existing leave guards. */

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Settings2, ShieldCheck } from 'lucide-react';
import type { SettingKey, SettingsPatch, SettingsSnapshot, SettingScope } from '@/lib/motes/settings';
import type { WorkspaceSnapshot } from '@/lib/motes/types';
import './settings.css';
import UsagePanel from '../components/UsagePanel';
import InterfaceLanguagePreferences from '../components/InterfaceLanguagePreferences';
import MotionPreferences from '../components/MotionPreferences';
import ThemePreferences from '../components/ThemePreferences';
import { useHostLocale, hostText } from '@/app/components/HostLocaleProvider';
import type { HostMessageKey } from '@/lib/motes/locale';

const fields = [
  { key: 'creationMode', title: '默认创作模式', description: '打开工作台时使用，可在发送前临时切换。AI 模式需要服务端已连接模型。', group: '创作', options: [['demo', '示例模式'], ['model', 'AI 模式']] },
  { key: 'model', title: '创作模型', description: '真正用于下一次 AI 生成。只允许服务端已配置的模型；默认由服务端决定，不同模型成本可能不同。未配置时仍可使用示例模式。', group: '创作', options: [] },
  { key: 'language', title: '生成应用的默认语言', description: '用于新 AI 应用。修改时保留现有语言，明确提出翻译需求后再调整；不更改工作台语言。', group: '创作', options: [['zh-CN', '简体中文'], ['en', 'English']] },
  { key: 'visualStyle', title: '生成应用的默认风格', description: '用于新 AI 应用的基础视觉。当前明确需求优先，修改时不自动重设计。示例模式不使用此项。', group: '创作', options: [['minimal', '简洁 · 中性色与清晰排版'], ['soft', '柔和 · 轻配色与圆角'], ['bold', '鲜明 · 强层级与强调色']] },
  { key: 'previewDevice', title: '默认预览设备', description: '打开应用时的预览宽度，可在工作台临时切换，不改写代码。', group: '工作台', options: [['desktop', '桌面 · 自适应'], ['mobile', '手机 · 390px']] },
  { key: 'autoFollow', title: '对话自动跟随', description: '有新消息时跟随到底部；主动浏览上文时保持当前位置。', group: '工作台', options: [['true', '开启'], ['false', '停用']] },
  { key: 'showWaitTimer', title: '显示等待计时', description: '生成时显示真实等待时长。关闭后仍显示进行中状态，不改变超时上限。', group: '工作台', options: [['true', '显示'], ['false', '隐藏']] },
 ] as const satisfies readonly { key: SettingKey; title: string; description: string; group: string; options: readonly (readonly [string, string])[] }[];
const sourceNames = { system: '系统默认', workspace: '工作空间', project: '项目', app: '应用', server: '服务端安全回退' } as const;
async function api<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json().catch(() => ({ error: hostText("服务没有返回有效结果。") })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || hostText("暂时无法完成，请稍后重试。"));
  return data;
}
export default function SettingsPage() {
  const { t } = useHostLocale();
  const localizedFields = fields.map(field => ({ ...field, title: t(field.title), description: t(field.description), group: t(field.group), options: field.options.map(([value, label]) => [value, t(label)] as [string, string]) }));
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [scope, setScope] = useState<SettingScope>('workspace');
  const [projectId, setProjectId] = useState('');
  const [appId, setAppId] = useState('');
  const [draft, setDraft] = useState<SettingsPatch>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<HostMessageKey | ''>('');
  const [query, setQuery] = useState('');
  const dirty = !!settings && fields.some(f => (draft[f.key] ?? null) !== (settings.overrides[scope][f.key] ?? null));
  function apply(next: SettingsSnapshot, layer: SettingScope) { setSettings(next); setDraft(next.overrides[layer]); }
  async function initial() {
    setLoading(true); setError('');
    try { await api('/api/session'); const [space, prefs] = await Promise.all([api<WorkspaceSnapshot>('/api/workspace?archived=all'), api<SettingsSnapshot>('/api/settings')]); setWorkspace(space); apply(prefs, 'workspace'); setScope('workspace'); setProjectId(''); setAppId(''); }
    catch (e) { setError(e instanceof Error ? e.message : hostText("加载失败，请重试。")); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- Bootstrap once; locale changes must preserve unsaved settings and must not restart requests.
  useEffect(() => { void initial(); }, []);
  useEffect(() => { const before = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [dirty]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  function mayLeave() { return !dirty || window.confirm(hostText("有尚未保存的设置，放弃这些修改？")); }
  async function changeScope(layer: SettingScope, project = '', app = '') {
    if (busy || !mayLeave()) return;
    if ((layer === 'project' && !project) || (layer === 'app' && !app)) { setScope(layer); setProjectId(project); setAppId(app); setSettings(null); setDraft({}); return; }
    setLoading(true); setError(''); setNotice('');
    try { const query = layer === 'app' ? '?appId=' + encodeURIComponent(app) : layer === 'project' ? '?projectId=' + encodeURIComponent(project) : ''; const next = await api<SettingsSnapshot>('/api/settings' + query); setScope(layer); setProjectId(next.selection.projectId || ''); setAppId(app); apply(next, layer); }
    catch (e) { setError(e instanceof Error ? e.message : hostText("加载设置失败。")); }
    finally { setLoading(false); }
  }
  async function save() {
    if (!settings || busy || !dirty) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const patch = Object.fromEntries(fields.map(f => [f.key, draft[f.key] ?? null]));
      const next = await api<SettingsSnapshot>('/api/settings', { scope, ...(scope === 'project' ? { projectId } : {}), ...(scope === 'app' ? { appId } : {}), patch });
      apply(next, scope); setNotice('设置已保存并生效；已有代码与历史版本保持原样。');
    } catch (e) { setError(e instanceof Error ? e.message : hostText("保存失败，修改已保留。")); }
    finally { setBusy(false); }
  }
  const filtered = localizedFields.filter(f => `${f.title}${f.description}${f.group}`.includes(query.trim()));
  function linkGuard(e: React.MouseEvent<HTMLAnchorElement>) { if (!mayLeave()) e.preventDefault(); }
  return <main className="settings-shell"><header className="settings-top"><a href="/" onClick={linkGuard}><ArrowLeft size={16}/>{t('回到创作')}</a><strong>motes<span>.</span></strong><a href="/manage" onClick={linkGuard}>{t('应用管理')}<ChevronRight size={14}/></a></header>
    <div className="settings-layout"><aside className="settings-sidebar"><p className="settings-kicker">{t('偏好与空间')}</p><h1><Settings2 size={22}/>{t('设置')}</h1><a href="#settings-preferences">{t('创作与工作台')}</a><a href="#settings-usage">{t('用量与任务')}</a><a href="#settings-identity">{t('个人资料')}</a><a href="#settings-security">{t('数据与安全')}</a><p className="settings-side-note">{t('测试模式')}<br/>{t('当前浏览器的独立空间，尚无正式账号和跨设备同步。')}</p></aside>
    <section className="settings-content"><div className="settings-intro"><h2>{t('让工作台更合你的习惯')}</h2><p>{t('只调整今后的默认行为。已有应用代码与历史版本不会被设置变化重写。')}</p></div>
      {error && <div role="alert" className="settings-error"><strong>{t("操作未完成：")}</strong>{error}{!workspace && <button onClick={() => void initial()} disabled={loading}>{t('重新加载')}</button>}</div>}{notice && <p role="status" className="settings-notice"><Check size={15}/>{t(notice)}</p>}
      <section className="settings-section" id="settings-preferences"><div className="settings-section-title"><h3>{t('创作与工作台')}</h3><input aria-label={t('搜索设置')} placeholder={t('查找偏好…')} value={query} onChange={e => setQuery(e.target.value)}/></div>
        <div className="settings-scope"><label>{t('作用范围')}<select value={scope} disabled={loading || busy || !workspace} onChange={e => void changeScope(e.target.value as SettingScope)}><option value="workspace">{t('工作空间默认')}</option><option value="project">{t('项目覆盖')}</option><option value="app">{t('应用覆盖')}</option></select></label>{scope === 'project' && <label>{t('项目')}<select aria-label={t('选择项目')} value={projectId} disabled={loading || busy} onChange={e => void changeScope('project', e.target.value)}><option value="">{t('选择项目')}</option>{workspace?.projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.archived ? t('（已归档）') : ''}</option>)}</select></label>}{scope === 'app' && <label>{t('应用')}<select aria-label={t('选择应用')} value={appId} disabled={loading || busy} onChange={e => void changeScope('app', '', e.target.value)}><option value="">{t('选择应用')}</option>{workspace?.apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}</div>
        <p className="settings-hint">{t('有效顺序：服务端安全约束 → 应用覆盖 → 项目覆盖 → 工作空间 → 系统默认。应用移动项目后会继承目标项目。')}{scope === 'app' && settings && <> {t('当前所属项目：')}{workspace?.projects.find(p => p.id === settings.selection.projectId)?.name || t('默认项目')}。</>}</p>
        {loading ? <p className="settings-loading" role="status">{t('正在读取实际配置…')}</p> : !settings ? <p className="settings-loading">{workspace ? t('先选择具体对象，再查看有效设置和继承来源。') : t('工作空间尚未加载，请重试。')}</p> : <><div className="settings-model"><span>{t('实际可用模型')}</span><strong>{settings.models.length ? settings.models.join('、') : t('尚未连接 · 仅示例模式可用')}</strong><small>{t('连接由服务端管理，这里不接收密钥，也不提供未经配置的模型选项。')}</small></div>{filtered.length ? filtered.map(field => {
          const raw = draft[field.key]; const selected = raw === undefined || raw === null ? 'inherit' : String(raw);
          const options: [string,string][] = field.key === 'model' ? settings.models.map(id=>[id,id]) : field.options;
          const currentLabel = options.find(o => o[0] === String(settings.effective[field.key]))?.[1] || (field.key === 'model' ? t('尚未连接') : t('未知'));
          return <div className="settings-row" key={field.key}><div><span className="settings-field-group">{field.group}</span><h4>{field.title}</h4><p>{field.description}</p><small>{t('当前生效：')}{currentLabel} <span>{t('· 来源：')}{t(sourceNames[settings.sources[field.key]])}</span></small></div><select aria-label={field.title} value={selected} disabled={busy} onChange={e => { const value = e.target.value === 'inherit' ? null : e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value; setDraft(prev => ({ ...prev, [field.key]: value } as SettingsPatch)); }}><option value="inherit">{scope === 'workspace' ? t('使用系统默认') : t('继承上级设置')}</option>{field.key === 'model' && selected !== 'inherit' && !options.some(o=>o[0]===selected) && <option value={selected} disabled>{t('原模型不可用，请改用继承')}</option>}{options.map(([value, label]) => <option value={value} key={value} disabled={field.key === 'creationMode' && value === 'model' && !settings.modelAvailable}>{label}</option>)}</select></div>;
        }) : <p className="settings-loading">{t('没有匹配的设置，试试其他关键词。')}</p>}<div className="settings-actions"><button disabled={busy} onClick={() => setDraft({})}>{t(scope === 'workspace' ? '恢复系统默认' : '全部恢复继承')}</button><span>{t(dirty ? '有未保存的修改' : '已与服务端同步')}</span><button disabled={busy || !dirty} onClick={() => { setDraft(settings.overrides[scope]); setError(''); }}>{t('取消')}</button><button className="settings-primary" disabled={busy || !dirty} onClick={() => void save()}>{t(busy ? '保存中…' : '保存设置')}</button></div></>}
      </section>
      <InterfaceLanguagePreferences />
      <ThemePreferences />
      <MotionPreferences />
      {workspace && <UsagePanel/>}
      <section className="settings-section settings-info" id="settings-identity"><h3>{t('个人资料')}</h3><div><span className="settings-profile-avatar">{workspace?.profile.displayName.slice(0, 1) || 'M'}</span><p><strong>{workspace?.profile.displayName || t('测试用户')}</strong><small>{t('测试资料 · 显示名称不用于登录认证')}</small></p><a href="/manage" onClick={linkGuard}>{t('编辑资料')}<ChevronRight size={14}/></a></div></section>
      <section className="settings-section settings-info" id="settings-security"><h3><ShieldCheck size={17}/>{t('数据与安全')}</h3><dl><dt>{t('身份与归属')}</dt><dd>{t('匿名 HttpOnly Cookie 识别访客。清除 Cookie、更换浏览器或设备后无法找回原身份。每个设置作用范围均由服务端检查归属。')}</dd><dt>{t('保存内容')}</dt><dd>{t('项目、需求、代码版本和设置保存到服务端。预览中的费用、任务与计时等运行状态不持久化。')}</dd><dt>{t('模型与密钥')}</dt><dd>{t('密钥只保存在服务端，不返回浏览器。AI 生成会发送当前需求和代码到模型服务；这里不显示账户账单或余额。')}</dd><dt>{t('固定安全边界')}</dt><dd>{t('隔离预览、网络限制、3 分钟模型超时、输出上限与每日额度由服务端控制，不能被项目或应用偏好覆盖。')}</dd></dl><p className="settings-hint">{t('当前不提供正式登录、数据清除或安全策略开关。需要带走应用时，可在工作台导出 HTML。')}</p></section>
    </section></div>
  </main>;
}
