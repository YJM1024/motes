// Zero-model HTTP core journey; writes only to its own named QA app.
// node tests/smoke.mjs [http://127.0.0.1:5173] [path/to/report.json]
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const base = new URL(process.argv[2] || 'http://127.0.0.1:5173');
assert.ok(['http:', 'https:'].includes(base.protocol) && base.pathname === '/' && !base.search && !base.hash && !base.username && !base.password, 'Use a plain HTTP(S) origin');
const origin = base.origin, output = process.argv[3], timeoutMs = 20000;
const report = { passed: false, origin, startedAt: new Date().toISOString(), timeoutMs, modelCalls: 0, checks: [], requests: [], cleanup: {} };
const cookies = new Map();
let appId, shareId, publication;
const digest = text => createHash('sha256').update(text).digest('hex');
async function request(client, path, { body, method = body ? 'POST' : 'GET', expected = 200, source = origin } = {}) {
  if (path === '/api/generate') assert.equal(body?.mode, 'demo', 'Smoke must never invoke a model');
  const started = performance.now();
  const response = await fetch(new URL(path, origin), {
    method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { ...(cookies.has(client) ? { Cookie: cookies.get(client) } : {}), ...(method !== 'GET' ? { Origin: source, 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const cookie = response.headers.get('set-cookie')?.match(/(?:^|,\s*)forma_session=[a-f0-9]{64}/)?.[0].replace(/^,\s*/, '');
  if (cookie) cookies.set(client, cookie);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  const loggedPath = path.replace(/(\/api\/(?:publications|shares)\/)[^/]+/, '$1[token]');
  report.requests.push({ method, path: loggedPath, status: response.status, elapsedMs: Math.round(performance.now() - started) });
  assert.equal(response.status, expected, `${loggedPath}: expected HTTP ${expected}, got ${response.status}`);
  return { data, text, headers: response.headers };
}
const json = async (...args) => (await request(...args)).data;
const path = () => `/api/projects/${appId}`;
const read = client => json(client, path());
async function step(name, run) { await run(); report.checks.push(name); }
async function session(client) {
  const data = await json(client, '/api/session');
  assert.ok(cookies.has(client), 'New visitor receives a session cookie');
  assert.ok(['private', 'shared'].includes(data.visibility), 'Explicit workspace visibility');
  return data;
}
function assertVersions(project, versions, currentVersionId) {
  assert.equal(project.currentVersionId, currentVersionId);
  assert.deepEqual(project.versions, versions, 'Saved versions, including HTML, remain immutable');
}
try {
  const a = await session('owner'), b = await session('other');
  report.visibility = a.visibility;
  assert.equal(a.visibility, b.visibility);
  assert.notEqual(cookies.get('owner'), cookies.get('other'));
  assert.equal(a.workspaceId === b.workspaceId, a.visibility === 'shared');
  await step('named QA demo creation and idempotent retry', async () => {
    const body = { kind: 'budget', title: `QA core journey ${new Date().toISOString()}`, requestId: randomUUID() };
    const first = await json('owner', '/api/apps/seed', { body, expected: 201 });
    appId = first.project?.id; assert.ok(appId); report.appId = appId;
    assert.equal(first.project.versions.length, 1);
    assert.equal(first.project.versions[0].mode, 'demo');
    assert.ok(first.project.title.startsWith('QA core journey '));
    const retry = await json('owner', '/api/apps/seed', { body });
    assert.equal(retry.project.id, appId);
    assertVersions(retry.project, first.project.versions, first.project.currentVersionId);
  });
  const original = (await read('owner')).project, firstVersion = original.versions[0];
  let changed, continued;
  await step('modify with idempotent generation preserving original HTML', async () => {
    const body = { mode: 'demo', prompt: '改成深色主题', projectId: appId, baseVersionId: firstVersion.id, requestId: randomUUID() };
    changed = (await json('owner', '/api/generate', { body })).project;
    assert.equal(changed.versions.length, 2);
    assert.deepEqual(changed.versions.find(v => v.id === firstVersion.id), firstVersion);
    assert.notEqual(changed.currentVersionId, firstVersion.id);
    assert.notEqual(changed.versions.find(v => v.id === changed.currentVersionId).html, firstVersion.html);
    assertVersions((await json('owner', '/api/generate', { body })).project, changed.versions, changed.currentVersionId);
  });
  await step('fresh client reload and declared visitor visibility', async () => {
    cookies.set('reload', cookies.get('owner'));
    assertVersions((await read('reload')).project, changed.versions, changed.currentVersionId);
    if (a.visibility === 'shared') assertVersions((await read('other')).project, changed.versions, changed.currentVersionId);
    else await request('other', path(), { expected: 404 });
  });
  await step('unsupported change 422 and foreign Origin 403 preserve both versions', async () => {
    await request('owner', '/api/generate', { body: { mode: 'demo', prompt: '增加多用户注册', projectId: appId, baseVersionId: changed.currentVersionId, requestId: randomUUID() }, expected: 422 });
    await request('owner', '/api/generate', { body: { mode: 'demo', prompt: '改成蓝色主题', projectId: appId, baseVersionId: changed.currentVersionId, requestId: randomUUID() }, source: 'https://example.invalid', expected: 403 });
    assertVersions((await read('reload')).project, changed.versions, changed.currentVersionId);
  });
  await step('restore retains two immutable HTML versions after reload', async () => {
    assertVersions((await json('owner', path() + '/restore', { body: { versionId: firstVersion.id } })).project, changed.versions, firstVersion.id);
    assertVersions((await read('reload')).project, changed.versions, firstVersion.id);
  });
  await step('continue editing restored version; all three HTML exports readable', async () => {
    continued = (await json('owner', '/api/generate', { body: { mode: 'demo', prompt: '改成蓝色主题', projectId: appId, baseVersionId: firstVersion.id, requestId: randomUUID() } })).project;
    assert.equal(continued.versions.length, 3);
    for (const old of changed.versions) assert.deepEqual(continued.versions.find(v => v.id === old.id), old);
    const current = continued.versions.find(v => v.id === continued.currentVersionId);
    assert.ok(current.html.includes('<!doctype html>')); assert.notEqual(current.html, firstVersion.html);
    assertVersions((await read('reload')).project, continued.versions, continued.currentVersionId);
    report.versions = continued.versions.map(v => ({ id: v.id, number: v.number, mode: v.mode, htmlSha256: digest(v.html), htmlBytes: Buffer.byteLength(v.html) }));
    report.currentVersionId = continued.currentVersionId;
    if (output) {
      const directory = resolve(dirname(output), 'stable-core-html-' + appId);
      await mkdir(directory, { recursive: true });
      report.htmlExports = [];
      for (const version of continued.versions) {
        const file = resolve(directory, `version-${version.number}.html`);
        await writeFile(file, version.html); report.htmlExports.push(file);
      }
    }
  });
  await step('fixed share and publication exact HTML, explicit update and pause', async () => {
    const share = (await json('owner', path() + '/shares', { body: { versionId: firstVersion.id, requestId: randomUUID() }, expected: 201 })).share;
    shareId = share.id;
    const shareApi = '/api/shares/' + share.path.split('/').at(-1);
    assert.equal((await json('anonymous', shareApi)).html, firstVersion.html);
    const body = { action: 'publish', versionId: firstVersion.id, requestId: randomUUID(), expectedRevision: 0 };
    publication = (await json('owner', path() + '/publication', { body, expected: 201 })).publication;
    assert.equal(publication.revision, 1);
    assert.equal((await json('owner', path() + '/publication', { body })).publication.revision, 1);
    const publicApi = '/api/publications/' + publication.path.split('/').at(-1);
    assert.equal((await json('anonymous', publicApi)).html, firstVersion.html);
    const updated = (await json('owner', path() + '/publication', { body: { action: 'publish', versionId: continued.currentVersionId, requestId: randomUUID(), expectedRevision: publication.revision } })).publication;
    assert.equal(updated.path, publication.path); publication = updated;
    assert.equal((await json('anonymous', publicApi)).html, continued.versions.find(v => v.id === continued.currentVersionId).html);
    assert.equal((await json('anonymous', shareApi)).html, firstVersion.html);
    publication = (await json('owner', path() + '/publication', { body: { action: 'unpublish', requestId: randomUUID(), expectedRevision: publication.revision } })).publication;
    await request('anonymous', publicApi, { expected: 404 });
    assert.equal((await json('anonymous', shareApi)).html, firstVersion.html);
  });
  if (a.visibility === 'shared') await step('runtime cross-client persistence and stale revision conflict', async () => {
    const body = { appId, versionId: continued.currentVersionId, key: 'qa.core.' + randomUUID() };
    assert.equal((await json('owner', '/api/runtime-data', { body: { ...body, action: 'get' } })).revision, 0);
    const value = { marker: 'QA core journey', count: 1 };
    assert.equal((await json('owner', '/api/runtime-data', { body: { ...body, action: 'set', value, expectedRevision: 0 } })).revision, 1);
    const other = await json('other', '/api/runtime-data', { body: { ...body, action: 'get' } });
    assert.deepEqual(other.value, value); assert.equal(other.revision, 1);
    await request('other', '/api/runtime-data', { body: { ...body, action: 'set', value: { count: 999 }, expectedRevision: 0 }, expected: 409 });
    const final = await json('reload', '/api/runtime-data', { body: { ...body, action: 'get' } });
    assert.deepEqual(final.value, value); assert.equal(final.revision, 1); report.runtimeRevision = 1;
  });
  else report.runtimeData = 'not tested: SDK requires shared workspace; private visibility verified';
  report.passed = true;
} catch (error) { report.error = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
finally {
  // Only IDs returned by this run's own creation may be cleaned up.
  for (const [name, run] of [
    ['publicationPaused', async () => { if (publication?.enabled) publication = (await json('owner', path() + '/publication', { body: { action: 'unpublish', requestId: randomUUID(), expectedRevision: publication.revision } })).publication; }],
    ['shareRevoked', async () => { if (shareId) await request('owner', path() + '/shares/' + shareId, { method: 'DELETE' }); }],
    ['ownAppArchived', async () => { if (appId) { const workspace = await json('owner', '/api/workspace', { body: { action: 'app.update', appId, archived: true } }); assert.equal(workspace.apps.find(app => app.id === appId)?.archived, true); } }],
  ]) {
    try { await run(); report.cleanup[name] = appId ? 'completed' : 'not needed'; }
    catch (error) { report.cleanup[name] = { failed: true, error: error.message }; report.passed = false; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  if (output) { const target = resolve(output); await mkdir(dirname(target), { recursive: true }); await writeFile(target, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
}
