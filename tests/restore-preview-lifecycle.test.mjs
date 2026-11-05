import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let restore;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'restore') restore = node.getText(tree); ts.forEachChild(node, visit); }
visit(tree); assert.ok(restore);
function harness({ fail = false, stale = false } = {}) {
  // The user has already previewed v1 while saved current is v2. Its data read
  // failed (historical versions cannot write shared runtime data). Only remount
  // after the successful restore receipt can make its SDK boot again.
  const saved = { id: 'app-a', currentVersionId: 'v1', versions: [{ id: 'v1' }, { id: 'v2' }] };
  let current = 'v2', displayed = 'v1', refresh = 0, booted = false;
  const events = [], operationEpoch = { current: 0 }, activeOperation = { current: null }, operationLock = { current: false };
  const bindings = {
    project: { ...saved, currentVersionId: 'v2' }, operationLock, unresolvedRecovery: false,
    setNotice() {}, t: text => text, interruptRecovery: () => ++operationEpoch.current,
    crypto, activeOperation, setBusy() {}, setError: error => { if (error) events.push('failed'); }, mounted: { current: true }, operationEpoch,
    api: async (_path, body) => { assert.deepEqual(body, { versionId: 'v1' }); if (fail) throw Error('restore unavailable'); if (stale) operationEpoch.current++; events.push('receipt'); return { project: saved }; },
    remember: result => { current = result.currentVersionId; displayed = current; events.push('remember'); },
    setRefresh: update => { refresh = update(refresh); booted = current === displayed && current === 'v1'; events.push('reboot'); },
    setHistory() {}, presentSavedOutcome: () => events.push('outcome'),
  };
  const js = ts.transpileModule(`const handler=(${restore});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const run = new Function(...Object.keys(bindings), js + 'return handler;')(...Object.values(bindings));
  return { run, events, state: () => ({ current, displayed, refresh, booted }) };
}
test('restoring an already-previewed version reboots data SDK after committed receipt', async () => {
  const h = harness(); await h.run('v1');
  assert.deepEqual(h.state(), { current: 'v1', displayed: 'v1', refresh: 1, booted: true });
  assert.deepEqual(h.events, ['receipt', 'remember', 'reboot', 'outcome']);
  // Both the injected channel and iframe identity use this refresh generation.
  assert.match(page, /\[project\?\.id, displayedId, refresh\]/);
  assert.match(page, /key=\{`\$\{raceView\.showCandidate\?raceView\.candidate\?\.attemptId:displayed\?\.id\}-\$\{refresh\}`\}/);
});
test('failed or stale restore does not reset the current iframe or claim success', async () => {
  for (const option of [{ fail: true }, { stale: true }]) {
    const h = harness(option); await h.run('v1');
    assert.deepEqual(h.state(), { current: 'v2', displayed: 'v1', refresh: 0, booted: false });
    assert.ok(!h.events.includes('outcome'));
  }
});
