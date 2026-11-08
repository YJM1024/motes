import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext };
const compile = source => ts.transpileModule(source, { compilerOptions }).outputText;
const modules = new Map();
async function load(path) {
  if (modules.has(path)) return modules.get(path);
  let js = compile(await readFile(new URL(path, import.meta.url), 'utf8'));
  for (const match of [...js.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)]) {
    const file = new URL(match[2] + '.ts', new URL(path, import.meta.url));
    js = js.replaceAll(match[1] + match[2] + match[1], JSON.stringify(await load(file.href)));
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); modules.set(path, url); return url;
}
const recovery = await import(await load('../lib/motes/recovery-state.ts'));
const state = await import(await load('../app/lite/state.ts'));
const api = await import(await load('../app/lite/api.ts'));
const source = await readFile(new URL('../app/lite/useLiteGeneration.ts', import.meta.url), 'utf8');
const factory = compile(source.replace(/^import .*;\r?$/gm, '').replace(/^export type .*;\r?$/gm, '').replace('export function useLiteGeneration', 'function useLiteGeneration'));
const appId = 'app-a', workspaceId = 'workspace-a';
const attempt = () => ({ id: crypto.randomUUID(), requestId: crypto.randomUUID(), projectId: appId, baseVersionId: 'v2', text: '改成深色主题', mode: 'demo', state: 'failed', recovered: true, startedAt: Date.now() });
const project = { id: appId, title: 'QA', currentVersionId: 'v3', versions: ['v2', 'v3'].map((id, index) => ({ id, number: index + 2, mode: 'demo', prompt: 'QA request', summary: 'QA saved', html: '<!doctype html><html><head><title>QA</title></head><body>saved</body></html>' })) };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness({ transport, recovered = [], retryState, draft: initialDraft = '' } = {}) {
  const cells = [], effects = [], values = new Map(), saved = [], accepted = [], rejected = [], navigation = { current: 0 };
  let draft = initialDraft;
  if (recovered.length) values.set('motes-lite-outbox:' + workspaceId, JSON.stringify(recovered));
  let cursor = 0, dirty = false, pending = [], current, recoveryProps;
  const react = {
    useState(initial) { const id = cursor++; if (!(id in cells)) cells[id] = typeof initial === 'function' ? initial() : initial; return [cells[id], next => { const value = typeof next === 'function' ? next(cells[id]) : next; if (!Object.is(value, cells[id])) { cells[id] = value; dirty = true; } }]; },
    useRef(initial) { const id = cursor++; if (!(id in cells)) cells[id] = { current: initial }; return cells[id]; },
    useEffect(callback, deps) { const id = cursor++, previous = effects[id]; if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) { effects[id] = { deps, cleanup: previous?.cleanup }; pending.push({ id, callback }); } },
  };
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const bindings = { ...react, useLayoutEffect: react.useEffect, ...recovery, ...state, ...api, pollGenerationProgress: async () => {}, liteApi: transport, crypto, sessionStorage: storage, useAttemptRecovery: props => { recoveryProps = props; return { stateFor: () => retryState, checkAgain() {} }; } };
  const runHook = new Function(...Object.keys(bindings), factory + '\nreturn useLiteGeneration;')(...Object.values(bindings));
  function render() { cursor = 0; dirty = false; current = runHook({ workspaceId, context: { projectId: appId }, baseVersionId: 'v2', navigation, navigationVersion: navigation.current, enabled: true, onAcceptedSend: attempt => { accepted.push(attempt); if (draft.trim() === attempt.text.trim()) draft = ''; }, onExplicitRejection: attempt => { rejected.push(attempt); if (!draft.trim()) draft = attempt.text; }, onSaved: (...args) => saved.push(args) }); const queue = pending; pending = []; for (const item of queue) { effects[item.id].cleanup?.(); effects[item.id].cleanup = item.callback(); } }
  function flush() { for (let count = 0; dirty && count < 15; count++) render(); assert.equal(dirty, false, 'Hook settles without an update loop'); }
  render(); flush();
  return { get current() { return current; }, get recoveryProps() { return recoveryProps; }, get draft() { return draft; }, set draft(value) { draft = value; }, values, saved, accepted, rejected, navigation, flush, rerender: () => { render(); flush(); }, close: () => effects.forEach(effect => effect?.cleanup?.()) };
}

