import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

async function harness() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0000_great_roland_deschain', '0001_first_wind_dancer', '0002_workspace_settings', '0004_version_annotations', '0006_model_usage', '0011_generation_results']) sqlite.exec(await readFile(new URL(`../drizzle/${file}.sql`, import.meta.url), 'utf8'));
  const control = { beforeBatch: null };
  function prepare(sql, args = []) { return { bind(...values) { return prepare(sql, values); }, async first() { return sqlite.prepare(sql).get(...args) ?? null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } }; }
  const key = crypto.randomUUID(); globalThis[key] = { OPENAI_API_KEY: 'fake-test-key', OPENAI_MODEL: 'fake-model', DB: { prepare, async batch(statements) { if (control.beforeBatch) { const run = control.beforeBatch; control.beforeBatch = null; run(); } sqlite.exec('BEGIN'); try { const result = statements.map(s => s.run()); sqlite.exec('COMMIT'); return result; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } };
  const cache = new Map();
  async function moduleUrl(file) {
    if (cache.has(file)) return cache.get(file);
    let source = await readFile(new URL('../lib/' + file + '.ts', import.meta.url), 'utf8');
    source = source.replace("import { env } from 'cloudflare:workers';", `const env=globalThis[${JSON.stringify(key)}];`);
    for (const match of [...source.matchAll(/(?:from\s+)(['"])(\.[^'"]+)\1/g)]) {
      const target = new URL(match[2] + '.ts', new URL('../lib/' + file + '.ts', import.meta.url));
      source = source.replaceAll(match[1] + match[2] + match[1], JSON.stringify(await moduleUrl(target.pathname.split('/lib/').at(-1).replace(/\.ts$/, ''))));
    }
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); cache.set(file, url); return url;
  }
  const editor = await import(await moduleUrl('motes/source-editor')), server = await import(await moduleUrl('forma/server')), security = await import(await moduleUrl('forma/security')), tools = await import(await moduleUrl('motes/version-tools')), demo = await import(await moduleUrl('forma/demo')); delete globalThis[key];
  async function seed(visitor = 'a', count = 2) {
    const who = await security.digest(visitor.repeat(64)), id = crypto.randomUUID(), now = new Date().toISOString(), ids = Array.from({ length: count }, () => crypto.randomUUID());
    sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id, who, 'Source test', now, now, ids.at(-1));
    for (let i = 0; i < count; i++) sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(ids[i], id, i + 1, 'saved prompt', 'saved summary', demo.generateDemo('番茄钟').html, now, 'demo', null);
    return { id, who, ids, base: ids[0], current: ids.at(-1) };
  }
  function request(body, visitor = 'a', origin = 'https://motes.test', extra = {}) { return new Request('https://motes.test/api/source', { method: 'POST', headers: { origin, cookie: 'forma_session=' + visitor.repeat(64), 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }); }
  async function save(app, overrides = {}, visitor = 'a', origin = 'https://motes.test') {
    const body = { baseVersionId: app.base, expectedCurrentVersionId: app.current, html: demo.generateDemo('番茄钟').html.replace('专注', '手工专注'), requestId: crypto.randomUUID(), ...overrides };
    const response = await server.route(() => editor.saveSource(request(body, visitor, origin), app.id)); return { status: response.status, data: await response.json(), body };
  }
  async function meta(app, versionId, body, visitor = 'a') { const response = await server.route(() => editor.updateVersionMetadata(request(body, visitor), app.id, versionId)); return { status: response.status, data: await response.json() }; }
  return { sqlite, control, editor, server, tools, demo, seed, request, save, meta, close: () => sqlite.close() };
}

test('manual save creates an immutable complete version without model calls or model quota', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed();
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Manual saves must never call fetch'); });
  const before = h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY number').all();
  const saved = await h.save(app, { name: 'First manual' }); assert.equal(saved.status, 201);
  const version = saved.data.project.versions.at(-1); assert.equal(version.number, 3); assert.equal(version.mode, 'manual'); assert.equal(version.model, undefined); assert.equal(version.name, 'First manual'); assert.equal(version.important, false);
  assert.equal(saved.data.project.currentVersionId, version.id); assert.equal(version.html, saved.body.html);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions WHERE number<3 ORDER BY number').all(), before);
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM forma_requests WHERE mode IN ('model','demo')").get().n, 0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_locks').get().n, 0);
});
test('same request retries once; mismatched contents and cross-owner references are rejected', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed();
  const saved = await h.save(app); assert.equal(saved.status, 201);
  const retry = await h.save(app, saved.body); assert.equal(retry.status, 200); assert.equal(retry.data.project.currentVersionId, saved.data.project.currentVersionId); assert.equal(retry.data.project.versions.length, 3);
  assert.equal((await h.save(app, { ...saved.body, html: saved.body.html + ' ' })).status, 200, 'Outer whitespace is normalized before fingerprinting');
  assert.equal((await h.save(app, { ...saved.body, name: 'changed' })).status, 409);
  assert.equal((await h.save(app, saved.body, 'b')).status, 409);
  assert.equal((await h.save(app, {}, 'b')).status, 404);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n, 3);
});
test('complete source larger than ordinary API payload limits is saved without truncation', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed();
  const html = h.demo.generateDemo('番茄钟').html.replace('</body>', `<!-- ${'large source '.repeat(2000)} --></body>`);
  assert.ok(html.length > 16000 && html.length < 180000);
  const saved = await h.save(app, { html }); assert.equal(saved.status, 201); assert.equal(saved.data.project.versions.at(-1).html, html);
});
test('explicit historical base is allowed while stale or foreign base/current pointers fail safely', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed(); const foreign = await h.seed('b');
  assert.equal((await h.save(app, { baseVersionId: foreign.base })).status, 404);
  assert.equal((await h.save(app, { expectedCurrentVersionId: app.base })).status, 409);
  assert.equal((await h.save(app)).status, 201);
  assert.equal((await h.save(app)).status, 409);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions WHERE project_id=?').get(app.id).n, 3);
});
test('active generation lock prevents manual publishing; expired locks can be replaced', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed();
  h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(app.id, 'other-worker', Date.now() + 60000);
  assert.equal((await h.save(app)).status, 409); assert.equal(h.sqlite.prepare('SELECT request_id FROM forma_locks').get().request_id, 'other-worker');
  h.sqlite.prepare('UPDATE forma_locks SET expires_at=0').run(); assert.equal((await h.save(app)).status, 201);
});
test('capacity and concurrent last-slot saves are protected inside the transaction', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed('a', 59);
  const result = await Promise.all([h.save(app), h.save(app)]); assert.equal(result.filter(r => r.status === 201).length, 1); assert.ok(result.some(r => [409, 429].includes(r.status)), 'The competing stale/capacity request is rejected');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n, 60); assert.equal((await h.save({ ...app, current: result.find(r => r.status === 201).data.project.currentVersionId })).status, 429);
});
test('storage failures roll back lease, request, annotation and version; same request remains retryable', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed();
  h.sqlite.exec("CREATE TRIGGER fail_manual BEFORE INSERT ON motes_version_annotations BEGIN SELECT RAISE(ABORT,'storage failure'); END");
  const failed = await h.save(app); assert.equal(failed.status, 500);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n, 0); assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_locks').get().n, 0); assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n, 2);
  h.sqlite.exec('DROP TRIGGER fail_manual'); assert.equal((await h.save(app, failed.body)).status, 201);
});
test('atomic guards detect changed owner, pointer, capacity and newly acquired lock after validation', async t => {
  for (const kind of ['owner', 'pointer', 'lock', 'capacity']) {
    const h = await harness(); t.after(h.close); const app = await h.seed('a', kind === 'capacity' ? 59 : 2);
    h.control.beforeBatch = () => {
      if (kind === 'owner') h.sqlite.prepare('UPDATE forma_projects SET owner=? WHERE id=?').run('different-owner', app.id);
      if (kind === 'pointer') h.sqlite.prepare('UPDATE forma_projects SET current_version_id=? WHERE id=?').run(app.base, app.id);
      if (kind === 'lock') h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(app.id, 'new-worker', Date.now() + 60000);
      if (kind === 'capacity') h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), app.id, 60, 'concurrent', 'concurrent', h.demo.generateDemo('番茄钟').html, new Date().toISOString(), 'demo', null);
    };
    assert.ok([404, 409, 429].includes((await h.save(app)).status));
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n, kind === 'capacity' ? 60 : 2); assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n, 0); assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_version_annotations').get().n, 0);
  }
});
test('metadata changes only scoped annotations, supports clearing names, and never changes current HTML', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed(); const before = h.sqlite.prepare('SELECT * FROM forma_versions').all();
  const marked = await h.meta(app, app.base, { name: '<b>Release</b>', important: true }); assert.equal(marked.status, 200); assert.equal(marked.data.project.versions[0].name, '<b>Release</b>'); assert.equal(marked.data.project.versions[0].important, true);
  await h.meta(app, app.base, { name: '' }); const project = await h.server.readProject(app.who, app.id); assert.equal(project.versions[0].name, ''); assert.equal(project.versions[0].important, true); assert.equal(project.currentVersionId, app.current);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions').all(), before);
  assert.equal((await h.meta(app, app.base, { important: false }, 'b')).status, 404);
  for (const body of [{ name: 'a'.repeat(81) }, { important: 'true' }, { html: 'change' }, {}]) assert.equal((await h.meta(app, app.base, body)).status, 400);
});
test('HTML, request size, origin, IDs and extra fields are validated before writes', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed();
  for (const html of ['<p>fragment</p>', '<!doctype html><html><body>' + 'x'.repeat(100) + '</body></html>']) assert.equal((await h.save(app, { html })).status, 422);
  assert.equal((await h.save(app, { html: 'x'.repeat(180001) })).status, 413);
  assert.equal((await h.save(app, { html: 'x'.repeat(1200001) })).status, 413);
  assert.equal((await h.save(app, { requestId: 'bad' })).status, 400); assert.equal((await h.save(app, { apiKey: 'no' })).status, 400);
  assert.equal((await h.save(app, {}, 'a', 'https://other.test')).status, 403);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n, 0);
});
test('manual versions can be copied; subsequent real-generation path uses demo/model and retains manual base', async t => {
  const h = await harness(); t.after(h.close); const app = await h.seed();
  const manual = await h.save(app); assert.equal(manual.status, 201); const version = manual.data.project.versions.at(-1);
  const copyResponse = await h.server.route(() => h.tools.forkVersion(h.request({ versionId: version.id, requestId: crypto.randomUUID() }), app.id)); assert.equal(copyResponse.status, 201); assert.equal((await copyResponse.json()).project.versions[0].mode, 'manual');
  let modelCalls = 0; t.mock.method(globalThis, 'fetch', async (_url, options) => { modelCalls++; assert.match(JSON.parse(options.body).input, /手工专注/); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: h.demo.generateDemo('番茄钟').html }] }] }); });
  const generated = await h.server.generate(h.request({ mode: 'model', prompt: 'Add a button', projectId: app.id, baseVersionId: version.id, requestId: crypto.randomUUID() })); assert.equal(generated.status, 200); assert.equal((await generated.json()).project.versions.at(-1).mode, 'model'); assert.equal(modelCalls, 1);
});
