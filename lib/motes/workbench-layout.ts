export type WorkbenchMode = 'split' | 'chat' | 'preview';
export type WorkbenchLayout = { mode: WorkbenchMode; sidebarCollapsed: boolean; chatWidth: number };

export const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayout = { mode: 'split', sidebarCollapsed: false, chatWidth: 440 };
export const CHAT_WIDTH_MIN = 280;
export const CHAT_WIDTH_MAX = 720;

export function workbenchLayoutStorageKey(workspaceId: string): string {
  return `motes:workbench-layout:${encodeURIComponent(workspaceId)}`;
}

export function clampChatWidth(value: number, min = CHAT_WIDTH_MIN, max = CHAT_WIDTH_MAX): number {
  const safeMin = Math.max(1, Math.round(min));
  const safeMax = Math.max(safeMin, Math.round(max));
  const safeValue = Number.isFinite(value) ? Math.round(value) : DEFAULT_WORKBENCH_LAYOUT.chatWidth;
  return Math.max(safeMin, Math.min(safeMax, safeValue));
}

export function parseWorkbenchLayout(value: string | null): WorkbenchLayout | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<WorkbenchLayout>;
    if (!parsed || !['split', 'chat', 'preview'].includes(parsed.mode || '') || typeof parsed.sidebarCollapsed !== 'boolean' || typeof parsed.chatWidth !== 'number' || !Number.isFinite(parsed.chatWidth)) return null;
    return { mode: parsed.mode as WorkbenchMode, sidebarCollapsed: parsed.sidebarCollapsed, chatWidth: clampChatWidth(parsed.chatWidth) };
  } catch { return null; }
}

