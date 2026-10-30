export type SourceMatch = { start: number; end: number };
export type SourceToken = { start: number; end: number; kind: 'tag' | 'attribute' | 'string' | 'comment' };

export function findSourceMatches(source: string, query: string, options: { caseSensitive?: boolean } = {}, limit = 1000): { matches: SourceMatch[]; truncated: boolean } {
  if (!query || limit <= 0) return { matches: [], truncated: false };
  const haystack = options.caseSensitive ? source : source.toLocaleLowerCase();
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  const matches: SourceMatch[] = [];
  let from = 0;
  while (from <= source.length - query.length) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) break;
    if (matches.length === limit) return { matches, truncated: true };
    matches.push({ start, end: start + query.length });
    from = start + Math.max(1, query.length);
  }
  return { matches, truncated: false };
}

// Deliberately small HTML highlighter. Token boundaries are approximate; all output remains React text.
export function tokenizeHtml(source: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const close = source.indexOf('-->', start + 4);
      const end = close < 0 ? source.length : close + 3;
      tokens.push({ start, end, kind: 'comment' }); cursor = end; continue;
    }
    if (!/^<\/?[A-Za-z]/.test(source.slice(start, start + 3))) { cursor = start + 1; continue; }
    let quote = '';
    let end = start + 1;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (quote) { if (ch === quote) quote = ''; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') { end++; break; }
    }
    const text = source.slice(start, end);
    cursor = end;
    if (!text.endsWith('>')) continue;
    const tagEnd = start + (text.match(/^<\/?[\w:-]+/)?.[0].length ?? 1);
    tokens.push({ start, end: tagEnd, kind: 'tag' });
    const rest = text.slice(tagEnd - start, -1);
    const attrs = /([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g;
    for (const attr of rest.matchAll(attrs)) {
      const attrStart = tagEnd + (attr.index ?? 0);
      tokens.push({ start: attrStart, end: attrStart + attr[1].length, kind: 'attribute' });
      const value = attr[3];
      const valueStart = attrStart + attr[0].lastIndexOf(value);
      tokens.push({ start: valueStart, end: valueStart + value.length, kind: 'string' });
    }
    tokens.push({ start: start + text.length - 1, end: start + text.length, kind: 'tag' });
  }
  return tokens;
}
