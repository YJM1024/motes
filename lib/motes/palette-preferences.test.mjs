import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./palette-preferences.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { PALETTE_PREFERENCE_KEY, PALETTE_OPTIONS, parsePalettePreference, resolvePalette } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('palette preference accepts only the four supported workbench palettes', () => {
  assert.equal(PALETTE_PREFERENCE_KEY, 'motes.palettePreference');
  assert.deepEqual(PALETTE_OPTIONS.map(option => option.value), ['blue', 'violet', 'mint', 'slate']);
  for (const value of ['blue', 'violet', 'mint', 'slate']) assert.equal(parsePalettePreference(value), value);
  for (const value of [null, 'light', 'dark', 'en', 3, {}]) assert.equal(parsePalettePreference(value), 'slate');
});

test('neutral slate remains the safe default and resolves independently', () => {
  assert.equal(parsePalettePreference(null), 'slate');
  assert.equal(resolvePalette('blue'), 'blue');
  assert.equal(resolvePalette('slate'), 'slate');
});
