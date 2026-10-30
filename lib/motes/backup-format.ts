import type { Preferences } from './settings';

export const BACKUP_LIMITS = { bytes: 2 * 1024 * 1024, apps: 10, versions: 200, versionsPerApp: 60, tags: 50 };
export type BackupVersion = { number: number; prompt: string; summary: string; html: string; createdAt: string; mode: 'demo' | 'model' | 'manual'; model: string | null; name: string; important: boolean };
export type BackupApp = { name: string; description: string; starred: boolean; archived: boolean; tagKeys: string[]; settings: Preferences; currentVersion: number; versions: BackupVersion[] };
export type BackupDocument = { format: 'motes-backup'; version: 1; exportedAt: string; project: { name: string; description: string; settings: Preferences }; tags: { key: string; name: string; color: string }[]; apps: BackupApp[] };
export type BackupPreview = { previewHash: string; projectName: string; apps: { name: string; versions: number }[]; appCount: number; versionCount: number; bytes: number };
export type ImportResult = { projectId: string; appIds: string[]; imported: true };

function invalid(message: string): never { throw new Error(message); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid('备份包含未知或不支持的字段。');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, empty = false): string { if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) invalid('备份文本为空或超出长度限制。'); return value as string; }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') invalid('备份状态字段无效。'); return value as boolean; }
function number(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 100000) invalid('备份版本编号无效。'); return Number(value); }
function date(value: unknown): string { const raw = text(value, 40); if (!Number.isFinite(Date.parse(raw))) invalid('备份日期无效。'); return raw; }
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) invalid('备份数量超限，请分批导出。'); return value as unknown[]; }
function preferences(value: unknown): Preferences {
  const keys = ['creationMode', 'previewDevice', 'autoFollow', 'showWaitTimer', 'language', 'visualStyle', 'model'];
  const p = object(value, keys);
  for (const [key, values] of Object.entries({ creationMode: ['demo', 'model'], previewDevice: ['desktop', 'mobile'], language: ['zh-CN', 'en'], visualStyle: ['minimal', 'soft', 'bold'] })) if (typeof p[key] !== 'string' || !values.includes(p[key] as string)) invalid('备份设置选项无效。');
  if(p.model!==undefined&&(typeof p.model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(p.model)||/^sk-/i.test(p.model)))invalid('备份模型偏好无效。');
  return { creationMode: p.creationMode as Preferences['creationMode'], previewDevice: p.previewDevice as Preferences['previewDevice'], autoFollow: bool(p.autoFollow), showWaitTimer: bool(p.showWaitTimer), language: p.language as Preferences['language'], visualStyle: p.visualStyle as Preferences['visualStyle'],...(typeof p.model==='string'?{model:p.model}:{}) };
}
/** Shared browser/server preflight. No HTML is executed, injected or fetched. */
export function validateBackup(value: unknown, options: {allowEmptyApps?:boolean} = {}): BackupDocument {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > BACKUP_LIMITS.bytes) invalid('备份超过 2 MiB，请分批导出。');
  const root = object(value, ['format', 'version', 'exportedAt', 'project', 'tags', 'apps']);
  if (root.format !== 'motes-backup' || root.version !== 1) invalid('不支持的备份格式或版本。');
  const project = object(root.project, ['name', 'description', 'settings']);
  const tags = list(root.tags, BACKUP_LIMITS.tags).map(value => { const t = object(value, ['key', 'name', 'color']); const color = text(t.color, 7); if (!/^#[\da-f]{6}$/i.test(color)) invalid('标签颜色无效。'); return { key: text(t.key, 80), name: text(t.name, 40), color }; });
  if (new Set(tags.map(t => t.key)).size !== tags.length || new Set(tags.map(t => t.name)).size !== tags.length) invalid('备份标签不能重复。');
  const apps = list(root.apps, BACKUP_LIMITS.apps).map(value => {
    const a = object(value, ['name', 'description', 'starred', 'archived', 'tagKeys', 'settings', 'currentVersion', 'versions']);
    const tagKeys = list(a.tagKeys, 10).map(key => text(key, 80));
    if (new Set(tagKeys).size !== tagKeys.length || tagKeys.some(key => !tags.some(t => t.key === key))) invalid('应用引用了不存在或重复的标签。');
    const versions = list(a.versions, BACKUP_LIMITS.versionsPerApp).map(value => {
      const v = object(value, ['number', 'prompt', 'summary', 'html', 'createdAt', 'mode', 'model', 'name', 'important']);
      if (typeof v.mode !== 'string' || !['demo', 'model', 'manual'].includes(v.mode) || (v.mode !== 'model' && v.model !== null)) invalid('备份版本来源无效。');
      const html = text(v.html, 180000); if (!/^\s*<!doctype html>/i.test(html) || !/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) invalid('备份包含不完整 HTML。');
      return { number: number(v.number), prompt: text(v.prompt, 4000, true), summary: text(v.summary, 4000, true), html, createdAt: date(v.createdAt), mode: v.mode as BackupVersion['mode'], model: v.model === null ? null : text(v.model, 200), name: text(v.name, 80, true), important: bool(v.important) };
    }).sort((a, b) => a.number - b.number);
    const currentVersion = number(a.currentVersion);
    if (!versions.length || new Set(versions.map(v => v.number)).size !== versions.length || !versions.some(v => v.number === currentVersion)) invalid('版本历史或当前指针无效。');
    return { name: text(a.name, 80), description: text(a.description, 1000, true), starred: bool(a.starred), archived: bool(a.archived), tagKeys, settings: preferences(a.settings), currentVersion, versions };
  });
  if ((!apps.length&&!options.allowEmptyApps) || apps.reduce((n, a) => n + a.versions.length, 0) > BACKUP_LIMITS.versions) invalid('备份须含 1–10 个应用，合计最多 200 个版本。');
  return { format: 'motes-backup', version: 1, exportedAt: date(root.exportedAt), project: { name: text(project.name, 80), description: text(project.description, 1000, true), settings: preferences(project.settings) }, tags, apps };
}

export function validateBackupPreferences(value:unknown):Preferences{return preferences(value);}
