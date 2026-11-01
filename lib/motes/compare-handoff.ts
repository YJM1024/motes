export const COMPARE_HANDOFF_KEY = 'motes:compare-handoff:v1';
export const COMPARE_HANDOFF_TTL_MS = 10 * 60 * 1000;

export type CompareHandoff = {
  version: 1;
  workspaceId: string;
  createdAt: number;
  prompt: string;
  appId?: string;
  baseVersionId?: string;
  managedProjectId?: string;
  count: 2 | 3 | 4;
};

export type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type HandoffResult =
  | { status: 'none' | 'storage-unavailable' }
  | { status: 'invalid' | 'expired' | 'workspace-mismatch' }
  | { status: 'ready'; value: CompareHandoff };

const idValid = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 180;

export function validateCompareHandoff(value: unknown): value is CompareHandoff {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CompareHandoff>;
  if (item.version !== 1 || !idValid(item.workspaceId) || !Number.isFinite(item.createdAt) ||
      typeof item.prompt !== 'string' || !item.prompt.trim() || item.prompt.length > 4000 ||
      ![2, 3, 4].includes(item.count as number)) return false;
  const hasApp = item.appId !== undefined;
  const hasProject = item.managedProjectId !== undefined;
  if (hasApp && hasProject) return false;
  if (hasApp && (!idValid(item.appId) || !idValid(item.baseVersionId))) return false;
  if (hasProject && !idValid(item.managedProjectId)) return false;
  return true;
}

export function writeCompareHandoff(storage: HandoffStorage, value: CompareHandoff): boolean {
  if (!validateCompareHandoff(value)) return false;
  try { storage.setItem(COMPARE_HANDOFF_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}

/** Removes the handoff before parsing/validation so it is consumed at most once. */
export function takeCompareHandoff(storage: HandoffStorage, workspaceId: string, now = Date.now()): HandoffResult {
  let raw: string | null;
  try {
    raw = storage.getItem(COMPARE_HANDOFF_KEY);
    if (raw === null) return { status: 'none' };
    storage.removeItem(COMPARE_HANDOFF_KEY);
  } catch { return { status: 'storage-unavailable' }; }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { status: 'invalid' }; }
  if (!validateCompareHandoff(value)) return { status: 'invalid' };
  if (now < value.createdAt - 30_000 || now - value.createdAt > COMPARE_HANDOFF_TTL_MS) return { status: 'expired' };
  if (value.workspaceId !== workspaceId) return { status: 'workspace-mismatch' };
  return { status: 'ready', value };
}

export type HandoffWorkspace = {
  apps: Array<{ id: string; currentVersionId: string }>;
  projects: Array<{ id: string; archived: boolean }>;
};
export type HandoffContext =
  | { status: 'ready'; value: CompareHandoff }
  | { status: 'target-required'; value: CompareHandoff }
  | { status: 'stale-base'; value: CompareHandoff; currentVersionId: string }
  | { status: 'stale-target'; value: CompareHandoff };

export function resolveCompareHandoff(value: CompareHandoff, workspace: HandoffWorkspace): HandoffContext {
  if (value.appId) {
    const app = workspace.apps.find(item => item.id === value.appId);
    if (!app) return { status: 'stale-target', value };
    return app.currentVersionId === value.baseVersionId
      ? { status: 'ready', value }
      : { status: 'stale-base', value, currentVersionId: app.currentVersionId };
  }
  if (!value.managedProjectId) return { status: 'target-required', value };
  const project = workspace.projects.find(item => item.id === value.managedProjectId && !item.archived);
  return project ? { status: 'ready', value } : { status: 'stale-target', value };
}
