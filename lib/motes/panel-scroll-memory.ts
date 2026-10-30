export function panelScrollMemoryKey(workspaceId: string, appId: string, panel: 'chat' | 'preview'): string {
  return `${encodeURIComponent(workspaceId)}:${encodeURIComponent(appId)}:${panel}`;
}

export function normalizeScrollTop(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
