import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./filter-apps.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { filterApps } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const projects = [{ id: 'active', archived: false }, { id: 'old', archived: true }];
const apps = [
  { id: 'a', name: 'Budget', description: '旅行工具', projectId: 'active', tagIds: ['travel'], starred: true, archived: false, createdAt: '2026-10-29', updatedAt: '2026-10-30' },
  { id: 'b', name: 'Board', description: '任务', projectId: 'active', tagIds: [], starred: false, archived: true, createdAt: '2026-10-28', updatedAt: '2026-10-29' },
  { id: 'c', name: 'Counter', description: '', projectId: 'old', tagIds: ['travel'], starred: true, archived: false, createdAt: '2026-10-30', updatedAt: '2026-10-28' },
];
const defaults = { query: '', projectId: '', tagId: '', starred: false, archived: 'active', sort: 'updated' };
const run = filters => filterApps(apps, projects, { ...defaults, ...filters }).map(a => a.id);

test('archived projects hide active children without changing child state', () => {
  assert.deepEqual(run({}), ['a']);
  assert.deepEqual(run({ archived: 'archived' }), ['b', 'c']);
  assert.equal(apps[2].archived, false);
});
test('search matches descriptions and ignores case and surrounding whitespace', () => {
  assert.deepEqual(run({ query: '旅行' }), ['a']);
  assert.deepEqual(run({ query: ' BUDGET ' }), ['a']);
  assert.deepEqual(run({ query: 'missing' }), []);
});
test('project, tag and favorite filters compose across archive status', () => {
  assert.deepEqual(run({ archived: 'all', projectId: 'old', tagId: 'travel', starred: true }), ['c']);
  assert.deepEqual(run({ archived: 'all', projectId: 'active', tagId: 'travel', starred: true }), ['a']);
});
test('sort choices preserve the original snapshot order', () => {
  assert.deepEqual(run({ archived: 'all', sort: 'created' }), ['c', 'a', 'b']);
  assert.deepEqual(run({ archived: 'all', sort: 'name' }), ['b', 'a', 'c']);
  assert.deepEqual(apps.map(a => a.id), ['a', 'b', 'c']);
});
