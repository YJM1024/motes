'use client';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Project } from '@/lib/forma/types';
import { useAttemptRecovery } from '@/app/hooks/useAttemptRecovery';
import { contextKey, matchesContext, restoredAttempts, removeFinishedAttempt, failOriginalAttempt, prepareRecoveryRetry, type RecoveryAttempt, type RecoveryContext } from '@/lib/motes/recovery-state';
import { generationBody, validLiteProject } from './state';
import { LiteApiError, liteApi } from './api';

type Props = { workspaceId: string | null; context: RecoveryContext; baseVersionId?: string; navigation: RefObject<number>; enabled: boolean; onSaved: (project: Project, attempt: RecoveryAttempt) => void };
export function useLiteGeneration({ workspaceId, context, baseVersionId, navigation, enabled, onSaved }: Props) {
  const [attempts, setAttempts] = useState<RecoveryAttempt[]>([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [generation, setGeneration] = useState(0);
  const all = useRef<RecoveryAttempt[]>([]), owner = useRef<string | null>(null), epoch = useRef(0), active = useRef<{ attempt: RecoveryAttempt; controller: AbortController } | null>(null);
  const navigationVersion = navigation.current; const scope = contextKey(context), scopeRef = useRef(scope), mounted = useRef(true); scopeRef.current = scope;
  const savedCallback = useRef(onSaved); savedCallback.current = onSaved;
  const storageKey = workspaceId ? 'motes-lite-outbox:' + workspaceId : '';
  function write(next: RecoveryAttempt[]) {
    all.current = next; setAttempts(next);
    if (owner.current) { try { sessionStorage.setItem('motes-lite-outbox:' + owner.current, JSON.stringify(next)); } catch { setNotice('浏览器不能保存请求记录，请保持此页打开直到结果确认。'); } }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.controller.abort(); }; }, []);
  useLayoutEffect(() => {
    if (owner.current === workspaceId) return;
    owner.current = workspaceId;
    let recovered: RecoveryAttempt[] = [];
    try { recovered = restoredAttempts(storageKey ? sessionStorage.getItem(storageKey) : null); } catch {}
    all.current = recovered; setAttempts(recovered);
  }, [workspaceId, storageKey]);
  useLayoutEffect(() => {
    ++epoch.current;
    if (active.current) { const previous = active.current; active.current = null; previous.controller.abort(); write(failOriginalAttempt(all.current, previous.attempt, '已离开原操作。结果尚未确认，请核对原请求。')); }
    setBusy(false); setNotice(''); setGeneration(n => n + 1);
  }, [scope, navigationVersion]);
  function accept(attempt: RecoveryAttempt, project: Project) {
    if (!validLiteProject(project, attempt.projectId)) throw new Error('保存结果尚未完整返回，请核对原请求。');
    write(removeFinishedAttempt(all.current, attempt)); setBusy(false); active.current = null;
    setNotice(`服务端已返回并保存版本 v${project.versions.find(v => v.id === project.currentVersionId)?.number ?? ''}。请在预览中检查功能。`);
    savedCallback.current(project, attempt);
  }
  const recovery = useAttemptRecovery({ attempts, context, enabled: !!workspaceId && enabled && !busy, generation,
    isCurrentGeneration: run => run === epoch.current && navigation.current === navigationVersion,
    onRecovered: async (attempt, receipt, guard) => {
      const captured = scopeRef.current;
      const result = await liteApi<{ project: Project }>('/api/projects/' + receipt.projectId, undefined, guard.signal);
      if (!guard.isCurrent() || !mounted.current || captured !== scopeRef.current || !matchesContext(attempt, context)) return;
      if (!validLiteProject(result.project, receipt.projectId) || result.project.id !== receipt.projectId || !result.project.versions.some(v => v.id === receipt.resultVersionId)) throw new Error('原请求保存结果尚未完整返回。');
      if (guard.isCurrent() && mounted.current && captured === scopeRef.current && matchesContext(attempt, context)) accept(attempt, result.project);
    } });
  async function send(text: string, mode: 'demo' | 'model', retry?: RecoveryAttempt) {
    if (!workspaceId || !enabled || active.current || !text.trim()) return;
    const pending = all.current.filter(a => matchesContext(a, context));
    if (!retry && pending.length) { setNotice('先核对或处理原请求，再发送新需求；下一条草稿已保留。'); return; }
    const state = retry ? recovery.stateFor(retry) : undefined;
    let attempt: RecoveryAttempt;
    if (retry) {
      if (state?.retry === 'save') attempt = { ...retry, state: 'sending', recovered: false, error: undefined };
      else if (retry.retryConfirmed) attempt = { ...retry, requestId: crypto.randomUUID(), state: 'sending', recovered: false, error: undefined, retryConfirmed: false };
      else { const next = state && prepareRecoveryRetry(retry, state, scope, () => crypto.randomUUID()); if (!next) return; attempt = next; }
    } else attempt = { id: crypto.randomUUID(), requestId: crypto.randomUUID(), text: text.trim(), mode, ...context, baseVersionId: context.projectId ? baseVersionId : undefined, state: 'sending', startedAt: Date.now() };
    const controller = new AbortController(), run = ++epoch.current, captured = scope, nav = navigation.current;
    setGeneration(run); active.current = { attempt, controller }; setBusy(true); setNotice('请求已发出，正在等待响应；服务端接收与保存状态尚未确认。');
    write(retry ? all.current.map(a => a.id === attempt.id ? attempt : a) : [...all.current, attempt]);
    const current = () => mounted.current && navigation.current === nav && epoch.current === run && scopeRef.current === captured && active.current?.attempt.requestId === attempt.requestId;
    try {
      const result = await liteApi<{ project: Project }>('/api/generate', generationBody(attempt), controller.signal);
      if (current()) accept(attempt, result.project);
    } catch (e) {
      if (!current()) return;
      if (e instanceof LiteApiError && e.status === 422 && attempt.mode === 'demo') {
        write(removeFinishedAttempt(all.current, attempt)); active.current = null; setBusy(false);
        setNotice('示例模式暂不支持这项需求，请编辑需求后再发送。原有成果和输入已保留。'); return;
      }
      const message = e instanceof Error ? e.message : '结果尚未确认。';
      write(failOriginalAttempt(all.current, attempt, message, e instanceof LiteApiError && (e.retry === 'new' || [400, 422, 429].includes(e.status))));
      setNotice(message + ' 原成果和需求已保留。'); active.current = null; setBusy(false);
    }
  }
  function stop() {
    const pending = active.current; if (!pending) return;
    ++epoch.current; setGeneration(epoch.current); active.current = null; pending.controller.abort();
    write(failOriginalAttempt(all.current, pending.attempt, '已停止本页等待；请核对原请求，服务端执行及模型费用可能继续。')); setBusy(false); setNotice('已停止本页等待。原请求可能继续执行并产生模型费用，请先核对结果。');
  }
  function dismiss(attempt: RecoveryAttempt) { const state = recovery.stateFor(attempt); if (attempt.retryConfirmed || state?.retry === 'new') write(removeFinishedAttempt(all.current, attempt)); }
  return { dismiss, attempts: attempts.filter(a => matchesContext(a, context)), busy, notice, recovery, send, stop };
}






