"use client";

import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { RUNTIME_DATA_PROTOCOL, runtimeDataRequestFromEvent, validRuntimeHello } from '@/lib/motes/runtime-data-bridge';

type Props = {
  frameRef: RefObject<HTMLIFrameElement | null>;
  appId: string | null;
  versionId: string | null;
  channel: string | null;
  enabled: boolean;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IN_FLIGHT = 8;
const MAX_WRITES_PER_MINUTE = 30;

export default function RuntimeDataBridge({ frameRef, appId, versionId, channel, enabled }: Props) {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const frameWindow = frame?.contentWindow;
    if (!enabled || !frame || !frameWindow || !appId || !versionId || !channel || !uuid.test(appId) || !uuid.test(versionId) || !/^[a-f0-9]{32}$/.test(channel)) return;
    let active = true;
    let ready = false;
    let highestSequence = 0;
    let writes = 0;
    let writeWindow = Date.now();
    const activeRequests = new Set<string>();
    const controller = new AbortController();
    const respond = (payload: Record<string, unknown>) => { if (active) frameWindow.postMessage({ protocol: RUNTIME_DATA_PROTOCOL, channel, ...payload }, '*'); };
    const initialize = async () => {
      try {
        const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        const session = await response.json() as { visibility?: unknown };
        if (!response.ok || session.visibility !== 'shared') throw new Error('共享运行数据不可用。');
        if (active) ready = true;
      } catch {
        if (active) ready = false;
        return false;
      }
      return true;
    };
    let sessionPromise: Promise<boolean> | null = null;
    const receive = async (event: MessageEvent) => {
      if (!active || event.source !== frameWindow || event.origin !== 'null') return;
      if (validRuntimeHello(event, frameWindow, channel)) {
        sessionPromise ??= initialize();
        const ok = await sessionPromise;
        if (active) respond({ kind: 'ready', ok, ...ok ? {} : { error: '当前预览没有连接共享数据服务。' } });
        return;
      }
      const request = runtimeDataRequestFromEvent(event, frameWindow, channel, highestSequence);
      if (!request) return;
      highestSequence = request.sequence;
      if (!ready || activeRequests.size >= MAX_IN_FLIGHT) {
        respond({ kind: 'result', requestId: request.requestId, ok: false, error: { code: ready ? 'busy' : 'unavailable', message: ready ? '当前有太多数据操作正在等待。' : '共享数据服务尚未就绪。' } });
        return;
      }
      if (request.action === 'set') {
        const now = Date.now();
        if (now < writeWindow || now - writeWindow >= 60_000) { writeWindow = now; writes = 0; }
        if (writes >= MAX_WRITES_PER_MINUTE) {
          respond({ kind: 'result', requestId: request.requestId, ok: false, error: { code: 'rate_limit', message: '保存过于频繁，请稍后再试。' } });
          return;
        }
        writes++;
      }
      activeRequests.add(request.requestId);
      try {
        const response = await fetch('/api/runtime-data', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: request.action, appId, versionId, key: request.key, ...(request.action === 'set' ? { value: request.value, expectedRevision: request.expectedRevision } : {}) }),
        });
        const result = await response.json() as Record<string, unknown>;
        if (!active) return;
        if (response.ok) respond({ kind: 'result', requestId: request.requestId, ok: true, result: request.action === 'get' ? { key: result.key, value: result.value, revision: result.revision, updatedAt: result.updatedAt } : { key: result.key, revision: result.revision, updatedAt: result.updatedAt } });
        else respond({ kind: 'result', requestId: request.requestId, ok: false, error: { code: typeof result.code === 'string' ? result.code : `http_${response.status}`, message: typeof result.error === 'string' ? result.error : '共享数据暂时无法保存。', ...(Number.isSafeInteger(result.revision) ? { revision: result.revision } : {}) } });
      } catch {
        if (active) respond({ kind: 'result', requestId: request.requestId, ok: false, error: { code: 'unavailable', message: '共享数据暂时无法连接，请保留当前内容后重试。' } });
      } finally { activeRequests.delete(request.requestId); }
    };
    window.addEventListener('message', receive);
    return () => { active = false; controller.abort(); activeRequests.clear(); window.removeEventListener('message', receive); };
  }, [frameRef, appId, versionId, channel, enabled]);

  return null;
}