test('navigation begins before React rerenders: late generation cannot steal the requested app', async t => {
  const gate = deferred(); let signal, body;
  const h = harness({ transport: async (_path, sent, currentSignal) => { body = sent; signal = currentSignal; const stored = JSON.parse(h.values.get('motes-lite-outbox:' + workspaceId)); assert.equal(stored[0].requestId, sent.requestId, 'Outbox exists before network send'); return gate.promise; } }); t.after(h.close);
  const sending = h.current.send('改成深色主题', 'demo'); h.flush();
  h.navigation.current++; // w.open(B) invalidates A synchronously, before its read finishes.
  gate.resolve({ project }); await sending;
  assert.equal(h.saved.length, 0); h.rerender();
  assert.equal(signal.aborted, true);
  assert.equal(h.current.attempts[0].requestId, body.requestId);
  assert.equal(h.current.attempts[0].recovered, true);
});

test('save_pending retries only the original generation payload and request ID', async t => {
  const original = attempt(), sent = [];
  const h = harness({ recovered: [original], retryState: { retry: 'save' }, transport: async (path, body) => { sent.push({ path, body }); return { project }; } }); t.after(h.close);
  await h.current.send('a later unrelated draft', 'model', h.current.attempts[0]); h.flush();
  assert.deepEqual(sent, [{ path: '/api/generate', body: { requestId: original.requestId, prompt: original.text, mode: 'demo', projectId: appId, baseVersionId: 'v2' } }]);
  assert.equal(h.saved.length, 1); assert.equal(h.current.attempts.length, 0);
  assert.equal(h.current.completed.versionId, 'v3');
});

test('accepted new sends clear immediately, and successful completion stays attached to its saved version', async t => {
  const gate = deferred(), h = harness({ draft: '改成深色主题', transport: async () => gate.promise }); t.after(h.close);
  const sending = h.current.send('改成深色主题', 'demo');
  assert.equal(h.draft, '', 'Accepted send clears input before the POST resolves');
  h.flush();
  assert.equal(h.current.attempts.length, 1, 'Original prompt is immediately visible as a request message');
  assert.equal(h.accepted.length, 1);
  h.draft = '随后再做一项'; gate.resolve({ project }); await sending; h.flush();
  assert.equal(h.draft, '随后再做一项', 'A draft typed while busy is preserved');
  assert.equal(h.current.completed.projectId, appId);
  assert.equal(h.current.completed.versionId, 'v3');
  assert.equal(h.current.completed.progress.steps.every(step => step.state === 'completed'), true);
});

test('explicit demo rejection restores the submitted draft only when no newer draft exists', async t => {
  const h = harness({ draft: '增加多用户注册', transport: async () => { throw new api.LiteApiError('示例暂不支持。', 422); } }); t.after(h.close);
  await h.current.send('增加多用户注册', 'demo'); h.flush();
  assert.equal(h.draft, '增加多用户注册');
  assert.equal(h.rejected.length, 1);
  const next = harness({ draft: '增加多用户注册', transport: async () => { throw new api.LiteApiError('示例暂不支持。', 422); } }); t.after(next.close);
  const sending = next.current.send('增加多用户注册', 'demo'); next.draft = '这是新草稿'; await sending; next.flush();
  assert.equal(next.draft, '这是新草稿', 'Explicit rejection does not overwrite text entered after submission');
});

test('stop preserves the original request and rejects its late response without starting another POST', async t => {
  const gate = deferred(); let calls = 0;
  const h = harness({ transport: async () => { calls++; return gate.promise; } }); t.after(h.close);
  const sending = h.current.send('改成深色主题', 'demo'); h.flush();
  const requestId = h.current.attempts[0].requestId;
  h.current.stop(); h.flush(); gate.resolve({ project }); await sending; h.flush();
  await h.current.send('next draft', 'demo');
  assert.equal(calls, 1); assert.equal(h.saved.length, 0);
  assert.equal(h.current.attempts[0].requestId, requestId);
  assert.match(h.current.attempts[0].error, /模型费用可能继续/);
});

test('read-only recovery also invalidates immediately when navigation starts', async t => {
  const gate = deferred(), original = attempt();
  const h = harness({ recovered: [original], transport: async () => gate.promise }); t.after(h.close);
  const props = h.recoveryProps;
  const guard = { signal: new AbortController().signal, isCurrent: () => props.isCurrentGeneration(props.generation) };
  assert.equal(guard.isCurrent(), true);
  const reading = props.onRecovered(original, { requestId: original.requestId, status: 'done', projectId: appId, resultVersionId: 'v3' }, guard);
  h.navigation.current++; gate.resolve({ project }); await reading;
  assert.equal(h.saved.length, 0);
  assert.equal(h.current.attempts[0].requestId, original.requestId);
});

