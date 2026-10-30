import { HttpError } from '../forma/security';

export type Preferences = {
  creationMode: 'demo' | 'model'; previewDevice: 'desktop' | 'mobile';
  autoFollow: boolean; showWaitTimer: boolean;
  language: 'zh-CN' | 'en'; visualStyle: 'minimal' | 'soft' | 'bold';
};
export type SettingKey = keyof Preferences;
export type SettingScope = 'workspace' | 'project' | 'app';
export type SettingSource = 'system' | SettingScope | 'server';
export type SettingsPatch = { [K in SettingKey]?: Preferences[K] | null };
export type SettingsSelection = { projectId?: string; appId?: string };
export type SettingsSnapshot = {
  workspaceId: string; selection: SettingsSelection;
  effective: Preferences; sources: Record<SettingKey, SettingSource>;
  overrides: Record<SettingScope, Partial<Preferences>>;
  models: string[]; modelAvailable: boolean;
};
const keys: SettingKey[] = ['creationMode', 'previewDevice', 'autoFollow', 'showWaitTimer', 'language', 'visualStyle'];
const enums = { creationMode: ['demo', 'model'], previewDevice: ['desktop', 'mobile'], language: ['zh-CN', 'en'], visualStyle: ['minimal', 'soft', 'bold'] };
export function defaultPreferences(model: string | null): Preferences {
  return { creationMode: model ? 'model' : 'demo', previewDevice: 'desktop', autoFollow: true, showWaitTimer: true, language: 'zh-CN', visualStyle: 'minimal' };
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128) throw new HttpError(400, '设置作用范围无效。');
  return value;
}
function validateValue(key: SettingKey, value: unknown, model: string | null) {
  if (key === 'autoFollow' || key === 'showWaitTimer') { if (typeof value !== 'boolean') throw new HttpError(400, '显示偏好须为布尔值。'); }
  else if (typeof value !== 'string' || !(enums[key] as readonly string[]).includes(value)) throw new HttpError(400, '设置选项无效。');
  if (key === 'creationMode' && value === 'model' && !model) throw new HttpError(409, '服务端尚未配置可用模型，不能默认使用 AI 模式。');
}
async function selectionFor(db: D1Database, who: string, selection: SettingsSelection) {
  const wid = `workspace:${who}`;
  let projectId = selection.projectId === undefined ? undefined : identifier(selection.projectId);
  const appId = selection.appId === undefined ? undefined : identifier(selection.appId);
  if (appId) {
    const app = await db.prepare('SELECT coalesce(a.project_id,?) AS project_id FROM forma_projects p LEFT JOIN motes_apps a ON a.app_id=p.id AND a.workspace_id=? WHERE p.id=? AND p.owner=?').bind(`project:${who}`, wid, appId, who).first<{ project_id: string }>();
    if (!app) throw new HttpError(404, '应用不存在或不属于当前访客。');
    if (projectId && projectId !== app.project_id) throw new HttpError(400, '应用与项目范围不一致。');
    projectId = app.project_id;
  }
  if (projectId) {
    const project = await db.prepare('SELECT id FROM motes_projects WHERE id=? AND workspace_id=?').bind(projectId, wid).first();
    // Legacy apps can inherit their future default project before metadata backfill.
    if (!project && !(appId && projectId === `project:${who}`)) throw new HttpError(404, '项目不存在或不属于当前访客。');
  }
  return { wid, selection: { ...(projectId ? { projectId } : {}), ...(appId ? { appId } : {}) } };
}
export async function readSettings(db: D1Database, who: string, model: string | null, requested: SettingsSelection = {}): Promise<SettingsSnapshot> {
  const { wid, selection } = await selectionFor(db, who, requested);
  const rows = await db.prepare('SELECT scope_type,scope_id,setting_key,value_json FROM motes_settings WHERE workspace_id=?').bind(wid).all<{ scope_type: SettingScope; scope_id: string; setting_key: SettingKey; value_json: string }>();
  const effective = defaultPreferences(model), sources = Object.fromEntries(keys.map(k => [k, 'system'])) as Record<SettingKey, SettingSource>;
  const overrides: SettingsSnapshot['overrides'] = { workspace: {}, project: {}, app: {} };
  for (const [scope, id] of [['workspace', wid], ['project', selection.projectId], ['app', selection.appId]] as const) {
    if (!id) continue;
    for (const row of rows.results.filter(r => r.scope_type === scope && r.scope_id === id)) {
      if (!keys.includes(row.setting_key)) continue;
      const value = JSON.parse(row.value_json);
      // Validate stored preferences too; an unavailable model falls back below.
      validateValue(row.setting_key, value, model || 'configured');
      Object.assign(overrides[scope], { [row.setting_key]: value }); Object.assign(effective, { [row.setting_key]: value }); sources[row.setting_key] = scope;
    }
  }
  if (!model && effective.creationMode === 'model') { effective.creationMode = 'demo'; sources.creationMode = 'server'; }
  return { workspaceId: wid, selection, effective, sources, overrides, models: model ? [model] : [], modelAvailable: !!model };
}
export async function saveSettings(db: D1Database, who: string, model: string | null, body: Record<string, unknown>): Promise<SettingsSnapshot> {
  if (Object.keys(body).some(k => !['scope', 'projectId', 'appId', 'patch'].includes(k))) throw new HttpError(400, '包含不支持的设置字段。');
  if (typeof body.scope !== 'string' || !['workspace', 'project', 'app'].includes(body.scope)) throw new HttpError(400, '设置作用范围无效。');
  const scope = body.scope as SettingScope;
  if ((scope === 'workspace' && (body.projectId !== undefined || body.appId !== undefined)) || (scope === 'project' && (body.projectId === undefined || body.appId !== undefined)) || (scope === 'app' && body.appId === undefined)) throw new HttpError(400, '设置作用范围与对象不一致。');
  const patch = body.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some(k => !keys.includes(k as SettingKey))) throw new HttpError(400, '请提供支持的设置选项。');
  const selection: SettingsSelection = { ...(body.projectId !== undefined ? { projectId: identifier(body.projectId) } : {}), ...(body.appId !== undefined ? { appId: identifier(body.appId) } : {}) };
  const current = await readSettings(db, who, model, selection), id = scope === 'workspace' ? current.workspaceId : scope === 'project' ? current.selection.projectId! : current.selection.appId!;
  const statements: D1PreparedStatement[] = [];
  for (const [field, value] of Object.entries(patch)) {
    const key = field as SettingKey;
    if (value === null) statements.push(db.prepare('DELETE FROM motes_settings WHERE workspace_id=? AND scope_type=? AND scope_id=? AND setting_key=?').bind(current.workspaceId, scope, id, key));
    else {
      validateValue(key, value, model);
      statements.push(db.prepare('INSERT INTO motes_settings(workspace_id,scope_type,scope_id,setting_key,value_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,scope_type,scope_id,setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at').bind(current.workspaceId, scope, id, key, JSON.stringify(value), new Date().toISOString()));
    }
  }
  await db.batch(statements);
  return readSettings(db, who, model, selection);
}
/** Defaults guide new apps; explicit requests and existing app design take priority. */
export function generationPreferences(settings: Preferences, editing: boolean): string {
  const language = settings.language === 'en' ? 'English' : 'Simplified Chinese';
  const style = { minimal: 'restrained neutral colors, clear typography and minimal decoration', soft: 'soft colors, rounded surfaces and calm spacing', bold: 'strong typographic hierarchy and vivid accent colors' }[settings.visualStyle];
  return `Workspace defaults: UI language ${language}; visual style ${style}. Explicit requirements in the current user request take priority over these defaults. ${editing ? 'This is an edit: preserve existing language and visual design unless the current user request asks for relevant language or design changes; defaults may only fill unspecified details in those requested changes.' : 'For this new app, apply defaults only where the user has not specified a preference.'}`;
}
