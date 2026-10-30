'use client';

import { useCallback, useLayoutEffect, useRef, useState, type RefCallback, type UIEvent } from 'react';
import { normalizeScrollTop, panelScrollMemoryKey } from '@/lib/motes/panel-scroll-memory';

const scrollMemory = new Map<string, number>();

export function usePanelScrollMemory(workspaceId: string | null, appId: string | null, panel: 'chat' | 'preview') {
  const key = workspaceId && appId ? panelScrollMemoryKey(workspaceId, appId, panel) : null;
  const active = useRef<string | null>(key);
  const node = useRef<HTMLElement | null>(null);
  const restorationPending = useRef<string | null>(null);
  const [restoredScrollTop, setRestoredScrollTop] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect -- Restore only this workspace/app/panel's scroll position before paint. */
  useLayoutEffect(() => {
    active.current = key;
    const position = key ? (scrollMemory.get(key) ?? 0) : 0;
    if (node.current) node.current.scrollTop = position;
    restorationPending.current = key && position > 0 ? key : null;
    setRestoredScrollTop(position);
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const ref: RefCallback<HTMLElement> = useCallback(element => {
    node.current = element;
    if (element && active.current === key) element.scrollTop = key ? (scrollMemory.get(key) ?? 0) : 0;
  }, [key]);
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    if (!key || active.current !== key) return;
    scrollMemory.set(key, normalizeScrollTop(event.currentTarget.scrollTop));
  }, [key]);
  const consumeRestoration = useCallback(() => {
    if (!key || restorationPending.current !== key) return false;
    restorationPending.current = null;
    return true;
  }, [key]);

  return { ref, onScroll, restoredScrollTop, consumeRestoration };
}
