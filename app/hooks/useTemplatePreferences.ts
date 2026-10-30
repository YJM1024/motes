'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_TEMPLATE_PREFERENCES, parseTemplatePreferences, templatePreferencesKey, type TemplatePreferences } from '@/lib/motes/template-preferences';

const memory = new Map<string, TemplatePreferences>();
type Session = { workspaceId?: string };
export function useTemplatePreferences() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<TemplatePreferences>(EMPTY_TEMPLATE_PREFERENCES);
  const current = useRef(EMPTY_TEMPLATE_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/session', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('session');
        const session = await response.json() as Session;
        if (!session.workspaceId) throw new Error('identity');
        const id = session.workspaceId;
        let value = memory.get(id) || EMPTY_TEMPLATE_PREFERENCES;
        try { const saved = localStorage.getItem(templatePreferencesKey(id)); if (saved !== null) value = parseTemplatePreferences(saved); memory.set(id, value); }
        catch { if (alive) setUnavailable(true); }
        if (alive) { current.current=value;setWorkspaceId(id); setPreferences(value); setReady(true); }
      } catch { if (alive) { setReady(true); setUnavailable(true); } }
    })();
    return () => { alive = false; };
  }, []);
  const update = useCallback((transform: (current: TemplatePreferences) => TemplatePreferences) => {
    if (!workspaceId) return;
    const next=transform(current.current);current.current=next;setPreferences(next);memory.set(workspaceId,next);
    try { localStorage.setItem(templatePreferencesKey(workspaceId),JSON.stringify(next)); }
    catch { setUnavailable(true); }
  }, [workspaceId]);
  return { workspaceId, preferences, ready, unavailable, update };
}
