import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const worker = await readFile(new URL('../public/motes-offline-sw.js', import.meta.url), 'utf8');
const helper = await readFile(new URL('../lib/motes/retire-offline-worker.ts', import.meta.url), 'utf8');
const { retireOfflineWorker } = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64'));

test('former offline worker updates and unregisters without serving old shell or touching stored work', async () => {
  const listeners = new Map(), calls = [];
  const denied = new Proxy({}, { get() { throw Error('Worker must not access or erase storage'); } });
  runInNewContext(worker, {
    self: { addEventListener: (name, callback) => listeners.set(name, callback), skipWaiting: async () => calls.push('skipWaiting'), clients: { claim: async () => calls.push('claim') }, registration: { unregister: async () => calls.push('unregister') } },
    caches: denied, indexedDB: denied, localStorage: denied, sessionStorage: denied,
  });
  for (const event of ['install', 'activate']) { let pending; listeners.get(event)({ waitUntil: promise => { pending = promise; } }); await pending; }
  assert.deepEqual(calls, ['skipWaiting', 'claim', 'unregister']);
  assert.equal(listeners.has('fetch'), false, 'No stale full UI navigation fallback');
  assert.equal(listeners.has('message'), false, 'No new shell caching');
});

test('lite startup unregisters only exact same-origin former product worker at root scope', async () => {
  const calls = [], origin = 'https://motes.test', ownScript = origin + '/motes-offline-sw.js';
  const registration = (name, scope, scripts) => ({ scope, active: scripts[0] ? { scriptURL: scripts[0] } : null, waiting: scripts[1] ? { scriptURL: scripts[1] } : null, installing: null, unregister: async () => { calls.push(name); return true; } });
  const registrations = [
    registration('own-active', origin + '/', [ownScript]),
    registration('own-waiting', origin + '/', [null, ownScript]),
    registration('different-worker', origin + '/', [origin + '/other.js']),
    registration('different-scope', origin + '/other/', [ownScript]),
    registration('different-origin', 'https://another.test/', ['https://another.test/motes-offline-sw.js']),
    registration('mixed-workers', origin + '/', [origin + '/other.js', ownScript]),
  ];
  assert.deepEqual(await retireOfflineWorker({ getRegistrations: async () => registrations }, origin), { removed: 2, failed: 0 });
  assert.deepEqual(calls, ['own-active', 'own-waiting']);
});

test('retirement failures remain bounded and do not clear caches or user data', async () => {
  const origin = 'https://motes.test';
  assert.deepEqual(await retireOfflineWorker({ getRegistrations: async () => { throw Error('blocked'); } }, origin), { removed: 0, failed: 1 });
  const registration = { scope: origin + '/', active: { scriptURL: origin + '/motes-offline-sw.js' }, unregister: async () => { throw Error('blocked'); } };
  assert.deepEqual(await retireOfflineWorker({ getRegistrations: async () => [registration] }, origin), { removed: 0, failed: 1 });
});
