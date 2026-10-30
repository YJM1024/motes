'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {LOCAL_DATA_EVENT,type LocalDataEvent} from '@/lib/motes/local-data';
import { displayModeStorageKey, parseDisplayMode, type DisplayMode } from '@/lib/motes/display-mode';

export type DisplayModeStorageStatus = 'loading' | 'local' | 'memory' | 'disabled' | 'unavailable';

export function useDisplayMode(workspaceId: string | null, enabled: boolean) {
  const [mode, setModeState] = useState<DisplayMode>('summary');
  const [ready, setReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState<DisplayModeStorageStatus>('loading');
  const active = useRef({ workspaceId, enabled });
  const memory = useRef(new Map<string, DisplayMode>());

  useLayoutEffect(() => {
    const scope = { workspaceId, enabled };
    active.current = scope;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset identity-scoped external storage before painting the new workspace.
    setReady(false);
    if (!workspaceId) {
      setModeState('summary');
      setStorageStatus('disabled');
      setReady(true);
      return;
    }
    const cached = memory.current.get(workspaceId);
    if (!enabled) {
      setModeState(cached ?? 'summary');
      setStorageStatus('disabled');
      setReady(true);
      return;
    }
    try {
      const stored = parseDisplayMode(window.localStorage.getItem(displayModeStorageKey(workspaceId)));
      const restored = stored ?? cached ?? 'summary';
      memory.current.set(workspaceId, restored);
      setModeState(restored);
      setStorageStatus('local');
    } catch {
      setModeState(cached ?? 'summary');
      setStorageStatus('memory');
    }
    setReady(true);
  }, [workspaceId, enabled]);

  useEffect(()=>{const receive=(event:Event)=>{const detail=(event as CustomEvent<LocalDataEvent>).detail;if(detail?.scope!=='display'||detail.workspaceId!==workspaceId||!workspaceId)return;memory.current.delete(workspaceId);setModeState('summary');setStorageStatus(enabled?'local':'disabled');};window.addEventListener(LOCAL_DATA_EVENT,receive);return()=>window.removeEventListener(LOCAL_DATA_EVENT,receive);},[workspaceId,enabled]);
  const setMode = useCallback((next: DisplayMode) => {
    const scope = active.current;
    if (!scope.workspaceId || scope.workspaceId !== workspaceId || scope.enabled !== enabled) return;
    memory.current.set(scope.workspaceId, next);
    if (scope.enabled) {
      try {
        window.localStorage.setItem(displayModeStorageKey(scope.workspaceId), next);
        setStorageStatus('local');
      } catch {
        setStorageStatus('memory');
      }
    }
    setModeState(next);
  }, [workspaceId, enabled]);

  return { mode, setMode, ready, storageStatus };
}
