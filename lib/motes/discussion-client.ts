import type { DiscussionSnapshot, DiscussionTurn } from './discussion-types';
export const DISCUSSION_RECOVERY = { checks: 30, intervalMs: 3000 };
export type DiscussionAttempt = { requestId:string;threadId:string;prompt:string;baseVersionId?:string;model?:string;startedAt:number;state:'sending'|'checking'|'failed';error?:string };
export function mergeDiscussion(current: DiscussionSnapshot | null, incoming: DiscussionSnapshot): DiscussionSnapshot {
  if (!current?.thread || current.workspaceId !== incoming.workspaceId || current.thread.id !== incoming.thread?.id) return incoming;
  const turns = new Map(current.turns.map(t => [t.requestId,t]));
  for (const turn of incoming.turns) { const old = turns.get(turn.requestId); if (old?.status === 'done' && turn.status !== 'done') continue; turns.set(turn.requestId,turn); }
  return { ...incoming,turns:[...turns.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.requestId.localeCompare(b.requestId)) };
}
export function discussionRecoveryDecision(status: DiscussionTurn['status'] | 'missing', checks: number) {
  if (status === 'done') return 'completed';
  if (status === 'failed' || status === 'expired') return 'new-id';
  if (status === 'missing') return 'same-id';
  return checks < DISCUSSION_RECOVERY.checks ? 'poll' : 'pause';
}
