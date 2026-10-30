import { safeDocument, PREVIEW_POLICY } from './preview-document';
import { RUNTIME_PROTOCOL } from './runtime-diagnostics';

export function runtimeBridgeScript(channel: string, targetOrigin: string): string {
  if (!/^[a-f0-9]{32}$/.test(channel)) throw new Error('预览诊断通道无效。');
  const origin = new URL(targetOrigin);
  if (!['http:','https:'].includes(origin.protocol) || origin.origin !== targetOrigin) throw new Error('预览父窗口来源无效。');
  // A self-contained script string stays independent of client-bundle renaming/hoisting.
  return `(() => {
    "use strict";
    const channel = ${JSON.stringify(channel)}, targetOrigin = ${JSON.stringify(targetOrigin)}, protocol = ${JSON.stringify(RUNTIME_PROTOCOL)};
    let total = 0, start = 0, count = 0;
    const names = ['Error','TypeError','ReferenceError','SyntaxError','RangeError','EvalError','URIError','AggregateError'];
    function type(reason, fallback) { try { if (reason instanceof Error && typeof reason.name === 'string' && names.includes(reason.name)) return reason.name; } catch {} return fallback; }
    function position(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1000000, Math.trunc(value))) : 0; }
    function emit(kind, errorType, line = 0, column = 0) {
      const now = Date.now(); if (now < start || now - start >= 1500) { start = now; count = 0; }
      if (total >= 10 || count >= 3) return; total++; count++;
      window.parent.postMessage({ protocol, channel, kind, errorType, line: position(line), column: position(column) }, targetOrigin);
    }
    window.addEventListener('error', event => { if (event instanceof ErrorEvent) emit('error', type(event.error, 'Error'), event.lineno, event.colno); });
    window.addEventListener('unhandledrejection', event => emit('unhandledrejection', type(event.reason, 'UnhandledRejection')));
  })();`;
}
export function runtimePreview(html: string, channel: string, targetOrigin: string): string {
  const doc = new DOMParser().parseFromString(safeDocument(html, PREVIEW_POLICY), 'text/html');
  const bridge = doc.createElement('script'); bridge.textContent = runtimeBridgeScript(channel, targetOrigin);
  // The policy remains first, followed by our listener before application scripts.
  doc.head.insertBefore(bridge, doc.head.firstChild?.nextSibling || null);
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}
