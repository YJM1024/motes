export type DiscussionThread = { id: string; title: string; appId: string | null; managedProjectId: string | null; createdAt: string; updatedAt: string };
export type DiscussionTurn = { requestId: string; prompt: string; reply: string | null; error: string | null; status: 'running' | 'done' | 'failed' | 'expired' | 'save_pending'; createdAt: string; completedAt: string | null; contextVersionId: string | null; model: string | null; imported?:boolean;pendingReply?:string|null;resultExpiresAt?:string|null };
export type DiscussionSnapshot = { workspaceId: string; thread: DiscussionThread | null; threads: DiscussionThread[]; turns: DiscussionTurn[]; limits: { preThreads: number; turns: number; prompt: number; reply: number } };
export const DISCUSSION_LIMITS = { preThreads: 50, turns: 100, prompt: 4000, reply: 8000 };
export type DiscussionContext = { appId?: string; managedProjectId?: string; threadId?: string };
export type DiscussionRequestStatus = { requestId: string; threadId: string; status: DiscussionTurn['status']; retry?: 'new'|'save'; snapshot: DiscussionSnapshot };
