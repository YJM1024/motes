export type PublicationMutation = { action: 'publish'; versionId: string; expectedRevision: number } | { action: 'unpublish'; expectedRevision: number };
export type PublicationReceipt = { fingerprint: string; requestId: string };
export function publicationFingerprint(action: PublicationMutation): string {
  return JSON.stringify([action.action, action.action === 'publish' ? action.versionId : null, action.expectedRevision]);
}
export function publicationRequestId(current: PublicationReceipt | null, action: PublicationMutation, createId: () => string): PublicationReceipt {
  const fingerprint = publicationFingerprint(action);
  return current?.fingerprint === fingerprint ? current : { fingerprint, requestId: createId() };
}
export function publicationUrl(path: string, origin: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('发布链接路径无效。');
  const base = new URL(origin), target = new URL(path, base);
  if (target.origin !== base.origin) throw new Error('发布链接必须属于当前站点。');
  return target.href;
}
