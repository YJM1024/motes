import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function treeNodes(value) {
  if (Array.isArray(value)) return value.flatMap(treeNodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...treeNodes(value.children ?? value.props?.children)];
}

async function harness(t, { syncByWorkspace = {}, operations = [] } = {}) {
  const cells = [], effects = [];
  let cursor = 0, currentTree, pendingEffects = [];
  const calls = { sync: [], synced: 0, list: [], discard: [], refresh: [], fetch: 0 };
  const stateFor = workspaceId => ({
    storage: 'indexeddb', ready: true, status: 'offline', pendingCount: 1, conflictCount: 0,
    sync: async () => { calls.sync.push(workspaceId); return syncByWorkspace[workspaceId]?.() ?? false; },
    refresh: async () => { calls.refresh.push(workspaceId); },
  });
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial;
      return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; },
    useEffect(fn, deps) {
      const i = cursor++, previous = effects[i];
      if (!previous || deps?.some((value, index) => !Object.is(value, previous.deps?.[index]))) {
        effects[i] = { deps, cleanup: previous?.cleanup, fn };
        pendingEffects.push(i);
      }
    },
  };
  const key = crypto.randomUUID();
  const stubs = {
    react,
    useHostLocale: () => ({ locale: 'zh-CN' }),
    useOfflineWorkspace: workspaceId => stateFor(workspaceId),
    OfflineSyncStatus: props => props,
    OfflineChangesPanel: props => props,
    discardOfflineOperation: async (workspaceId, id) => { calls.discard.push([workspaceId, id]); },
    listOfflineOperations: async workspaceId => { calls.list.push(workspaceId); return operations; },
  };
  globalThis[key] = stubs;
  const descriptors = new Map(['fetch'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => { calls.fetch++; throw new Error('unexpected network request'); } });
  let source = await readFile(new URL('../app/components/OfflineWorkspaceControls.tsx', import.meta.url), 'utf8');
  source = source
    .replace("import {useEffect,useRef,useState} from 'react';", `const {useEffect,useRef,useState}=globalThis['${key}'].react;`)
    .replace("import {useHostLocale} from './HostLocaleProvider';", `const useHostLocale=globalThis['${key}'].useHostLocale;`)
    .replace("import {useOfflineWorkspace} from './OfflineProvider';", `const useOfflineWorkspace=globalThis['${key}'].useOfflineWorkspace;`)
    .replace("import OfflineSyncStatus from './OfflineSyncStatus';", `const OfflineSyncStatus=globalThis['${key}'].OfflineSyncStatus;`)
    .replace("import OfflineChangesPanel,{type OfflineChangeItem} from './OfflineChangesPanel';", `const OfflineChangesPanel=globalThis['${key}'].OfflineChangesPanel;`)
    .replace("import {discardOfflineOperation,listOfflineOperations} from '@/lib/motes/offline-engine';", `const {discardOfflineOperation,listOfflineOperations}=globalThis['${key}'];`);
  const js = ts.transpileModule(`const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props??{},children})};\n${source}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  const { default: Component } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  function render(props) {
    cursor = 0;
    currentTree = Component(props);
    for (const index of pendingEffects) {
      const effect = effects[index];
      effect.cleanup?.(); effect.cleanup = effect.fn();
    }
    pendingEffects = [];
    return currentTree;
  }
  async function settle() { for (let i=0;i<5;i++) await new Promise(resolve => setImmediate(resolve)); }
  t.after(() => {
    for (const effect of effects) effect?.cleanup?.();
    delete globalThis[key];
    for (const [name, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  });
  return { render, settle, calls, nodes: () => treeNodes(currentTree), stubs };
}

function props(overrides = {}) { return { workspaceId: 'workspace-a', onSynced() {}, ...overrides }; }

test('idle rendering does not sync, discard, or contact generation/network paths', async t => {
  const h = await harness(t);
  h.render(props()); await h.settle();
  assert.deepEqual(h.calls.sync, []);
  assert.deepEqual(h.calls.discard, []);
  assert.equal(h.calls.fetch, 0);
  assert.equal(h.calls.synced, 0);
});

test('sync returning false never calls onSynced; true does for the current workspace', async t => {
  const h = await harness(t, { syncByWorkspace: { 'workspace-a': async () => false } });
  h.render(props({ onSynced: () => h.calls.synced++ }));
  h.nodes().find(node => node.type === h.stubs.OfflineSyncStatus).props.onSync();
  await h.settle();
  assert.deepEqual(h.calls.sync, ['workspace-a']); assert.equal(h.calls.synced, 0);

  const ok = await harness(t, { syncByWorkspace: { 'workspace-a': async () => true } });
  ok.render(props({ onSynced: () => ok.calls.synced++ }));
  ok.nodes().find(node => node.type === ok.stubs.OfflineSyncStatus).props.onSync();
  await ok.settle();
  assert.deepEqual(ok.calls.sync, ['workspace-a']); assert.equal(ok.calls.synced, 1);
});

test('a late sync result after workspace ownership changes cannot invoke onSynced', async t => {
  let complete;
  const h = await harness(t, { syncByWorkspace: { 'workspace-a': () => new Promise(resolve => { complete = resolve; }) } });
  h.render(props({ onSynced: () => h.calls.synced++ }));
  h.nodes().find(node => node.type === h.stubs.OfflineSyncStatus).props.onSync();
  h.render(props({ workspaceId: 'workspace-b', onSynced: () => h.calls.synced++ }));
  complete(true); await h.settle();
  assert.equal(h.calls.synced, 0);
});

test('discard only calls the local operation engine and refreshes local state', async t => {
  const h = await harness(t, { operations: [{ id:'op-1',kind:'runtime',state:'pending',appId:'app-1',createdAt:'2026-01-01T00:00:00.000Z',body:{},value:{n:1},key:'counter' }] });
  h.render(props());
  h.nodes().find(node => node.type === h.stubs.OfflineSyncStatus).props.onOpenConflicts(); await h.settle();
  h.render(props());
  const panel = h.nodes().find(node => node.type === h.stubs.OfflineChangesPanel);
  assert.ok(panel); panel.props.onDiscard('op-1'); await h.settle();
  assert.deepEqual(h.calls.discard, [['workspace-a','op-1']]);
  assert.deepEqual(h.calls.refresh, ['workspace-a']);
  assert.equal(h.calls.fetch, 0);
});
