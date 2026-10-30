import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/manage/bulk-actions.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('selection is unique and capped at twenty without silently selecting a partial list', () => {
  assert.deepEqual(mod.selectVisible(['a','a','b']), { ids: ['a','b'], tooMany: false });
  assert.deepEqual(mod.selectVisible(Array.from({ length: 21 }, (_, i) => String(i))).ids, []);
  assert.equal(mod.selectVisible(Array.from({ length: 21 }, (_, i) => String(i))).tooMany, true);
});

test('existing app.update action carries workspace scope and exact target operation', () => {
  assert.deepEqual(mod.bulkAppAction('space', 'app', { kind: 'archived', value: true }), { action: 'app.update', workspaceId: 'space', appId: 'app', archived: true });
  assert.deepEqual(mod.bulkAppAction('space', 'app', { kind: 'move', projectId: 'dest' }), { action: 'app.update', workspaceId: 'space', appId: 'app', projectId: 'dest' });
  assert.throws(() => mod.bulkAppAction('', 'app', { kind: 'starred', value: true }));
});

test('retry selection contains failed IDs only and result merging keeps prior successes', () => {
  const prior = { successes: [{ id: 'ok', name: '成功' }], failures: [{ id: 'bad', name: '失败', error: 'offline' }] };
  assert.deepEqual(mod.retryFailedIds(prior), ['bad']);
  assert.deepEqual(mod.mergeBulkResult(prior, [], [{ id: 'bad', name: '失败', error: 'still offline' }]), { successes: [{ id: 'ok', name: '成功' }], failures: [{ id: 'bad', name: '失败', error: 'still offline' }] });
});
