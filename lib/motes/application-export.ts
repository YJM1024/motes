import { parseReactProject } from './react-project';
/** A downloaded page has no host data bridge; keep that limitation visible offline. */
export function exportApplicationHtml(source: string, rendered: string): string {
  if (!parseReactProject(source)) return rendered;
  const notice = '<aside role="status" style="position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483647;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#334155;font:12px/1.5 system-ui,sans-serif;box-shadow:0 2px 8px #0001">独立导出页面 · SDK 数据桥不可用。当前输入仅作临时使用，不会写回工作台。</aside>';
  return rendered.replace(/<\/body>/i, notice + '</body>');
}
