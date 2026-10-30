export const STYLE_PRESET_OPTIONS = {
  palette: ['neutral', 'ocean', 'forest', 'sunset'],
  typography: ['system', 'serif', 'mono'],
  density: ['compact', 'comfortable', 'airy'],
  corners: ['sharp', 'soft', 'round'],
  layout: ['default', 'centered', 'wide'],
} as const;
export type StylePreset = { palette: typeof STYLE_PRESET_OPTIONS.palette[number]; typography: typeof STYLE_PRESET_OPTIONS.typography[number]; density: typeof STYLE_PRESET_OPTIONS.density[number]; corners: typeof STYLE_PRESET_OPTIONS.corners[number]; layout: typeof STYLE_PRESET_OPTIONS.layout[number] };
export const DEFAULT_STYLE_PRESET: StylePreset = { palette: 'neutral', typography: 'system', density: 'comfortable', corners: 'soft', layout: 'default' };
const palettes = {
  neutral: { bg: '#f5f6f7', surface: '#ffffff', text: '#27313a', muted: '#687580', accent: '#536b82', border: '#dbe1e5' },
  ocean: { bg: '#eef5f8', surface: '#ffffff', text: '#173b4e', muted: '#527486', accent: '#18799a', border: '#c9dce4' },
  forest: { bg: '#f0f5ef', surface: '#ffffff', text: '#294233', muted: '#657b6a', accent: '#38764d', border: '#d3e0d4' },
  sunset: { bg: '#fbf2ed', surface: '#ffffff', text: '#4b3027', muted: '#8b6758', accent: '#c26745', border: '#ead8ce' },
} as const;
const fonts = { system: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, monospace' } as const;
const density = { compact: { pad: '0.45rem', line: '1.35' }, comfortable: { pad: '0.8rem', line: '1.55' }, airy: { pad: '1.15rem', line: '1.8' } } as const;
const corners = { sharp: '2px', soft: '8px', round: '16px' } as const;
const layouts = { default: 'none', centered: '760px', wide: '1200px' } as const;
const start = '<!-- motes-style-preset:start -->', end = '<!-- motes-style-preset:end -->';

export function stylePresetCss(preset: StylePreset): string {
  if (!STYLE_PRESET_OPTIONS.palette.includes(preset.palette) || !STYLE_PRESET_OPTIONS.typography.includes(preset.typography) || !STYLE_PRESET_OPTIONS.density.includes(preset.density) || !STYLE_PRESET_OPTIONS.corners.includes(preset.corners) || !STYLE_PRESET_OPTIONS.layout.includes(preset.layout)) throw new Error('样式预设包含不支持的选项。');
  const p = palettes[preset.palette], d = density[preset.density];
  const maxWidth = layouts[preset.layout];
  return `:root{color-scheme:light;--motes-bg:${p.bg};--motes-surface:${p.surface};--motes-text:${p.text};--motes-muted:${p.muted};--motes-accent:${p.accent};--motes-border:${p.border};--motes-space:${d.pad};--motes-radius:${corners[preset.corners]}}body{font-family:${fonts[preset.typography]}!important;line-height:${d.line}!important;color:var(--motes-text)!important;background-color:var(--motes-bg)!important}${maxWidth === 'none' ? '' : `;max-width:${maxWidth}!important;margin-inline:auto!important`};button,input,select,textarea,[role=button]{font:inherit!important;border-radius:var(--motes-radius)!important}input,select,textarea{background-color:var(--motes-surface)!important;color:var(--motes-text)!important;border-color:var(--motes-border)!important}button,[role=button]{background-color:var(--motes-accent)!important;color:#fff!important;border-color:var(--motes-accent)!important}a{color:var(--motes-accent)!important}main,section,article,form,header,footer,nav{border-radius:var(--motes-radius)!important}p,li,label,button,input,select,textarea{line-height:${d.line}!important}body>main,body>div,main>section,main>div{padding:var(--motes-space)!important}`;
}

type CommentMarker = { value: string; start: number; end: number; inHead: boolean };
function inspectDocument(html: string): { headClose: number; markers: CommentMarker[] } {
  let i = 0, inHead = false, headClose = -1;
  const markers: CommentMarker[] = [];
  while (i < html.length) {
    const lt = html.indexOf('<', i); if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4); if (close < 0) break;
      const value = html.slice(lt, close + 3);
      if (value === start || value === end) markers.push({ value, start: lt, end: close + 3, inHead });
      i = close + 3; continue;
    }
    const rest = html.slice(lt);
    const rawTag = /^<(script|style|title|noscript)\b/i.exec(rest);
    let quote = '', tagEnd = lt + 1;
    for (; tagEnd < html.length; tagEnd++) { const c = html[tagEnd]; if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') { tagEnd++; break; } }
    if (rawTag) {
      const close = new RegExp(`<\\/${rawTag[1]}\\s*>`, 'ig'); close.lastIndex = tagEnd;
      const found = close.exec(html); i = found ? close.lastIndex : html.length; continue;
    }
    const token = rest.slice(0, tagEnd - lt);
    if (/^<head(?:\s|>)/i.test(token)) inHead = true;
    else if (/^<\/head\s*>$/i.test(token) && inHead) { headClose = lt; inHead = false; break; }
    i = tagEnd;
  }
  return { headClose, markers };
}

/** Inserts only enum-derived CSS in a uniquely marked block in the source head. */
export function applyStylePreset(html: string, preset: StylePreset): string {
  const css = stylePresetCss(preset);
  const inspected = inspectDocument(html), inHeadMarkers = inspected.markers.filter(marker => marker.inHead);
  if (inspected.markers.some(marker => !marker.inHead)) throw new Error('发现不在 head 内的预设样式标记，未修改源码。');
  let clean = html;
  if (inHeadMarkers.length) {
    if (inHeadMarkers.length !== 2 || inHeadMarkers[0].value !== start || inHeadMarkers[1].value !== end) throw new Error('预设样式标记不完整，未修改源码。');
    clean = html.slice(0, inHeadMarkers[0].start) + html.slice(inHeadMarkers[1].end);
  }
  const at = inspectDocument(clean).headClose;
  if (at < 0) throw new Error('未找到 HTML head 结束标记，无法应用预设。');
  const block = `${start}<style id="motes-style-preset">${css}</style>${end}`;
  return clean.slice(0, at) + block + clean.slice(at);
}
