import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path) { const source = await readFile(new URL(path, import.meta.url), 'utf8'); return import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')); }
const { generationBody, previewIdentity, safeFilename, validLiteProject } = await load('../app/lite/state.ts');
const sample = { id: 'attempt', requestId: 'original-request', text: 'original prompt', mode: 'demo', projectId: 'application', managedProjectId: 'must-not-leak', baseVersionId: 'current-saved', contextId: 'draft', state: 'failed', error: 'network' };
test('continuous modification always uses the saved base and cannot send new-project grouping', () => {
  assert.deepEqual(generationBody(sample), { requestId: 'original-request', prompt: 'original prompt', mode: 'demo', projectId: 'application', baseVersionId: 'current-saved' });
});
test('new creation targets the selected management project and excludes stale base/context metadata', () => {
  assert.deepEqual(generationBody({ ...sample, projectId: undefined }), { requestId: 'original-request', prompt: 'original prompt', mode: 'demo', managedProjectId: 'must-not-leak' });
});
test('save-only retry preserves exact generation identity and content rather than consuming a new draft', () => {
  assert.deepEqual(generationBody({ ...sample, recovered: true }), generationBody({ ...sample, recovered: false, state: 'sending', error: undefined }));
});
test('restore reload creates a new iframe identity even for the same displayed history version', () => {
  assert.notEqual(previewIdentity('app', 'v1', 2), previewIdentity('app', 'v1', 3));
  assert.notEqual(previewIdentity('app', 'v1', 2), previewIdentity('another', 'v1', 2));
});
test('HTML export filename rejects reserved path and control characters', () => {
  assert.equal(safeFilename('../a:b?c\\d'), '.._a_b_c_d.html'); assert.equal(safeFilename('  '), 'motes-app.html'); assert.ok(safeFilename('a'.repeat(100)).length <= 75);
});
const { liteApi, LiteApiError } = await load('../app/lite/api.ts');
test('transport keeps server retry evidence, HTTP status, method and exact original body', async () => {
  const before = globalThis.fetch; let received;
  try {
    globalThis.fetch = async (path, options) => { received = { path, options }; return new Response(JSON.stringify({ error: 'confirmed rejected', retry: 'new' }), { status: 409 }); };
    await assert.rejects(liteApi('/api/generate', generationBody(sample)), error => error instanceof LiteApiError && error.status === 409 && error.retry === 'new');
    assert.equal(received.options.method, 'POST'); assert.deepEqual(JSON.parse(received.options.body), generationBody(sample)); assert.equal(received.options.cache, 'no-store');
  } finally { globalThis.fetch = before; }
});
test('malformed success response is rejected instead of claiming that an application was saved', async () => {
  const before = globalThis.fetch;
  try { globalThis.fetch = async () => new Response('<html>temporary gateway</html>', { status: 200 }); await assert.rejects(liteApi('/api/projects/a'), /有效结果/); }
  finally { globalThis.fetch = before; }
});
async function functionFrom(path, name, bindings) {
  const text = await readFile(new URL(path, import.meta.url), 'utf8'), tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let selected;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) selected = node.getText(tree); ts.forEachChild(node, visit); } visit(tree); assert.ok(selected, name);
  const js = ts.transpileModule(selected + '\nreturn ' + name + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
}
test('actual restore handler reloads the iframe even when the selected history page is already displayed', async () => {
  const next = { id: 'app', title: 'app', currentVersionId: 'v1', versions: [{ id: 'v1', number: 1, html: '<html>v1</html>', prompt: 'first', summary: 'saved' }] }, state = { reload: 4, viewId: 'v1', adopted: null };
  const restore = await functionFrom('../app/lite/LiteWorkbench.tsx', 'restore', { validLiteProject, w: { project: { id: 'app' }, navigation: { current: 1 }, setError() {}, adopt(p) { state.adopted = p; }, refresh: async () => ({}) }, restoring: false, g: { busy: false, attempts: [] }, appRef: { current: 'app' }, liteApi: async () => ({ project: next }), setRestoring() {}, setViewId: id => state.viewId = id, setReload: update => state.reload = update(state.reload), setResultNote() {} });
  await restore('v1'); assert.equal(state.reload, 5); assert.equal(state.viewId, null); assert.equal(state.adopted, next);
});
async function publisher({ pending = null, versionId = 'v1', transport, removeThrows = false } = {}) {
  const output = { messages: [], requests: [], pending, publication: null, cleared: 0 }, storage = { setItem() {}, removeItem() { if (removeThrows) throw new Error('storage blocked'); output.cleared++; } };
  const clearPending = await functionFrom('../app/lite/LitePublication.tsx', 'clearPending', { sessionStorage: storage, key: 'key' });
  const publish = await functionFrom('../app/lite/LitePublication.tsx', 'publish', { busy: false, ready: true, pending, versionId, publication: { revision: 2 }, crypto, publicationPreflight: () => ({ errors: [] }), html: '<html><body>ok</body></html>', setMessage: text => output.messages.push(text), setPending: body => output.pending = body, setBusy() {}, setPublication: value => output.publication = value, setConfirm() {}, sessionStorage: storage, key: 'key', mounted: { current: true }, path: '/api/projects/app/publication', clearPending, liteApi: async (path, body) => { output.requests.push({ path, body }); return transport(path, body); } });
  return { output, publish };
}
test('confirmed publication stays successful if browser storage cleanup throws', async () => {
  const h = await publisher({ removeThrows: true, transport: async () => ({ publication: { versionNumber: 1, enabled: true } }) });
  await h.publish(); assert.equal(h.output.publication.versionNumber, 1); assert.match(h.output.messages.at(-1), /已发布 v1/); assert.equal(h.output.pending, null);
});
test('ambiguous publication retries its original version, revision and request ID despite a different visible version', async () => {
  const first = await publisher({ transport: async () => { throw new Error('network lost'); } }); await first.publish();
  const original = first.output.pending; assert.equal(original.versionId, 'v1');
  const retry = await publisher({ pending: original, versionId: 'v9', transport: async () => ({ publication: { versionNumber: 1, enabled: true } }) }); await retry.publish();
  assert.deepEqual(retry.output.requests[0].body, original); assert.equal(retry.output.requests.length, 1);
});
test('publication conflict only reads latest revision and asks for review instead of silently republishing', async () => {
  const h = await publisher({ transport: async (_path, body) => { if (body) throw Object.assign(new Error('conflict'), { status: 409 }); return { publication: { revision: 7, versionNumber: 4, enabled: true } }; } });
  await h.publish(); assert.equal(h.output.requests.filter(r => r.body).length, 1); assert.equal(h.output.requests.filter(r => !r.body).length, 1); assert.equal(h.output.publication.revision, 7); assert.equal(h.output.pending, null); assert.match(h.output.messages.at(-1), /核对/);
});

