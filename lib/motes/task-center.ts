export type TaskKind = 'generation' | 'candidate';
export type TaskPhase = 'running' | 'saved' | 'failed' | 'save_pending' | 'unresolved';
export type TaskCenterItem = {
  id: string;
  requestId: string;
  prompt: string;
  kind: TaskKind;
  phase: TaskPhase;
  createdAt: string;
  expiresAt?: string;
};

export function taskHasExpired(item: Pick<TaskCenterItem, 'expiresAt'>, now: number): boolean {
  if (!item.expiresAt) return false;
  const expiry = Date.parse(item.expiresAt);
  return Number.isFinite(expiry) && expiry <= now;
}

export function filterTasks(items: TaskCenterItem[], query: string, kind: TaskKind | 'all', phase: TaskPhase | 'all'): TaskCenterItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(item => (kind === 'all' || item.kind === kind)
    && (phase === 'all' || item.phase === phase)
    && (!needle || `${item.prompt} ${item.requestId}`.toLocaleLowerCase().includes(needle)));
}

export function formatTaskDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间记录无效';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
