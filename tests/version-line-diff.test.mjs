import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../lib/motes/line-diff.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('renders exact context, additions and removals with line numbers', () => {
  const diff = mod.compareLines('head\nold\ntail', 'head\nnew\ntail');
  assert.deepEqual(diff.lines.map(line => [line.kind, line.text, line.left ?? null, line.right ?? null]), [
    ['same', 'head', 1, 1], ['removed', 'old', 2, null], ['added', 'new', null, 2], ['same', 'tail', 3, 3],
  ]);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
});

test('handles repeated similar lines deterministically and retains blank lines', () => {
  const repeated = mod.compareLines('a\nb\nb\nc', 'a\nb\nc');
  assert.equal(repeated.removed, 1);
  assert.equal(repeated.lines.filter(row => row.kind === 'same' && row.text === 'b').length, 1);
  const blanks = mod.compareLines('top\n\nbottom', 'top\nbottom');
  assert.equal(blanks.lines[1].kind, 'removed');
  assert.equal(blanks.lines[1].text, '');
});

test('normalizes CRLF, recognizes no changes, and respects the work budget', () => {
  const crlf = mod.compareLines('a\r\nb\r\n', 'a\nb\n');
  assert.equal(crlf.added, 0);
  assert.equal(crlf.removed, 0);
  assert.equal(crlf.lines.length, 3);
  const tooLarge = mod.compareLines(Array(1500).fill('a').join('\n'), Array(1500).fill('b').join('\n'));
  assert.equal(tooLarge.limited, true);
});
