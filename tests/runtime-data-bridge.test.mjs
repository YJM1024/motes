import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

async function loadTs(path) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

test('parent bridge accepts only the bound opaque frame, nonce channel, and fresh strict requests', async () => {
  const { runtimeDataRequestFromEvent, validRuntimeHello } = await loadTs('lib/motes/runtime-data-bridge.ts');
  const source = {}, channel = '0123456789abcdef0123456789abcdef';
  const hello = { protocol: 'motes.runtime-data.v1', channel, kind: 'hello' };
  assert.equal(validRuntimeHello({ source, origin: 'null', data: hello }, source, channel), true);
  assert.equal(validRuntimeHello({ source: {}, origin: 'null', data: hello }, source, channel), false);
  assert.equal(validRuntimeHello({ source, origin: 'https://attacker.test', data: hello }, source, channel), false);
  assert.equal(validRuntimeHello({ source, origin: 'null', data: { ...hello, extra: true } }, source, channel), false);
  const request = { protocol: 'motes.runtime-data.v1', channel, kind: 'request', requestId: channel + ':1', action: 'set', key: 'tasks.v1', value: [{ text: 'shared' }], expectedRevision: 0 };
  assert.deepEqual(runtimeDataRequestFromEvent({ source, origin: 'null', data: request }, source, channel), { requestId: channel + ':1', action: 'set', key: 'tasks.v1', value: [{ text: 'shared' }], expectedRevision: 0, sequence: 1 });
  assert.equal(runtimeDataRequestFromEvent({ source: {}, origin: 'null', data: request }, source, channel), null);
  assert.equal(runtimeDataRequestFromEvent({ source, origin: 'https://attacker.test', data: request }, source, channel), null);
  assert.equal(runtimeDataRequestFromEvent({ source, origin: 'null', data: { ...request, channel: 'f'.repeat(32) } }, source, channel), null);
  assert.equal(runtimeDataRequestFromEvent({ source, origin: 'null', data: request }, source, channel, 1), null);
  assert.equal(runtimeDataRequestFromEvent({ source, origin: 'null', data: { ...request, extra: true } }, source, channel), null);
});

test('injected child SDK sends hello and uses one request/response path for get and set', async () => {
  const { runtimeDataClientScript, runtimeDataHostScript } = await loadTs('lib/motes/runtime-data-client.ts');
  const channel = 'fedcba9876543210fedcba9876543210', targetOrigin = 'https://host.test';
  const parent = { postMessage(data, origin) { sent.push({ data, origin }); } };
  const sent = [], listeners = new Map(), timers = new Map(); let timerId = 0;
  const window = { parent, location: { origin: 'null' }, addEventListener(name, callback) { listeners.set(name, callback); } };
  runInNewContext(runtimeDataClientScript(channel, targetOrigin), {
    window, TextEncoder, Map, Set, Promise, Error, Object, Array, Number, JSON, Date,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval() { return ++timerId; }, clearInterval() {},
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { data: { protocol: 'motes.runtime-data.v1', channel, kind: 'hello' }, origin: targetOrigin });
  assert.ok(runtimeDataHostScript(channel, targetOrigin, crypto.randomUUID(), crypto.randomUUID()).includes(`targetOrigin=${JSON.stringify(targetOrigin)}`));
  const receive = data => listeners.get('message')({ source: parent, origin: targetOrigin, data });
  receive({ protocol: 'motes.runtime-data.v1', channel, kind: 'ready', ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(await window.motes.data.ready)), { available: true });
  const get = window.motes.data.get('tasks.items');
  await new Promise(resolve => setImmediate(resolve));
  const getRequest = sent.at(-1).data;
  assert.deepEqual({ action: getRequest.action, key: getRequest.key }, { action: 'get', key: 'tasks.items' });
  receive({ protocol: 'motes.runtime-data.v1', channel, kind: 'result', requestId: getRequest.requestId, ok: true, result: { key: 'tasks.items', value: ['persisted'], revision: 2, updatedAt: '2026-10-31T00:00:00.000Z' } });
  assert.equal((await get).revision, 2);
  const set = window.motes.data.set('tasks.items', ['next'], 2);
  await new Promise(resolve => setImmediate(resolve));
  const setRequest = sent.at(-1).data;
  assert.equal(setRequest.expectedRevision, 2);
  receive({ protocol: 'motes.runtime-data.v1', channel, kind: 'result', requestId: setRequest.requestId, ok: true, result: { key: 'tasks.items', revision: 3, updatedAt: '2026-10-31T00:00:01.000Z' } });
  assert.equal((await set).revision, 3);
});
