import type { WorkspaceAction } from '@/lib/motes/types';

export const MAX_BULK_SELECTION = 20;
export type BulkOperation = { kind: 'starred' | 'archived'; value: boolean } | { kind: 'move'; projectId: string };
export type BulkFailure = { id: string; name: string; error: string };
export type BulkResult = { successes: { id: string; name: string }[]; failures: BulkFailure[] };
export function selectVisible(ids: string[], limit = MAX_BULK_SELECTION): { ids: string[]; tooMany: boolean } {
  return ids.length > limit ? { ids: [], tooMany: true } : { ids: [...new Set(ids)], tooMany: false };
}
export function bulkAppAction(workspaceId: string, appId: string, operation: BulkOperation): WorkspaceAction {
  if (!workspaceId || !appId) throw new Error('缺少工作空间或应用标识。');
  if (operation.kind === 'move' && !operation.projectId) throw new Error('请选择目标项目。');
  return { action: 'app.update', workspaceId, appId, ...(operation.kind === 'starred' ? { starred: operation.value } : {}), ...(operation.kind === 'archived' ? { archived: operation.value } : {}), ...(operation.kind === 'move' ? { projectId: operation.projectId } : {}) };
}
export function mergeBulkResult(previous: BulkResult | null, successes: BulkResult['successes'], failures: BulkFailure[]): BulkResult {
  const byId = new Map((previous?.successes || []).map(item => [item.id, item]));
  for (const item of successes) byId.set(item.id, item);
  return { successes: [...byId.values()], failures };
}
export function retryFailedIds(result: BulkResult): string[] { return result.failures.map(item => item.id); }
