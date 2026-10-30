export type DisplayMode = 'summary' | 'detail';

export function displayModeStorageKey(workspaceId: string): string {
  return `motes:display-mode:${encodeURIComponent(workspaceId)}`;
}

export function parseDisplayMode(value: string | null): DisplayMode | null {
  return value === 'summary' || value === 'detail' ? value : null;
}
