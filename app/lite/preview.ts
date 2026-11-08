import { renderApplicationHtml } from '@/lib/motes/react-render';
import { safeDocument, PREVIEW_POLICY } from '@/lib/motes/preview-document';
import { runtimeDataClientScript } from '@/lib/motes/runtime-data-client';
import { runtimeBridgeScript } from '@/lib/motes/runtime-preview';
export async function litePreview(html: string, channel: string, origin: string, shared: boolean) {
  const doc = new DOMParser().parseFromString(safeDocument(await renderApplicationHtml(html), PREVIEW_POLICY), 'text/html');
  const script = doc.createElement('script');
  script.textContent = runtimeBridgeScript(channel, origin) + (shared ? runtimeDataClientScript(channel, origin) : '');
  doc.head.insertBefore(script, doc.head.firstChild?.nextSibling || null);
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}
