import type { HostLocale, HostMessageParams } from './index';

/** Copy owned by the P0 artifact card; kept outside the shared host catalog. */
export const p0ArtifactMessages = {
  '已保存成果': 'Saved artifact',
  '版本 v{number}': 'Version v{number}',
  '未命名版本': 'Untitled version',
  '当前版本': 'Current version',
  '正在查看': 'Currently previewing',
  '历史版本': 'Historical version',
  '版本状态': 'Version status',
  '版本操作': 'Version actions',
  '重要': 'Important',
  '手动修改': 'Manual edit',
  '示例模式': 'Demo mode',
  '模型生成': 'Model generated',
  '预览此版本': 'Preview this version',
  '正在查看此版本': 'Previewing this version',
  '查看源码': 'View source',
  '版本历史': 'Version history',
  '导出此版本 HTML': 'Export this version HTML',
  '导出版本 v{number} HTML': 'Export version v{number} HTML',
  '创建于 {date}': 'Created {date}',
} as const;

export type P0ArtifactMessageKey = keyof typeof p0ArtifactMessages;

export function p0ArtifactText(locale: HostLocale, key: P0ArtifactMessageKey, params: HostMessageParams = {}): string {
  const source = locale === 'en' ? p0ArtifactMessages[key] : key;
  return source.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token);
}
