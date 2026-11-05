import assert from 'node:assert/strict';
import { requirePrivateWorkspace } from './http-smoke-helpers.mjs';
const origin = process.argv[2] || 'http://127.0.0.1:5173';
await requirePrivateWorkspace(origin);
async function visitor() { const r = await fetch(origin + '/api/session', { signal: AbortSignal.timeout(15000) }); assert.equal(r.status, 200); const cookie = r.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie); return cookie; }
const cookie = await visitor(), other = await visitor();
const requests = [];
async function call(path, body, token = cookie, source = origin) {
  const started = performance.now();
  const r = await fetch(origin + path, { signal: AbortSignal.timeout(15000), headers: { Connection: 'close', Cookie: token, ...(body ? { Origin: source, 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
  requests.push({ method: body ? 'POST' : 'GET', path: path.split('?')[0], status: r.status, elapsedMs: Math.round(performance.now() - started), format: r.headers.get('content-type')?.includes('json') ? 'json' : 'text' });
  return { status: r.status, data };
}
const page = await fetch(origin + '/settings', { signal: AbortSignal.timeout(15000) }); assert.equal(page.status, 200); await page.text();
const before = await call('/api/settings'); assert.equal(before.status, 200);
const saved = await call('/api/settings', { scope: 'workspace', patch: { creationMode: 'demo', previewDevice: 'mobile', autoFollow: false, showWaitTimer: false, language: 'en' } });
assert.equal(saved.status, 200); assert.equal(saved.data.effective.previewDevice, 'mobile'); assert.equal(saved.data.sources.previewDevice, 'workspace');
assert.equal((await call('/api/settings')).data.effective.showWaitTimer, false);
assert.equal((await call('/api/settings', undefined, other)).data.effective.previewDevice, 'desktop');
const group = await call('/api/workspace', { action: 'project.create', name: 'Settings smoke' }); assert.equal(group.status, 200);
const projectId = group.data.projects.find(p => p.name === 'Settings smoke').id;
assert.equal((await call('/api/settings', { scope: 'project', projectId, patch: { visualStyle: 'soft' } })).status, 200);
const generated = await call('/api/generate', { mode: 'demo', prompt: '旅行预算计算器', requestId: crypto.randomUUID() }); assert.equal(generated.status, 200);
const appId = generated.data.project.id;
await call('/api/workspace');
assert.equal((await call('/api/workspace', { action: 'app.update', appId, projectId })).status, 200);
const inherited = await call('/api/settings?appId=' + appId); assert.equal(inherited.data.effective.visualStyle, 'soft'); assert.equal(inherited.data.sources.visualStyle, 'project');
const overridden = await call('/api/settings', { scope: 'app', appId, patch: { previewDevice: 'desktop' } }); assert.equal(overridden.data.sources.previewDevice, 'app');
const reset = await call('/api/settings', { scope: 'app', appId, patch: { previewDevice: null } }); assert.equal(reset.data.effective.previewDevice, 'mobile'); assert.equal(reset.data.sources.previewDevice, 'workspace');
assert.equal((await call('/api/settings?appId=' + appId, undefined, other)).status, 404);
assert.equal((await call('/api/settings', { scope: 'workspace', patch: { timeout: 999 } })).status, 400);
assert.equal((await call('/api/settings', { scope: 'workspace', patch: { language: 'en' } }, cookie, 'https://invalid.example')).status, 403);
assert.equal((await call('/api/workspace?archived=all')).data.apps.find(a => a.id === appId).currentVersionId, generated.data.project.currentVersionId);
console.log(JSON.stringify({ passed: true, origin, timeoutMs: 15000, modelCalls: 0, requests, checks: ['settings page', 'save and reload', 'visitor isolation', 'project inheritance', 'app override and reset', 'foreign app rejected', 'unknown safety field rejected', 'origin protection', 'current version pointer unchanged'] }, null, 2));
