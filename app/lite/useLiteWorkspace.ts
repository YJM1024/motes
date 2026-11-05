'use client';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/forma/types';
import type { WorkspaceSnapshot } from '@/lib/motes/types';
import type { RecoveryContext } from '@/lib/motes/recovery-state';
import { liteApi } from './api';
import { validLiteProject } from './state';
export type LiteSession = { workspaceId: string; visibility: 'shared' | 'private'; mode: 'demo' | 'model'; model: string | null };
export function useLiteWorkspace() {
  const [session, setSession] = useState<LiteSession | null>(null), [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [project, setProject] = useState<Project | null>(null), [groupId, setGroupId] = useState(''), [newContext, setNewContext] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const context: RecoveryContext = project ? { projectId: project.id } : { managedProjectId: groupId || undefined, contextId: newContext || undefined };
  const navigation = useRef(0), epoch = useRef(0), groupRef = useRef(groupId); groupRef.current = groupId;
  function persist(nextGroup: string, appId?: string, contextId?: string) { if (!session) return; try { sessionStorage.setItem('motes-lite-selection:' + session.workspaceId, JSON.stringify({ groupId: nextGroup, appId, contextId })); } catch {} }
  async function refresh() { const next = await liteApi<WorkspaceSnapshot>('/api/workspace'); setSnapshot(next); return next; }
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void (async () => {
      setLoading(true); setError('');
      try {
        const current = await liteApi<LiteSession>('/api/session', undefined, controller.signal);
        const next = await liteApi<WorkspaceSnapshot>('/api/workspace', undefined, controller.signal);
        if (!active) return;
        let saved: { groupId?: string; appId?: string; contextId?: string } = {};
        try { saved = JSON.parse(sessionStorage.getItem('motes-lite-selection:' + current.workspaceId) || '{}'); } catch {}
        const group = next.projects.find(g => g.id === saved?.groupId && !g.archived)?.id || next.workspace.defaultProjectId;
        setSession(current); setSnapshot(next); setGroupId(group); setNewContext(typeof saved?.contextId === 'string' ? saved.contextId : crypto.randomUUID());
        const app = next.apps.find(a => a.id === saved?.appId && !a.archived && a.projectId === group) || (!saved?.contextId ? next.apps.find(a => !a.archived && a.projectId === group) : undefined);
        if (app) { const result = await liteApi<{ project: Project }>('/api/projects/' + app.id, undefined, controller.signal); if (!validLiteProject(result.project, app.id)) throw new Error('应用保存记录尚未完整返回。'); if (active) setProject(result.project); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : '连接失败。'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [reload]);
  async function open(appId: string) {
    ++navigation.current; const run = ++epoch.current; setLoading(true); setError('');
    try { const result = await liteApi<{ project: Project }>('/api/projects/' + encodeURIComponent(appId)); if (run !== epoch.current) return; if (!validLiteProject(result.project, appId)) throw new Error('应用保存记录尚未完整返回。'); setProject(result.project); const group = snapshot?.apps.find(a => a.id === appId)?.projectId || groupRef.current; setGroupId(group); persist(group, appId); }
    catch (e) { if (run === epoch.current) setError(e instanceof Error ? e.message : '应用读取失败。'); }
    finally { if (run === epoch.current) setLoading(false); }
  }
  function create(group = groupId) { ++navigation.current; ++epoch.current; const id = crypto.randomUUID(); setProject(null); setGroupId(group); setNewContext(id); setError(''); setLoading(false); persist(group, undefined, id); }
  function switchGroup(group: string) { create(group); }
  function adopt(next: Project) { ++navigation.current; ++epoch.current; setProject(next); setLoading(false); persist(groupRef.current, next.id); }
  async function createGroup(name: string) {
    const before = new Set(snapshot?.projects.map(p => p.id)); const next = await liteApi<WorkspaceSnapshot>('/api/workspace', { action: 'project.create', name: name.trim() }); setSnapshot(next);
    const created = next.projects.find(g => !before.has(g.id) && g.name === name.trim()); if (created) switchGroup(created.id);
  }
  return { navigation, session, snapshot, project, groupId, context, loading, error, setError, refresh, open, create, switchGroup, adopt, createGroup, reconnect: () => setReload(n => n + 1) };
}


