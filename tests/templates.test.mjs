import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

async function harness() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0000_great_roland_deschain', '0001_first_wind_dancer', '0002_workspace_settings', '0003_fixed_version_shares', '0004_version_annotations', '0005_personal_prompt_templates']) sqlite.exec(await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'));
  const control = { beforeWrite: null, failRead: false };
  function prepare(sql, args = []) { return { bind(...values) { return prepare(sql, values); }, async first() { return sqlite.prepare(sql).get(...args) ?? null; }, async all() { if (control.failRead && sql.includes('FROM motes_prompt_templates')) { control.failRead = false; throw Error('simulated snapshot outage'); } return { results: sqlite.prepare(sql).all(...args) }; }, run() { if (control.beforeWrite && /^(?:INSERT INTO|UPDATE|DELETE FROM) motes_prompt_templates/.test(sql)) { const action = control.beforeWrite; control.beforeWrite = null; action(); } return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } }; }
  const envKey = crypto.randomUUID(); globalThis[envKey] = { DB: { prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const result = statements.map(s => s.run()); sqlite.exec('COMMIT'); return result; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } };
  const cache = new Map();
  async function moduleUrl(file) {
    if (cache.has(file)) return cache.get(file);
    let source = await readFile(new URL('../lib/' + file + '.ts', import.meta.url), 'utf8');
    source = source.replace("import { env } from 'cloudflare:workers';", `const env=globalThis[${JSON.stringify(envKey)}];`);
    for(const declaration of ts.createSourceFile('module.ts',source,ts.ScriptTarget.Latest,true).statements.filter(n=>(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier).toReversed()){if(declaration.importClause?.isTypeOnly||declaration.isTypeOnly)continue;const spec=declaration.moduleSpecifier.text;const resolved=spec.startsWith('.')?await moduleUrl((new URL(spec+'.ts',new URL('../lib/' + file + '.ts', import.meta.url))).pathname.split('/lib/').at(-1).replace(/\.ts$/, '')):import.meta.resolve(spec);source=source.slice(0,declaration.moduleSpecifier.getStart())+JSON.stringify(resolved)+source.slice(declaration.moduleSpecifier.end);}
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); cache.set(file, url); return url;
  }
  const templates = await import(await moduleUrl('motes/templates')), server = await import(await moduleUrl('forma/server')), security = await import(await moduleUrl('forma/security')); delete globalThis[envKey];
  async function call(body, { visitor = 'a', query = '', origin = 'https://motes.test' } = {}) {
    const request = new Request('https://motes.test/api/templates' + query, { method: body ? 'POST' : 'GET', headers: { cookie: 'forma_session=' + visitor.repeat(64), ...(body ? { origin, 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const r = await server.route(() => body ? templates.manageTemplates(request) : templates.getTemplates(request)); return { status: r.status, data: await r.json() };
  }
  const createBody = (overrides = {}) => ({ action: 'create', name: 'Travel Budget', prompt: '做一个旅行预算工具', requestId: crypto.randomUUID(), ...overrides });
  return { sqlite, control, call, createBody, who: v => security.digest(v.repeat(64)), close: () => sqlite.close() };
}

test('personal CRUD persists, builtins stay read-only and no model calls or app writes occur', async t => {
  const h = await harness(); t.after(h.close); t.mock.method(globalThis, 'fetch', () => { throw Error('Templates never call models'); });
  const initial = await h.call(); assert.equal(initial.status, 200); assert.equal(initial.data.total, 0); assert.equal(initial.data.builtins.length, 3); assert.ok(initial.data.builtins.every(b => b.readonly));
  const created = await h.call(h.createBody()); assert.equal(created.status, 201); const id = created.data.templateId;
  const edited = await h.call({ action: 'update', id, name: '新版名称', prompt: '保留需求，增加一个按钮', requestId: crypto.randomUUID() }); assert.equal(edited.status, 200); assert.equal(edited.data.templates[0].name, '新版名称'); assert.equal(edited.data.templates[0].prompt, '保留需求，增加一个按钮');
  assert.equal((await h.call()).data.templates[0].name, '新版名称');
  assert.equal((await h.call({ action: 'delete', id, requestId: crypto.randomUUID() })).data.total, 0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n, 0); assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n, 0);
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM forma_requests WHERE mode IN ('model','demo')").get().n, 0);
});
test('search covers names and prompt text while total count remains accurate', async t => {
  const h = await harness(); t.after(h.close); await h.call(h.createBody()); await h.call(h.createBody({ name: 'Focus', prompt: '专注计时' }));
  const name = await h.call(undefined, { query: '?q=BUDGET' }); assert.equal(name.data.templates.length, 1); assert.equal(name.data.total, 2);
  assert.equal((await h.call(undefined, { query: '?q=' + encodeURIComponent('专注') })).data.templates[0].name, 'Focus');
  assert.equal((await h.call(undefined, { query: '?q=missing' })).data.templates.length, 0);
});
test('anonymous workspaces isolate reads, IDs and global request receipts', async t => {
  const h = await harness(); t.after(h.close); const body = h.createBody(); const created = await h.call(body), id = created.data.templateId;
  assert.equal((await h.call(undefined, { visitor: 'b' })).data.total, 0);
  assert.equal((await h.call({ action: 'update', id, name: 'stolen', requestId: crypto.randomUUID() }, { visitor: 'b' })).status, 404);
  assert.equal((await h.call({ action: 'delete', id, requestId: crypto.randomUUID() }, { visitor: 'b' })).status, 404);
  assert.equal((await h.call(body, { visitor: 'b' })).status, 409);
  assert.equal((await h.call()).data.templates[0].name, 'Travel Budget');
});
test('all actions are idempotent; replaying old create/update after a delete never resurrects data', async t => {
  const h = await harness(); t.after(h.close); const create = h.createBody();
  const concurrent = await Promise.all([h.call(create), h.call(create)]); assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 201]);
  const id = concurrent[0].data.templateId; assert.equal((await h.call()).data.total, 1);
  const update = { action: 'update', id, name: 'Renamed', requestId: crypto.randomUUID() }; await h.call(update); await h.call(update);
  assert.equal((await h.call({ ...update, name: 'Conflicting' })).status, 409);
  const remove = { action: 'delete', id, requestId: crypto.randomUUID() }; await h.call(remove); assert.equal((await h.call(remove)).status, 200);
  assert.equal((await h.call(create)).data.total, 0); assert.equal((await h.call(update)).data.total, 0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n, 3);
});
test('invalid names, prompts, IDs, fields, origin and builtin mutations are rejected before template writes', async t => {
  const h = await harness(); t.after(h.close);
  for (const patch of [{ name: '' }, { name: 'a'.repeat(81) }, { prompt: ' ' }, { prompt: 'a'.repeat(4001) }, { prompt: null }, { apiKey: 'no' }, { requestId: 'bad' }, { action: ['create'] }]) assert.equal((await h.call(h.createBody(patch))).status, 400);
  assert.equal((await h.call(h.createBody(), { origin: 'https://invalid.test' })).status, 403);
  assert.equal((await h.call({ action: 'delete', id: 'builtin:travel', requestId: crypto.randomUUID() })).status, 400);
  assert.equal((await h.call({ action: 'update', id: crypto.randomUUID(), requestId: crypto.randomUUID() })).status, 400);
  assert.equal((await h.call(undefined, { query: '?q=' + 'a'.repeat(101) })).status, 400); assert.equal((await h.call(undefined, { query: '?workspaceId=foreign' })).status, 400);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_prompt_templates').get().n, 0);
});
test('the final free slot is atomically reserved and deleting a template frees capacity', async t => {
  const h = await harness(); t.after(h.close); await h.call(); const wid = 'workspace:' + await h.who('a'), now = new Date().toISOString();
  for (let i = 0; i < 49; i++) h.sqlite.prepare('INSERT INTO motes_prompt_templates VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(), wid, 'Saved ' + i, 'prompt', now, now);
  const result = await Promise.all([h.call(h.createBody()), h.call(h.createBody())]); assert.deepEqual(result.map(r => r.status).sort(), [201, 429]); assert.equal((await h.call()).data.total, 50);
  const id = result.find(r => r.status === 201).data.templateId; await h.call({ action: 'delete', id, requestId: crypto.randomUUID() }); assert.equal((await h.call(h.createBody())).status, 201);
});
test('failed receipt writes roll back create/update/delete and input can safely retry', async t => {
  const h = await harness(); t.after(h.close);
  const block = () => h.sqlite.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON forma_requests WHEN NEW.mode LIKE 'template-%' BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
  const unblock = () => h.sqlite.exec('DROP TRIGGER fail_receipt');
  block(); const create = h.createBody(); assert.equal((await h.call(create)).status, 500); assert.equal((await h.call()).data.total, 0); unblock();
  const created = await h.call(create), id = created.data.templateId;
  block(); const update = { action: 'update', id, name: 'New', requestId: crypto.randomUUID() }; assert.equal((await h.call(update)).status, 500); assert.equal((await h.call()).data.templates[0].name, create.name); unblock(); assert.equal((await h.call(update)).status, 200);
  block(); const remove = { action: 'delete', id, requestId: crypto.randomUUID() }; assert.equal((await h.call(remove)).status, 500); assert.equal((await h.call()).data.total, 1); unblock(); assert.equal((await h.call(remove)).status, 200);
});
test('a post-commit snapshot outage reconciles the same completed create', async t => {
  const h = await harness(); t.after(h.close); const body = h.createBody(); h.control.failRead = true;
  assert.equal((await h.call(body)).status, 500); const retry = await h.call(body); assert.equal(retry.status, 200); assert.equal(retry.data.total, 1);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n, 1);
});
test('0005 migration only declares the private template table and preserves the 0004 schema chain', async t => {
  const h = await harness(); t.after(h.close); const sql = await readFile(new URL('../drizzle/0005_personal_prompt_templates.sql', import.meta.url), 'utf8');
  assert.ok(sql.split(';').map(s => s.replace(/--[^\r\n]*/g, '').trim()).filter(Boolean).every(s => /^CREATE (?:TABLE|INDEX)/i.test(s)));
  const a = JSON.parse(await readFile(new URL('../drizzle/meta/0004_snapshot.json', import.meta.url), 'utf8')), b = JSON.parse(await readFile(new URL('../drizzle/meta/0005_snapshot.json', import.meta.url), 'utf8')); assert.equal(b.prevId, a.id);
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
});
