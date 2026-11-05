import type { RecoveryAttempt } from '@/lib/motes/recovery-state';
export function generationBody(attempt: RecoveryAttempt) {
  return { requestId: attempt.requestId, prompt: attempt.text, mode: attempt.mode, ...(attempt.projectId ? { projectId: attempt.projectId, baseVersionId: attempt.baseVersionId } : attempt.managedProjectId ? { managedProjectId: attempt.managedProjectId } : {}) };
}
export function previewIdentity(appId: string, versionId: string, reload: number) { return JSON.stringify([appId, versionId, reload]); }
export function safeFilename(title: string) { return (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 70) || 'motes-app') + '.html'; }
