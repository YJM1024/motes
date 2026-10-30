import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./motion-preferences.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseMotionPreference, shouldReduceMotion, isWorkbenchPath } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('only the supported local preference is accepted', () => {
  assert.equal(parseMotionPreference('reduced'), 'reduced');
  for (const value of ['system', 'dark', 'en', null, 3]) assert.equal(parseMotionPreference(value), 'system');
});

test('system mode follows the operating system while explicit reduce always reduces', () => {
  assert.equal(shouldReduceMotion('system', false), false);
  assert.equal(shouldReduceMotion('system', true), true);
  assert.equal(shouldReduceMotion('reduced', false), true);
});

test('motion setting is scoped to private workbench routes', () => {
  for (const path of ['/', '/settings', '/manage/apps', '/compare']) assert.equal(isWorkbenchPath(path), true);
  for (const path of ['/share/token', '/published/token', '/api/session']) assert.equal(isWorkbenchPath(path), false);
});
