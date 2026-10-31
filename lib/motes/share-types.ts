export type ShareLink = {
  id: string; versionId: string; versionNumber: number; title: string;
  createdAt: string; revokedAt: string | null; path: string;
};
/** Internal request-bound context; IDs are present only for flag-enabled shared apps. */
export type SharedVersion = {appId?: string; versionId?: string; runtimeData?: true; title: string; versionNumber: number; html: string};
