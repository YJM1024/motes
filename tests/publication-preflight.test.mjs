import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/motes/publication-preflight.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { publicationPreflight } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('publication checks are static and report source size and structure without altering input', () => {
  const html = '<!doctype html><html><head></head><body><p>ok</p></body></html>';
  const result = publicationPreflight(html);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.htmlLength, html.length);
  assert.equal(html.includes('<p>ok</p>'), true);
});

test('publication preflight blocks empty or oversized documents and warns on incomplete structure', () => {
  assert.ok(publicationPreflight(' ').errors.includes('发布版本没有 HTML 内容。'));
  assert.ok(publicationPreflight('<html><body>x</body></html>', 10).errors.includes('HTML 超出发布上限。'));
  assert.ok(publicationPreflight('<main>fragment</main>').warnings.some(message => message.includes('根元素')));
});

test('external resources and javascript URLs get actionable static warnings without execution', () => {
  const result = publicationPreflight('<html><body><img src="https://cdn.example/x.png"><a href="javascript:alert(1)">x</a></body></html>');
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some(message => message.includes('外部资源')));
  assert.ok(result.warnings.some(message => message.includes('javascript:')));
});
