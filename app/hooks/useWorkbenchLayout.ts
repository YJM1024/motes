'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {LOCAL_DATA_EVENT,type LocalDataEvent} from '@/lib/motes/local-data';
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, clampChatWidth, DEFAULT_WORKBENCH_LAYOUT, parseWorkbenchLayout, workbenchLayoutStorageKey, type WorkbenchLayout, type WorkbenchMode } from '@/lib/motes/workbench-layout';

export type WorkbenchLayoutStorageStatus = 'loading' | 'local' | 'memory' | 'disabled';
const layoutMemory = new Map<string, WorkbenchLayout>();

export function useWorkbenchLayout(workspaceId: string | null, enabled: boolean) {
  const [layout, setLayout] = useState<WorkbenchLayout>(DEFAULT_WORKBENCH_LAYOUT);
  const [ready, setReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState<WorkbenchLayoutStorageStatus>('loading');
  const active = useRef({ workspaceId, enabled });
  const current = useRef<WorkbenchLayout>(DEFAULT_WORKBENCH_LAYOUT);

  /* eslint-disable react-hooks/set-state-in-effect -- Restore the scoped preference before paint to prevent the prior workspace layout flashing. */
  useLayoutEffect(() => {
    active.current = { workspaceId, enabled };
    setReady(false);
    if (!workspaceId) {
      current.current = DEFAULT_WORKBENCH_LAYOUT;
      setLayout(DEFAULT_WORKBENCH_LAYOUT);
      setStorageStatus('disabled');
      setReady(true);
      return;
    }
    const cached = layoutMemory.get(workspaceId);
    if (!enabled) {
      const restored = cached ?? DEFAULT_WORKBENCH_LAYOUT;
      current.current = restored;
      setLayout(restored);
      setStorageStatus('memory');
      setReady(true);
      return;
    }
    try {
      const stored = parseWorkbenchLayout(window.localStorage.getItem(workbenchLayoutStorageKey(workspaceId)));
      const restored = stored ?? cached ?? DEFAULT_WORKBENCH_LAYOUT;
      current.current = restored;
      layoutMemory.set(workspaceId, restored);
      setLayout(restored);
      setStorageStatus('local');
    } catch {
      const restored = cached ?? DEFAULT_WORKBENCH_LAYOUT;
      current.current = restored;
      setLayout(restored);
      setStorageStatus('memory');
    }
    setReady(true);
  }, [workspaceId, enabled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent<LocalDataEvent>).detail;if(detail?.scope!=='display'||detail.workspaceId!==workspaceId||!workspaceId)return;layoutMemory.delete(workspaceId);current.current=DEFAULT_WORKBENCH_LAYOUT;setLayout(DEFAULT_WORKBENCH_LAYOUT);setStorageStatus(enabled?'local':'memory');};window.addEventListener(LOCAL_DATA_EVENT,receive);return()=>window.removeEventListener(LOCAL_DATA_EVENT,receive);},[workspaceId,enabled]);
  const update = useCallback((patch: Partial<WorkbenchLayout>) => {
    const scope = active.current;
    if (!scope.workspaceId || scope.workspaceId !== workspaceId || scope.enabled !== enabled) return;
    const next = { ...current.current, ...patch, chatWidth: clampChatWidth(patch.chatWidth ?? current.current.chatWidth, CHAT_WIDTH_MIN, CHAT_WIDTH_MAX) };
    current.current = next;
    layoutMemory.set(scope.workspaceId, next);
    if (scope.enabled) {
      try {
        window.localStorage.setItem(workbenchLayoutStorageKey(scope.workspaceId), JSON.stringify(next));
        setStorageStatus('local');
      } catch { setStorageStatus('memory'); }
    } else setStorageStatus('memory');
    setLayout(next);
  }, [workspaceId, enabled]);

  const setMode = useCallback((mode: WorkbenchMode) => update({ mode }), [update]);
  const setSidebarCollapsed = useCallback((sidebarCollapsed: boolean) => update({ sidebarCollapsed }), [update]);
  const setChatWidth = useCallback((chatWidth: number) => update({ chatWidth }), [update]);
  return { ...layout, setMode, setSidebarCollapsed, setChatWidth, ready, storageStatus };
}
