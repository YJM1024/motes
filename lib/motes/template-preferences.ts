export type TemplatePreferences = { favorites: string[]; categories: Record<string, string>; recent: string[] };
export const EMPTY_TEMPLATE_PREFERENCES: TemplatePreferences = { favorites: [], categories: {}, recent: [] };
export const TEMPLATE_CATEGORIES = ['未分类', '产品', '界面', '功能', '内容'] as const;
export function templatePreferencesKey(workspaceId: string) { return `motes-template-preferences:v1:${encodeURIComponent(workspaceId)}`; }
export function parseTemplatePreferences(raw: string | null): TemplatePreferences {
  if (!raw) return EMPTY_TEMPLATE_PREFERENCES;
  try {
    const value = JSON.parse(raw) as Partial<TemplatePreferences>;
    return { favorites: Array.isArray(value.favorites) ? value.favorites.filter(x => typeof x === 'string') : [], categories: value.categories && typeof value.categories === 'object' && !Array.isArray(value.categories) ? Object.fromEntries(Object.entries(value.categories).filter(([, v]) => typeof v === 'string')) : {}, recent: Array.isArray(value.recent) ? value.recent.filter(x => typeof x === 'string') : [] };
  } catch { return EMPTY_TEMPLATE_PREFERENCES; }
}
export function templateVariables(source: string): string[] {
  return [...new Set(Array.from(source.matchAll(/\{\{\s*([\w\u3400-\u9fff.-]+)\s*\}\}/g), m => m[1]))];
}
export function renderTemplate(source: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing = templateVariables(source).filter(name => !values[name]?.trim());
  const text = source.replace(/\{\{\s*([\w\u3400-\u9fff.-]+)\s*\}\}/g, (_, name: string) => values[name]?.trim() || `{{${name}}}`);
  return { text, missing };
}
