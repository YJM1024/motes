export type ModelEnvironment = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string; OPENAI_MODELS?: string };
/** Server-managed allowlist, never discovered from arbitrary browser input. */
export function configuredModels(env: ModelEnvironment): string[] {
  if (!env.OPENAI_API_KEY) return [];
  const raw = env.OPENAI_MODELS?.trim() || env.OPENAI_MODEL || '';
  return [...new Set(raw.split(',').map(s => s.trim()).filter(s => /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(s) && !/^sk-/i.test(s)))].slice(0, 8);
}
export function defaultModel(env: ModelEnvironment): string | null {
  const models = configuredModels(env);
  return models.includes(env.OPENAI_MODEL || '') ? env.OPENAI_MODEL! : models[0] || null;
}
