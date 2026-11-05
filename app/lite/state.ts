import type { RecoveryAttempt } from '@/lib/motes/recovery-state';
export function generationBody(attempt: RecoveryAttempt) {
  return { requestId: attempt.requestId, prompt: attempt.text, mode: attempt.mode, ...(attempt.projectId ? { projectId: attempt.projectId, baseVersionId: attempt.baseVersionId } : attempt.managedProjectId ? { managedProjectId: attempt.managedProjectId } : {}) };
}
export function previewIdentity(appId: string, versionId: string, reload: number) { return JSON.stringify([appId, versionId, reload]); }
export function safeFilename(title: string) { return (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 70) || 'motes-app') + '.html'; }
export function validLiteProject(value: unknown, expectedId?: string): value is import('@/lib/forma/types').Project {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id || expectedId && p.id !== expectedId || typeof p.title !== 'string' || typeof p.currentVersionId !== 'string' || !Array.isArray(p.versions)) return false;
  return p.versions.some(v => v?.id === p.currentVersionId) && p.versions.every(v => v && typeof v.id === 'string' && Number.isInteger(v.number) && v.number > 0 && typeof v.html === 'string' && !!v.html.trim() && typeof v.prompt === 'string' && typeof v.summary === 'string');
}
