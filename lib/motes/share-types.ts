export type ShareLink = {
  id: string; versionId: string; versionNumber: number; title: string;
  createdAt: string; revokedAt: string | null; path: string;
};
/** This is the complete public contract. No IDs, ownership, prompts or model metadata. */
export type SharedVersion = {title: string; versionNumber: number; html: string};
