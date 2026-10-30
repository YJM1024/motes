import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./task-center.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const items = [
  { id: '1', requestId: 'req-a', prompt: '旅行预算', kind: 'generation', phase: 'running', createdAt: '2026-10-31T10:00:00Z', expiresAt: '2026-10-31T12:00:00Z' },
  { id: '2', requestId: 'req-b', prompt: '任务看板', kind: 'candidate', phase: 'save_pending', createdAt: '2026-10-30T10:00:00Z' },
];

test('task filtering composes kind, phase, and local text search', () => {
  assert.deepEqual(mod.filterTasks(items, '旅行', 'generation', 'running').map(item => item.id), ['1']);
  assert.deepEqual(mod.filterTasks(items, 'REQ-B', 'all', 'save_pending').map(item => item.id), ['2']);
  assert.deepEqual(mod.filterTasks(items, '', 'candidate', 'running'), []);
});

test('expiry is based on the supplied timestamp and absent expiry stays unknown', () => {
  assert.equal(mod.taskHasExpired(items[0], Date.parse('2026-10-31T12:00:00Z')), true);
  assert.equal(mod.taskHasExpired(items[0], Date.parse('2026-10-31T11:59:59Z')), false);
  assert.equal(mod.taskHasExpired(items[1], Date.parse('2026-11-01T00:00:00Z')), false);
});

test('timestamps are shown from the provided record values', () => {
  assert.notEqual(mod.formatTaskDate(items[0].createdAt), '时间记录无效');
  assert.equal(mod.formatTaskDate('invalid'), '时间记录无效');
});

test('recorded task durations preserve zero and unknown values honestly',()=>{assert.equal(mod.formatTaskDuration(null),'未记录');assert.equal(mod.formatTaskDuration(undefined),'未记录');assert.equal(mod.formatTaskDuration(-1),'未记录');assert.equal(mod.formatTaskDuration(0),'0 毫秒');assert.equal(mod.formatTaskDuration(1234),'1.2 秒');});
