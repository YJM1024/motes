import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/motes/style-presets.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('injects only whitelisted CSS into head and replaces its unique block idempotently', () => {
  const html = '<!doctype html><html><head><title>Demo</title></head><body><main>Hello</main></body></html>';
  const first = mod.applyStylePreset(html, { ...mod.DEFAULT_STYLE_PRESET, palette: 'ocean' });
  const second = mod.applyStylePreset(first, { ...mod.DEFAULT_STYLE_PRESET, palette: 'forest' });
  assert.equal((second.match(/motes-style-preset:start/g) || []).length, 1);
  assert.equal((second.match(/motes-style-preset:end/g) || []).length, 1);
  assert.match(second, /--motes-accent:#38764d/);
  assert.doesNotMatch(second, /--motes-accent:#18799a/);
  assert.equal(second.slice(0, second.indexOf('<!-- motes-style-preset:start -->')).includes('</head>'), false);
});

test('ignores head-like text in scripts/comments and rejects malformed markers or untrusted enums', () => {
  const html = '<html><head data-label=">"><!-- </head> --><script>const x="</head>"; // <!-- motes-style-preset:start --></script><title>literal </head> text</title></head><body></body></html>';
  const result = mod.applyStylePreset(html, mod.DEFAULT_STYLE_PRESET);
  assert(result.lastIndexOf('motes-style-preset:start') < result.lastIndexOf('</head>'));
  assert.throws(() => mod.applyStylePreset('<html><head><!-- motes-style-preset:start --></head><body></body></html>', mod.DEFAULT_STYLE_PRESET), /标记/);
  assert.throws(() => mod.applyStylePreset('<html><head></head></html>', { ...mod.DEFAULT_STYLE_PRESET, palette: 'red;body{display:none}' }), /不支持/);
});

test('preset CSS contains no external resource or user supplied values', () => {
  const css = mod.stylePresetCss(mod.DEFAULT_STYLE_PRESET);
  assert.doesNotMatch(css, /url\s*\(|https?:|javascript:/i);
});