test('recovery completion uses the receipt version even when a later version is current', async t => {
  const original = attempt(), h = harness({ recovered: [original], transport: async () => ({ project }) }); t.after(h.close);
  const props = h.recoveryProps, guard = { signal: new AbortController().signal, isCurrent: () => true };
  await props.onRecovered(original, { requestId: original.requestId, status: 'done', projectId: appId, resultVersionId: 'v2' }, guard);
  h.flush();
  assert.equal(h.current.completed.projectId, appId);
  assert.equal(h.current.completed.versionId, 'v2', 'The receipt version is used instead of currentVersionId v3');
});

async function declaration(file, name) {
  const text = await readFile(new URL(file, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let result;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(tree); ts.forEachChild(node, visit); }
  visit(tree); assert.ok(result, name); return result;
}
const restoreSource = await declaration('../app/lite/LiteWorkbench.tsx', 'restore');
function restoreHarness(stale) {
  const gate = deferred(), navigation = { current: 0 }, events = []; let reload = 0;
  const bindings = {
    w: { project: { id: appId }, navigation, setError() {}, adopt: () => events.push('adopt'), refresh: async () => {} },
    appRef: { current: appId }, restoring: false, g: { busy: false, attempts: [] },
    validLiteProject: state.validLiteProject, setRestoring() {}, liteApi: async () => gate.promise, setViewId() {}, setReload: update => { reload = update(reload); events.push('remount'); }, setResultNote: () => events.push('outcome'),
  };
  const run = new Function(...Object.keys(bindings), compile(`const handler=(${restoreSource});`) + 'return handler;')(...Object.values(bindings));
  return { async execute() { const running = run('v1'); if (stale) navigation.current++; gate.resolve({ project: { ...project, currentVersionId: 'v1', versions: project.versions.map((v, index) => ({ ...v, id: index ? 'v2' : 'v1', number: index + 1 })) } }); await running; }, events, reload: () => reload };
}
test('lite restore remounts an already-previewed version after the saved receipt', async () => {
  const h = restoreHarness(false), before = state.previewIdentity(appId, 'v1', 0); await h.execute();
  assert.deepEqual(h.events, ['adopt', 'remount', 'outcome']);
  assert.notEqual(state.previewIdentity(appId, 'v1', h.reload()), before);
});
test('a restore response during pending navigation cannot adopt the old app or reset the target preview', async () => {
  const h = restoreHarness(true); await h.execute(); assert.deepEqual(h.events, []); assert.equal(h.reload(), 0);
});

test('a malformed JSON success cannot consume the original generation outbox entry', async t => {
  const h = harness({ transport: async () => ({}) }); t.after(h.close);
  await h.current.send('改成深色主题', 'demo'); h.flush();
  assert.equal(h.saved.length, 0);
  assert.equal(h.current.attempts.length, 1, 'Keep the original request available for receipt reconciliation');
  assert.equal(h.current.attempts[0].recovered, true);
  assert.equal(h.current.busy, false);
});

test('confirmed demo capability rejection allows editing without a nonexistent request to reconcile', async t => {
  let calls = 0;
  const h = harness({ transport: async () => { calls++; if (calls === 1) throw new api.LiteApiError('这项修改超出示例模式能力。', 422); return { project }; } }); t.after(h.close);
  await h.current.send('增加多用户注册', 'demo'); h.flush();
  assert.equal(h.saved.length, 0, 'Rejection must not replace the existing saved app');
  assert.equal(h.current.attempts.length, 0, 'Capability check precedes the server reservation');
  assert.equal(h.current.busy, false);
  assert.match(h.current.notice, /编辑|调整/);
  await h.current.send('改成深色主题', 'demo'); h.flush();
  assert.equal(calls, 2, 'A changed supported request can be sent directly');
  assert.equal(h.saved.length, 1);
});

test('network and timeout ambiguity never use the confirmed demo rejection shortcut', async t => {
  for (const error of [new Error('这项修改超出示例模式能力。'), new DOMException('timeout', 'TimeoutError'), new api.LiteApiError('temporary gateway', 502)]) {
    let calls = 0;
    const h = harness({ draft: 'original request', transport: async () => { calls++; throw error; } }); t.after(h.close);
    await h.current.send('original request', 'demo'); h.flush();
    assert.equal(h.draft, '', 'Unknown transport outcomes do not restore or overwrite the cleared input');
    assert.equal(h.current.attempts.length, 1);
    assert.equal(h.current.attempts[0].recovered, true);
    assert.equal(h.current.attempts[0].retryConfirmed, false);
    await h.current.send('later draft', 'demo'); assert.equal(calls, 1);
  }
});
