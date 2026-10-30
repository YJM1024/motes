/** Extract display text only; generated HTML is never executed to name an app. */
export function initialAppTitle(html: string, prompt: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const raw = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '';
  const decoded = raw.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
    const value = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : '';
  });
  const clean = (value: string) => value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  const name = clean(decoded);
  const useful = name && !/^(?:document|html document|untitled(?: document)?|new (?:app|page)|my app|app|title|网页|页面|无标题(?:文档|页面)?|新建(?:应用|页面))\s*[.!。！]?$/i.test(name);
  return Array.from(useful ? name : clean(prompt) || '新应用').slice(0, useful ? 40 : 24).join('');
}
