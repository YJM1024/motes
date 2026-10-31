export type ShareLink = {
  id: string; versionId: string; versionNumber: number; title: string;
  createdAt: string; revokedAt: string | null; path: string;
};
/** Internal request-bound context for rendering a share page; API DTOs redact app/version IDs. */
export type SharedVersion = {appId: string; versionId: string; title: string; versionNumber: number; html: string};
