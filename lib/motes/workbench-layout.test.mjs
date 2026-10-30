import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./workbench-layout.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('layout storage is namespaced and parsed values are validated and clamped', () => {
  assert.equal(mod.workbenchLayoutStorageKey('w a'), 'motes:workbench-layout:w%20a');
  assert.deepEqual(mod.parseWorkbenchLayout('{"mode":"chat","sidebarCollapsed":true,"chatWidth":900}'), { mode: 'chat', sidebarCollapsed: true, chatWidth: 720 });
  assert.equal(mod.parseWorkbenchLayout('{"mode":"other","sidebarCollapsed":false,"chatWidth":440}'), null);
});

test('chat width clamps and rounds within the configured bounds', () => {
  assert.equal(mod.clampChatWidth(220), 280);
  assert.equal(mod.clampChatWidth(500.6), 501);
  assert.equal(mod.clampChatWidth(900), 720);
});

