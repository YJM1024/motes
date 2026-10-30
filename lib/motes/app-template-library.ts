export type AppTemplateRequest = { fingerprint: string; requestId: string };

export function appTemplateRequestFingerprint(path: string, body: Record<string, unknown>): string {
  return JSON.stringify([path, body]);
}

export function stableAppTemplateRequestId(previous: AppTemplateRequest | null, fingerprint: string, createId: () => string): AppTemplateRequest {
  if (previous?.fingerprint === fingerprint) return previous;
  return { fingerprint, requestId: createId() };
}
