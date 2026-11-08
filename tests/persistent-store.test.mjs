import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from './helpers/source-modules.mjs';
const { createPersistentStore } = await loadSourceModule('motes/persistent-store');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function data(value = null, revision = 0) {
  const writes = [];
  return { writes, ready: Promise.resolve({ available: true }), get: async () => ({ value, revision }), async set(key, next, expected) { assert.equal(expected, revision); writes.push({ key, next, expected }); value = structuredClone(next); return { revision: ++revision }; } };
}

test('first use hydrates null/revision zero to a local default without writing it', async () => {
  const api = data(), store = createPersistentStore(api, 'tasks', [], Array.isArray);
  assert.equal(store.update(['too early']), false);
  await store.load(); assert.deepEqual(store.getSnapshot().value, []); assert.equal(api.writes.length, 0);
  assert.equal(store.update(['first']), true); await tick();
  assert.deepEqual(api.writes, [{ key: 'tasks', next: ['first'], expected: 0 }]); assert.equal(store.getSnapshot().phase, 'saved');
});

test('existing empty arrays and numeric zero are valid stored values, not missing data', async () => {
  const tasks = createPersistentStore(data([], 4), 'tasks', ['default'], Array.isArray); await tasks.load(); assert.deepEqual(tasks.getSnapshot().value, []);
  const count = createPersistentStore(data(0, 5), 'count', 10, Number.isFinite); await count.load(); assert.equal(count.getSnapshot().value, 0); assert.equal(count.getSnapshot().revision, 5);
});

test('continuous edits serialize writes and use each actual receipt revision', async () => {
  const gate = deferred(), api = data(), original = api.set; let count = 0;
  api.set = async (...args) => { if (++count === 1) await gate.promise; return original(...args); };
  const store = createPersistentStore(api, 'tasks', [], Array.isArray); await store.load();
  store.update(v => [...v, 'A']); store.update(v => [...v, 'B']); store.update(v => [...v, 'C']);
  gate.resolve(); await tick(); await tick();
  assert.deepEqual(api.writes.map(w => w.next), [['A'], ['A', 'B', 'C']]); assert.deepEqual(api.writes.map(w => w.expected), [0, 1]);
  assert.deepEqual(store.getSnapshot().value, ['A', 'B', 'C']); assert.equal(store.getSnapshot().revision, 2);
});

test('conflicts keep unsaved input, stop queued writes, and require an explicit reload', async () => {
  const api = data(['remote'], 3); let writes = 0;
  api.set = async () => { writes++; throw Object.assign(Error('conflict'), { code: 'conflict' }); };
  const store = createPersistentStore(api, 'tasks', [], Array.isArray); await store.load(); store.update(['my edit']); await tick();
  assert.equal(store.getSnapshot().phase, 'conflict'); assert.deepEqual(store.getSnapshot().value, ['my edit']);
  assert.equal(store.update(['overwrite']), false); assert.equal(writes, 1);
  await store.load(); assert.deepEqual(store.getSnapshot().value, ['remote']); assert.equal(store.getSnapshot().phase, 'ready');
});

test('ambiguous failed saves never claim success or retry a write automatically', async () => {
  const api = data(); let writes = 0;
  api.set = async () => { writes++; throw Object.assign(Error('timeout'), { code: 'timeout' }); };
  const store = createPersistentStore(api, 'tasks', [], Array.isArray); await store.load(); store.update(['unsaved']); await tick();
  assert.equal(store.getSnapshot().phase, 'error'); assert.deepEqual(store.getSnapshot().value, ['unsaved']); assert.match(store.getSnapshot().message, /未确认/);
  await tick(); assert.equal(writes, 1); assert.equal(store.update(['again']), false);
});

test('invalid stored data is not overwritten with defaults', async () => {
  const api = data({ broken: true }, 1), store = createPersistentStore(api, 'tasks', [], Array.isArray);
  await store.load(); assert.equal(store.getSnapshot().phase, 'error'); assert.equal(store.update([]), false); assert.equal(api.writes.length, 0);
});

test('a disposed hydration cannot change a later application and does not save anything', async () => {
  const api = data(), gate = deferred(); api.get = () => gate.promise;
  const store = createPersistentStore(api, 'tasks', [], Array.isArray); const reading = store.load(); await tick();
  store.dispose(); gate.resolve({ value: ['old app'], revision: 1 }); await reading;
  assert.deepEqual(store.getSnapshot().value, []); assert.equal(api.writes.length, 0);
});

test('unmount stops queued saves after an in-flight write without claiming it was cancelled', async () => {
  const api = data(), gate = deferred(), original = api.set;
  api.set = async (...args) => { await gate.promise; return original(...args); };
  const store = createPersistentStore(api, 'tasks', [], Array.isArray); await store.load(); store.update(['A']); store.update(['A', 'B']);
  store.dispose(); gate.resolve(); await tick(); assert.equal(api.writes.length, 1); assert.notEqual(store.getSnapshot().phase, 'saved');
});

test('standalone exports remain usable as explicitly temporary data', async () => {
  const store = createPersistentStore(undefined, 'tasks', [], Array.isArray); await store.load();
  assert.equal(store.update(['local only']), true); assert.deepEqual(store.getSnapshot().value, ['local only']); assert.equal(store.getSnapshot().phase, 'temporary'); assert.equal(store.getSnapshot().revision, 0);
});

test('read failures block writes and an explicit retry can load a later valid record', async () => {
  const api = data(['saved'], 2), get = api.get; let fail = true;
  api.get = () => fail ? Promise.reject(Error('offline')) : get();
  const store = createPersistentStore(api, 'tasks', [], Array.isArray); await store.load(); assert.equal(store.getSnapshot().phase, 'error'); assert.equal(store.update(['unsafe']), false);
  fail = false; await store.load(); assert.deepEqual(store.getSnapshot().value, ['saved']); assert.equal(api.writes.length, 0);
});
