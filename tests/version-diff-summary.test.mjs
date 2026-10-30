import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const fs = await import('node:fs/promises');
const text = await fs.readFile(new URL('../lib/motes/version-diff-summary.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('counts exact inserted and deleted lines with shared context', () => {
  assert.deepEqual(mod.summarizeLineChanges('a\nb\nc', 'a\nx\nc'), { added: 1, removed: 1 });
  assert.deepEqual(mod.summarizeLineChanges('a\nb\nb', 'b\nb\na'), { added: 1, removed: 1 });
  assert.deepEqual(mod.summarizeLineChanges('', ''), { added: 0, removed: 0 });
  assert.deepEqual(mod.summarizeLineChanges('a\nb', 'a\nb\nc'), { added: 1, removed: 0 });
});

test('declines a summary when exact comparison exceeds its work budget', () => {
  assert.deepEqual(mod.summarizeLineChanges('a\nb', 'x\ny', 1), { added: null, removed: null });
});
