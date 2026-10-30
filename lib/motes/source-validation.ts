export const MAX_SOURCE_LENGTH = 180000;
/** Structural completeness only; does not promise that user JavaScript is correct. */
export function sourceProblem(value: string): string | null {
  if (value.length > MAX_SOURCE_LENGTH) return 'HTML 最多 180000 个字符。';
  const html = value.trim();
  if (html.length < 100 || !/^<!doctype\s+html\s*>/i.test(html) || !/<html(?:\s[^>]*)?>/i.test(html) || !/<head(?:\s[^>]*)?>[\s\S]*<\/head\s*>/i.test(html) || !/<body(?:\s[^>]*)?>[\s\S]*<\/body\s*>/i.test(html) || !/<\/html\s*>$/i.test(html)) return '请提供完整单文件 HTML：包含 doctype、html、head 和 body，至少 100 个字符。';
  return null;
}
