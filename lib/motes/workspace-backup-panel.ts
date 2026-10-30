export type WorkspaceBackupScope = { kind: 'workspace' } | { kind: 'project'; projectId: string } | { kind: 'apps'; appIds: string[] };
export type WorkspaceBackupSections = { discussions: boolean; promptTemplates: boolean; appTemplates: boolean; settings: boolean; versionConfigs: boolean };
export type WorkspaceBackupRequest = { fingerprint: string; requestId: string };

const sectionKeys: (keyof WorkspaceBackupSections)[] = ['discussions', 'promptTemplates', 'appTemplates', 'settings', 'versionConfigs'];

export function buildWorkspaceBackupQuery(scope: WorkspaceBackupScope, sections: WorkspaceBackupSections): string {
  const params = new URLSearchParams();
  if (scope.kind === 'project') {
    if (!scope.projectId) throw new Error('请选择要导出的项目。');
    params.set('projectId', scope.projectId);
  } else if (scope.kind === 'apps') {
    if (!scope.appIds.length || scope.appIds.length > 10 || new Set(scope.appIds).size !== scope.appIds.length) throw new Error('请选择 1–10 个不重复的应用。');
    for (const id of scope.appIds) params.append('appId', id);
  }
  for (const key of sectionKeys) params.set(key, String(sections[key]));
  return params.toString();
}

export function workspaceBackupRequestFingerprint(previewHash: string): string {
  return JSON.stringify(['workspace-backup-import', previewHash]);
}

export function stableWorkspaceBackupRequest(previous: WorkspaceBackupRequest | null, previewHash: string, createId: () => string): WorkspaceBackupRequest {
  const fingerprint = workspaceBackupRequestFingerprint(previewHash);
  if (previous?.fingerprint === fingerprint) return previous;
  return { fingerprint, requestId: createId() };
}

export function isLegacyAppBackup(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.format === 'motes-backup' && record.version === 1;
}

export function formatBackupBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
