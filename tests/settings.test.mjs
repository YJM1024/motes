import {executionMock} from './helpers/workflow-model-mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

async function harness(model = 'fake-configured-model') {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  const migrations = ['0000_great_roland_deschain', '0001_first_wind_dancer', '0002_workspace_settings', '0004_version_annotations', '0006_model_usage', '0007_generation_candidates', '0014_version_config', '0011_generation_results', '0017_stale_millenium_guard', '0018_strong_leech'];
  for (const name of migrations) sqlite.exec(await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'));
  function prepare(sql, args = []) { return { bind(...values) { return prepare(sql, values); }, async first() { return sqlite.prepare(sql).get(...args) ?? null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; } }; }
  const env = { OPENAI_API_KEY: model ? 'test-only-not-a-real-key' : '', OPENAI_MODEL: model || '', DB: { prepare, async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } };
  const key = crypto.randomUUID(); globalThis[key] = env;
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
  const settings = await import(await moduleUrl('motes/settings'));
  const management = await import(await moduleUrl('motes/management'));
  const server = await import(await moduleUrl('forma/server'));
  const demo = await import(await moduleUrl('forma/demo')); delete globalThis[key];
  const who = 'a'.repeat(64), other = 'b'.repeat(64);
  await management.initializeWorkspace(who); await management.initializeWorkspace(other);
  const read = (selection = {}, visitor = who) => settings.readSettings(env.DB, visitor, model, selection);
  const save = (patch, scope = 'workspace', selection = {}, visitor = who) => settings.saveSettings(env.DB, visitor, model, { scope, patch, ...selection });
  const now = new Date().toISOString();
  function project(id, visitor = who) { sqlite.prepare('INSERT INTO motes_projects(id,workspace_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, `workspace:${visitor}`, id, now, now); }
  function app(id, projectId, visitor = who) {
    sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id, visitor, id, now, now, 'version:' + id);
    sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run('version:' + id, id, 1, 'original', 'original', demo.generateDemo('番茄钟').html, now, 'demo', null);
    sqlite.prepare('INSERT INTO motes_apps(app_id,workspace_id,project_id,updated_at) VALUES(?,?,?,?)').run(id, `workspace:${visitor}`, projectId, now);
  }
  return { sqlite, settings, management, server, demo, env, who, other, read, save, project, app, close: () => sqlite.close() };
}

test('configured defaults favor AI; missing model rejects saving AI and safely falls back after removal', async t => {
  const h = await harness(); t.after(h.close);
  const initial = await h.read(); assert.equal(initial.effective.creationMode, 'model'); assert.deepEqual(initial.models, ['fake-configured-model']);
  await h.save({ creationMode: 'model' });
  const fallback = await h.settings.readSettings(h.env.DB, h.who, null);
  assert.equal(fallback.effective.creationMode, 'demo'); assert.equal(fallback.sources.creationMode, 'server'); assert.deepEqual(fallback.models, []);
  await assert.rejects(h.settings.saveSettings(h.env.DB, h.who, null, { scope: 'workspace', patch: { creationMode: 'model' } }), e => e.status === 409);
  const noModel = await harness(null); t.after(noModel.close); assert.equal((await noModel.read()).effective.creationMode, 'demo');
});
test('workspace, project and app inheritance persists; null restores the parent with correct sources', async t => {
  const h = await harness(); t.after(h.close); h.project('p'); h.app('app', 'p');
  await h.save({ language: 'en', previewDevice: 'mobile', autoFollow: false });
  await h.save({ visualStyle: 'bold', language: 'zh-CN' }, 'project', { projectId: 'p' });
  const saved = await h.save({ language: 'en', showWaitTimer: false }, 'app', { appId: 'app' });
  assert.equal(saved.effective.language, 'en'); assert.equal(saved.sources.language, 'app'); assert.equal(saved.sources.visualStyle, 'project'); assert.equal(saved.sources.previewDevice, 'workspace');
  assert.equal(saved.effective.autoFollow, false); assert.equal(saved.effective.showWaitTimer, false);
  const reset = await h.save({ language: null }, 'app', { appId: 'app' });
  assert.equal(reset.effective.language, 'zh-CN'); assert.equal(reset.sources.language, 'project');
  assert.equal((await h.read({ appId: 'app' })).effective.previewDevice, 'mobile');
});
test('settings and all referenced scope identifiers are isolated by owner', async t => {
  const h = await harness(); t.after(h.close); h.project('p'); h.app('app', 'p');
  await h.save({ language: 'en' }); assert.equal((await h.read({}, h.other)).effective.language, 'zh-CN');
  for (const selection of [{ appId: 'app' }, { projectId: 'p' }]) {
    await assert.rejects(h.read(selection, h.other), e => e.status === 404);
    await assert.rejects(h.save({ language: 'en' }, selection.appId ? 'app' : 'project', selection, h.other), e => e.status === 404);
  }
  h.project('another'); await assert.rejects(h.read({ appId: 'app', projectId: 'another' }), e => e.status === 400);
});
test('unknown security fields, wrong enum and non-boolean values reject atomically', async t => {
  const h = await harness(); t.after(h.close);
  for (const patch of [{ language: 'fr' }, { visualStyle: 'x'.repeat(10000) }, { autoFollow: 'false' }, { timeout: 999999 }, { apiKey: 'invalid' }, { language: 'en', showWaitTimer: 0 }, {}, []]) await assert.rejects(h.save(patch), e => e.status === 400);
  assert.equal((await h.read()).effective.language, 'zh-CN'); assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_settings').get().n, 0);
  await assert.rejects(h.settings.saveSettings(h.env.DB, h.who, 'model', { scope: 'workspace', appId: 'foreign', patch: { language: 'en' } }), e => e.status === 400);
});
test('moving an app changes inherited project defaults and settings never mutate HTML or versions', async t => {
  const h = await harness(); t.after(h.close); h.project('p1'); h.project('p2'); h.app('app', 'p1');
  const before = h.sqlite.prepare('SELECT * FROM forma_versions').all();
  await h.save({ language: 'en' }, 'project', { projectId: 'p1' }); await h.save({ visualStyle: 'soft' }, 'project', { projectId: 'p2' });
  assert.equal((await h.read({ appId: 'app' })).effective.language, 'en');
  h.sqlite.prepare('UPDATE motes_apps SET project_id=? WHERE app_id=?').run('p2', 'app');
  const moved = await h.read({ appId: 'app' }); assert.equal(moved.effective.language, 'zh-CN'); assert.equal(moved.effective.visualStyle, 'soft');
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions').all(), before);
  assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get('app').current_version_id, 'version:app');
});
test('production generation loads server defaults; client preference fields cannot override instructions', async t => {
  const h = await harness(); t.after(h.close);
  // Production owner() hashes the anonymous cookie.
  const request = body => new Request('https://motes.test/api/generate', { method: 'POST', headers: { origin: 'https://motes.test', cookie: 'forma_session=' + 'c'.repeat(64), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const who = await h.server.owner(request({})); await h.management.initializeWorkspace(who);
  await h.settings.saveSettings(h.env.DB, who, 'fake-configured-model', { scope: 'workspace', patch: { language: 'en', visualStyle: 'soft' } });
  const captured = [];
  t.mock.method(globalThis, 'fetch',executionMock( async (_url, options) => { captured.push(JSON.parse(options.body)); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: h.demo.generateDemo('番茄钟').html }] }] }); }));
  const first = await (await h.server.generate(request({ mode: 'model', prompt: 'Create a timer', language: 'zh-CN', visualStyle: 'bold', requestId: crypto.randomUUID() }))).json();
  assert.match(captured[0].instructions, /UI language English/); assert.match(captured[0].instructions, /soft colors/); assert.match(captured[0].instructions, /Explicit requirements.*take priority/);
  await h.server.generate(request({ mode: 'model', prompt: 'Add a reset button', projectId: first.project.id, requestId: crypto.randomUUID() }));
  assert.match(captured[1].instructions, /This is an edit: preserve existing language and visual design/);
  assert.equal(captured[0].model, 'fake-configured-model'); assert.equal(captured[0].store, false); assert.equal(captured[0].max_output_tokens, 12000);
});
test('settings migration only declares schema and leaves pre-existing records unchanged', async t => {
  const h = await harness(); t.after(h.close);
  const sql = await readFile(new URL('../drizzle/0002_workspace_settings.sql', import.meta.url), 'utf8');
  const statements = sql.replace(/--[^\r\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  assert.ok(statements.every(s => /^CREATE\s+(TABLE|UNIQUE INDEX)/i.test(s)));
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length, 0);
});
