import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./theme-preferences.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseThemePreference, resolveTheme } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('theme preference accepts only light, dark or system and defaults safely to light', () => {
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('system'), 'system');
  for (const value of [null, 'sepia', 'en', 3, {}]) assert.equal(parseThemePreference(value), 'light');
});

test('system preference follows color scheme while explicit light and dark win', () => {
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
