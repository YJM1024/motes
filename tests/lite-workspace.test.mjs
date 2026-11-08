import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const code = await readFile(new URL('../app/lite/useLiteWorkspace.ts', import.meta.url), 'utf8');
const state = await readFile(new URL('../app/lite/state.ts', import.meta.url), 'utf8');
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext };
const stateModule = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(state.replace(/^import .*;$/gm, ''), { compilerOptions: options }).outputText).toString('base64'));
const compiled = ts.transpileModule(code.replace(/^import .*;$/gm, '').replace(/export /g, ''), { compilerOptions: options }).outputText;
const app = id => ({ id, title: id, currentVersionId: 'v1', versions: [{ id: 'v1', number: 1, prompt: 'test', summary: 'saved', html: '<html>saved</html>' }] });
const snapshot = { workspace: { defaultProjectId: 'group' }, projects: [{ id: 'group', name: 'Group' }], apps: [{ id: 'A', projectId: 'group' }, { id: 'B', projectId: 'group' }] };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function workspaceHarness(transport, selection = {}) {
  const cells = [], effects = [], storage = new Map([['motes-lite-selection:workspace', JSON.stringify(selection)]]);
  let index = 0, dirty = false, pending = [], current;
  const react = {
    useState(initial) { const i = index++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], next => { const value = typeof next === 'function' ? next(cells[i]) : next; if (!Object.is(value, cells[i])) { cells[i] = value; dirty = true; } }]; },
    useRef(initial) { const i = index++; return cells[i] ??= { current: initial }; },
    useEffect(callback, deps) { const i = index++, previous = effects[i]; if (!previous || deps.some((d, n) => !Object.is(d, previous.deps[n]))) { effects[i] = { deps, cleanup: previous?.cleanup }; pending.push({ i, callback }); } },
  };
  const bindings = { ...react, useLayoutEffect: react.useEffect, ...stateModule, crypto, AbortController, liteApi: async path => {
    if (path === '/api/session') return { workspaceId: 'workspace', visibility: 'shared', mode: 'demo', model: null };
    if (path === '/api/workspace') return snapshot;
    return transport(path);
  }, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  const runWorkspace = new Function(...Object.keys(bindings), compiled + '\nreturn useLiteWorkspace;')(...Object.values(bindings));
  function render() { index = 0; dirty = false; current = runWorkspace(); const queue = pending; pending = []; for (const item of queue) { effects[item.i].cleanup?.(); effects[item.i].cleanup = item.callback(); } }
  async function settle() { for (let i = 0; i < 12; i++) { await new Promise(resolve => setImmediate(resolve)); if (dirty) render(); } }
  render();
  return { get current() { return current; }, settle, close: () => effects.forEach(e => e?.cleanup?.()) };
}

test('reconnect retries the failed application, then clears the error and adopts its saved state', async t => {
  const calls = []; let failing = true;
  const h = workspaceHarness(async path => { calls.push(path); if (failing) throw Error('connection lost'); return { project: app('B') }; }); t.after(h.close);
  await h.settle(); await h.current.open('B'); await h.settle(); assert.equal(h.current.error, 'connection lost');
  failing = false; await h.current.reconnect(); await h.settle();
  assert.deepEqual(calls, ['/api/projects/B', '/api/projects/B']);
  assert.equal(h.current.project.id, 'B'); assert.equal(h.current.error, ''); assert.equal(h.current.loading, false);
});

test('a failed restored selection remains retryable without losing its intended app', async t => {
  const calls = []; let failing = true;
  const h = workspaceHarness(async path => { calls.push(path); if (failing) throw Error('load failed'); return { project: app('A') }; }, { groupId: 'group', appId: 'A' }); t.after(h.close);
  await h.settle(); assert.equal(h.current.error, 'load failed');
  failing = false; await h.current.reconnect(); await h.settle();
  assert.deepEqual(calls, ['/api/projects/A', '/api/projects/A']); assert.equal(h.current.project.id, 'A'); assert.equal(h.current.error, '');
});

test('new-app navigation invalidates a reconnect response and its failed retry target', async t => {
  const gate = deferred(); let failing = true; const calls = [];
  const h = workspaceHarness(async path => { calls.push(path); if (failing) throw Error('offline'); return gate.promise; }); t.after(h.close);
  await h.settle(); await h.current.open('A'); await h.settle();
  failing = false; const retry = h.current.reconnect(); h.current.create(); await h.settle();
  gate.resolve({ project: app('A') }); await retry; await h.settle();
  assert.equal(h.current.project, null); assert.equal(h.current.error, '');
  await h.current.reconnect(); await h.settle(); assert.equal(calls.length, 2, 'A is not reopened after switching to a new app');
});

test('bootstrap cannot overwrite a new app selected before its restored app finishes reading', async t => {
  const gate = deferred();
  const h = workspaceHarness(() => gate.promise, { groupId: 'group', appId: 'A' }); t.after(h.close);
  await h.settle(); h.current.create(); await h.settle(); gate.resolve({ project: app('A') }); await h.settle();
  assert.equal(h.current.project, null); assert.equal(h.current.error, ''); assert.equal(h.current.loading, false);
});
