// Explicit opt-in: two generation rounds (plan + execute each; at most four provider calls), never retried. Uses only the existing app API.
// node tests/model-journey-smoke.mjs --run-two-calls D:/gpt/output/motes/stable-model-http.json
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { applicationArtifact, assertPublishedApplication } from './helpers/application-artifact.mjs';

assert.equal(process.argv[2], '--run-two-calls', 'Explicit --run-two-calls is required');
// Exact canonical URL returned by the existing Site's v22 deployment.
const origin = 'https://motes-yangjunmin.yjm1024.chatgpt.site';
const output = resolve(process.argv[3] || 'outputs/stable-model-http.json');
const marker = 'QA model journey ' + new Date().toISOString();
const report = { passed: false, origin, marker, startedAt: new Date().toISOString(), modelPostLimit: 2, modelPosts: 0, providerCallLimit: 4, modelCallsPerRound: 2, requests: [], checks: [], modelRequests: [], cleanup: {}, browserInteraction: 'NOT TESTED: this script performs HTTP checks only', runtimeSource: 'Not inferred by this script; record the native deployment identity separately.' };
const cookies = new Map();
let appId, publication;
await mkdir(dirname(output), { recursive: true });
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
async function call(client, path, body, expected = 200) {
  if (path === '/api/generate') {
    assert.equal(body.mode, 'model'); assert.ok(report.modelPosts < 2, 'Never exceed two model POSTs');
    report.modelPosts++; report.modelRequests.push({ requestId: body.requestId, operation: body.projectId ? 'modify' : 'generate', status: 'sending' });
    await save();
  }
  const started = performance.now();
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(path === '/api/generate' ? 200000 : 20000),
    headers: { ...(cookies.has(client) ? { Cookie: cookies.get(client) } : {}), ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const cookie = response.headers.get('set-cookie')?.match(/forma_session=[a-f0-9]{64}/)?.[0];
  if (cookie) cookies.set(client, cookie);
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = null; }
  report.requests.push({ method: body ? 'POST' : 'GET', path: path.replace(/(\/api\/publications\/)[^/]+/, '$1[token]'), status: response.status, elapsedMs: Math.round(performance.now() - started), responseRequestId: response.headers.get('x-request-id') });
  if (path === '/api/generate') {
    const item = report.modelRequests.at(-1); item.status = response.status; item.savedAppId = data?.project?.id ?? null;
    if (!appId && data?.project?.id) { appId = data.project.id; report.appId = appId; }
    await save();
  }
  assert.equal(response.status, expected, `${path}: expected ${expected}, got ${response.status}${data?.error ? ': ' + data.error : ''}`);
  return data;
}
const path = () => '/api/projects/' + appId;
const runtime = (client, action, versionId, extra = {}, expected = 200) => call(client, '/api/runtime-data', { action, appId, versionId, key: 'qa.counter.v1', ...extra }, expected);
async function exportVersion(version) {
  const file = resolve(dirname(output), `stable-model-${appId}-v${version.number}.html`);
  const artifact = await applicationArtifact(version.html);
  await writeFile(file, artifact.exportedHtml);
  const { sourceSha256, sourceBytes, renderedHtmlSha256, renderedHtmlBytes, exportedHtmlSha256, exportedHtmlBytes } = artifact;
  (report.versions ??= []).push({ id: version.id, number: version.number, mode: version.mode, model: version.model ?? 'unknown', sourceSha256, sourceBytes, renderedHtmlSha256, renderedHtmlBytes, exportedHtmlSha256, exportedHtmlBytes, file });
  return artifact;
}
try {
  const a = await call('a', '/api/session'), b = await call('b', '/api/session');
  assert.equal(a.visibility, 'shared'); assert.equal(a.workspaceId, b.workspaceId); assert.notEqual(cookies.get('a'), cookies.get('b'));
  assert.equal(a.mode, 'model', 'Existing service must expose a configured model; no key setup is attempted');
  const usageBefore = await call('a', '/api/usage');
  const prompt = `创建一个精简中文计数器，页面title和h1必须为“${marker}”。只需显示计数、加一按钮、保存状态。业务数据必须仅通过window.motes.data SDK持久化，共享key固定qa.counter.v1，值格式{count:number}；await ready，get后使用revision调用set。加载未完成不能保存，冲突或失败须保留输入并显示真实错误。无SDK时显示仅临时预览。界面白底蓝色，390px可用，保持HTML短小。`;
  const first = (await call('a', '/api/generate', { mode: 'model', prompt, requestId: randomUUID() })).project;
  appId = first.id; report.appId = appId;
  // Explicitly mark only the newly returned app, even if model title parsing varies.
  await call('a', '/api/workspace', { action: 'app.update', appId, name: marker });
  assert.equal(first.versions.length, 1); const v1 = first.versions[0]; assert.equal(v1.mode, 'model');
  assert.ok(/motes/.test(v1.html)); assert.ok(v1.html.includes('qa.counter.v1'));
  const artifactV1 = await exportVersion(v1); report.checks.push('model generation returned saved v1 source with requested SDK key; exported compiled standalone HTML (static evidence only)');
  assert.equal((await runtime('a', 'get', v1.id)).revision, 0);
  assert.equal((await runtime('a', 'set', v1.id, { value: { count: 7 }, expectedRevision: 0 })).revision, 1);
  assert.deepEqual((await runtime('b', 'get', v1.id)).value, { count: 7 });
  const second = (await call('a', '/api/generate', { mode: 'model', prompt: '保留完整计数器与qa.counter.v1共享数据结构、SDK读取及revision冲突保护。增加“减一”按钮，主色改为紫色。保持原标题与其余功能；只做局部精确替换补丁，禁止重写整页。', projectId: appId, baseVersionId: v1.id, requestId: randomUUID() })).project;
  assert.equal(second.versions.length, 2); assert.deepEqual(second.versions[0], v1);
  const v2 = second.versions.find(v => v.id === second.currentVersionId); assert.equal(v2.mode, 'model'); assert.notEqual(v2.html, v1.html);
  const artifactV2 = await exportVersion(v2);
  const refreshed = (await call('b', path())).project;
  assert.deepEqual(refreshed.versions, second.versions); assert.equal(refreshed.currentVersionId, v2.id);
  assert.deepEqual((await runtime('b', 'get', v2.id)).value, { count: 7 });
  await runtime('b', 'set', v2.id, { value: { count: 999 }, expectedRevision: 0 }, 409);
  report.checks.push('second generation round (separate plan and patch execution) saved distinct v2; fresh visitor reads both immutable versions and same business data; stale writer rejected');
  const restored = (await call('a', path() + '/restore', { versionId: v1.id })).project;
  assert.equal(restored.currentVersionId, v1.id); assert.deepEqual(restored.versions, second.versions);
  assert.deepEqual((await runtime('b', 'get', v1.id)).value, { count: 7 });
  await call('a', path() + '/restore', { versionId: v2.id });
  report.checks.push('restore v1 and return v2 preserve both HTML versions and shared business data');
  publication = (await call('a', path() + '/publication', { action: 'publish', versionId: v1.id, expectedRevision: 0, requestId: randomUUID() }, 201)).publication;
  const publicApi = '/api/publications/' + publication.path.split('/').at(-1);
  assertPublishedApplication(await call('anonymous', publicApi), artifactV1);
  publication = (await call('a', path() + '/publication', { action: 'publish', versionId: v2.id, expectedRevision: publication.revision, requestId: randomUUID() })).publication;
  assertPublishedApplication(await call('anonymous', publicApi), artifactV2);
  report.checks.push('publication receipts and anonymous exact compiled HTML for pinned v1 then explicit v2 update');
  const usageAfter = await call('a', '/api/usage');
  assert.equal(usageAfter.tokens.recordedCalls - usageBefore.tokens.recordedCalls, 4, 'Two rounds each make separate planning and execution calls');
  report.providerCallsObserved = usageAfter.tokens.recordedCalls - usageBefore.tokens.recordedCalls;
  report.checks.push('usage records four provider calls across two generation rounds; no automatic retries');
  report.passed = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  // Failed or ambiguous model POSTs are never reissued. Only read their receipt.
  for (const item of report.modelRequests) {
    try { const state = await call('a', '/api/requests/' + item.requestId); item.receipt = { status: state.status, projectId: state.projectId ?? null, resultVersionId: state.resultVersionId ?? null, progress: state.progress ?? null }; if (state.status === 'done') assert.ok(state.progress?.steps?.every(step => step.state === 'completed'), 'Saved workflow receipt has all real phases completed'); if (!appId && state.projectId) { appId = state.projectId; report.appId = appId; } }
    catch (error) { item.receiptError = error.message; }
  }
  try { const usage = await call('a', '/api/usage'); report.usage = report.modelRequests.map(r => usage.items.find(item => item.requestId === r.requestId) ?? { requestId: r.requestId, usage: 'unknown' }); }
  catch { report.usage = 'unknown: usage endpoint unavailable'; }
  for (const [name, cleanup] of [
    ['publicationPaused', async () => { if (publication?.enabled) { publication = (await call('a', path() + '/publication', { action: 'unpublish', expectedRevision: publication.revision, requestId: randomUUID() })).publication; assert.equal(publication.enabled, false); const publicApi = '/api/publications/' + publication.path.split('/').at(-1); await call('anonymous', publicApi, undefined, 404); } }],
    ['ownAppArchived', async () => { if (appId) { const snapshot = await call('a', '/api/workspace', { action: 'app.update', appId, archived: true }); assert.equal(snapshot.apps.find(a => a.id === appId)?.archived, true); } }],
  ]) {
    try { await cleanup(); report.cleanup[name] = appId ? 'completed' : 'not needed'; }
    catch (error) { report.cleanup[name] = error.message; report.passed = false; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString(); await save(); console.log(JSON.stringify(report, null, 2));
}
