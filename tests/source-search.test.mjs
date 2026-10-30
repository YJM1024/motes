import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'file:///D:/gpt/sites/mini-atoms/node_modules/typescript/lib/typescript.js';

const source = await readFile(new URL('../lib/motes/source-search.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('finds non-overlapping UTF-16 text matches and limits displayed results', () => {
  assert.deepEqual(mod.findSourceMatches('é ABC abc', 'abc').matches, [{ start: 2, end: 5 }, { start: 6, end: 9 }]);
  assert.deepEqual(mod.findSourceMatches('aaaa', 'aa').matches, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.deepEqual(mod.findSourceMatches('x x x', 'x', {}, 2), { matches: [{ start: 0, end: 1 }, { start: 2, end: 3 }], truncated: true });
  assert.deepEqual(mod.findSourceMatches('abc', '').matches, []);
  assert.equal(mod.findSourceMatches('A a', 'a', { caseSensitive: true }).matches.length, 1);
});

test('tokenizes markup ranges without interpreting source contents', () => {
  const html = '<p title="<script>">safe</p><!-- note -->';
  const tokens = mod.tokenizeHtml(html);
  assert(tokens.some(t => t.kind === 'tag'));
  assert(tokens.some(t => t.kind === 'attribute'));
  assert(tokens.some(t => t.kind === 'string'));
  assert(tokens.some(t => t.kind === 'comment'));
  assert(tokens.every(t => t.start >= 0 && t.end <= html.length && t.start < t.end));
});
