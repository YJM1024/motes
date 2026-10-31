import type { HostMessageKey } from './locale';
export type PublicationPreflight = {
  errors: HostMessageKey[];
  warnings: HostMessageKey[];
  htmlLength: number;
};

/** Static hints only: this function never parses or executes source HTML. */
export function publicationPreflight(html: string, maxChars = 180_000): PublicationPreflight {
  const source = typeof html === 'string' ? html : '';
  const errors: HostMessageKey[] = [];
  const warnings: HostMessageKey[] = [];
  const htmlLength = Array.from(source).length;
  if (!source.trim()) errors.push('发布版本没有 HTML 内容。');
  if (htmlLength > maxChars) errors.push('HTML 超出发布上限。');
  if (source.trim() && !/<html\b/i.test(source)) warnings.push('未发现 HTML 根元素；静态检查不能判断页面是否可运行。');
  if (source.trim() && !/<body\b/i.test(source)) warnings.push('未发现 body 元素；静态检查不能判断页面是否可运行。');
  if (/\b(?:src|href)\s*=\s*["']\s*https?:\/\//i.test(source) || /url\(\s*["']?\s*https?:\/\//i.test(source)) {
    warnings.push('发现外部资源地址；公开预览的网络策略可能阻止这些资源加载。');
  }
  if (/\b(?:href|src)\s*=\s*["']\s*javascript\s*:/i.test(source)) {
    warnings.push('发现 javascript: 地址；发布前请人工检查来源代码。');
  }
  return { errors, warnings, htmlLength };
}
