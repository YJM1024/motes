import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./panel-scroll-memory.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('scroll memory keys include workspace, app and panel', () => {
  assert.notEqual(mod.panelScrollMemoryKey('w1', 'a1', 'chat'), mod.panelScrollMemoryKey('w2', 'a1', 'chat'));
  assert.notEqual(mod.panelScrollMemoryKey('w1', 'a1', 'chat'), mod.panelScrollMemoryKey('w1', 'a1', 'preview'));
  assert.notEqual(mod.panelScrollMemoryKey('w1', 'a1', 'chat'), mod.panelScrollMemoryKey('w1', 'a2', 'chat'));
});

test('stored scroll positions cannot be negative or non-finite', () => {
  assert.equal(mod.normalizeScrollTop(-10), 0);
  assert.equal(mod.normalizeScrollTop(Number.NaN), 0);
  assert.equal(mod.normalizeScrollTop(12.5), 12.5);
});
