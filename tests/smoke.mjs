import assert from 'node:assert/strict';

const origin = process.argv[2] || 'http://127.0.0.1:5173';
async function session() {
  const response = await fetch(`${origin}/api/session`);
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'A new visitor receives a session cookie');
  return { cookie, data: await response.json() };
}
const a = await session();
const b = await session();
async function request(path, body, cookie = a.cookie, source = origin) {
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json', Origin: source } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
  return { status: response.status, data };
}
const initial = { mode: 'demo', prompt: '旅行预算计算器', requestId: crypto.randomUUID() };
const first = await request('/api/generate', initial);
assert.equal(first.status, 200, JSON.stringify(first.data));
const project = first.data.project;
assert.equal(project.versions.length, 1);
assert.equal(project.versions[0].mode, 'demo');
const read = await request(`/api/projects/${project.id}`);
assert.equal(read.data.project.currentVersionId, project.currentVersionId);
const duplicate = await request('/api/generate', initial);
assert.equal(duplicate.data.project.versions.length, 1, 'Retry must not create another version');
const change = await request('/api/generate', { ...initial, prompt: '改为深色', projectId: project.id, baseVersionId: project.currentVersionId, requestId: crypto.randomUUID() });
assert.equal(change.status, 200, JSON.stringify(change.data));
assert.equal(change.data.project.versions.length, 2);
const restore = await request(`/api/projects/${project.id}/restore`, { versionId: project.currentVersionId });
assert.equal(restore.status, 200, JSON.stringify(restore.data));
assert.equal(restore.data.project.currentVersionId, project.currentVersionId);
assert.equal(restore.data.project.versions.length, 2, 'Restore preserves history');
assert.equal((await request(`/api/projects/${project.id}`, undefined, b.cookie)).status, 404, 'Visitors cannot read each other projects');
assert.equal((await request('/api/generate', { ...initial, requestId: crypto.randomUUID() }, a.cookie, 'https://example.invalid')).status, 403);
const unsupported = await request('/api/generate', { ...initial, prompt: '增加多用户注册', projectId: project.id, requestId: crypto.randomUUID() });
assert.equal(unsupported.status, 422);
assert.equal((await request(`/api/projects/${project.id}`)).data.project.versions.length, 2, 'Failure preserves versions');
if (a.data.mode === 'demo') assert.equal((await request('/api/generate', { ...initial, mode: 'model', requestId: crypto.randomUUID() })).status, 503);
console.log(JSON.stringify({ passed: true, origin, checks: ['create', 'read after refresh', 'idempotent retry', 'modify', 'restore preserving history', 'visitor isolation', 'origin protection', 'honest demo boundaries', 'failed generation preservation'], projectId: project.id }));
