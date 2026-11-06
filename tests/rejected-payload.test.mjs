import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowHarness } from './helpers/workflow-harness.mjs';

const request = (body, origin = 'https://foreign.invalid', headers = {}) => new Request('https://motes.test/api/generate', {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body, duplex: 'half',
});

test('early Origin and declared-size rejections drain small bodies and retain their original status', async t => {
  const h = await workflowHarness();t.after(h.close);
  for (const [origin, headers, status] of [['https://foreign.invalid', {}, 403], ['https://motes.test', { 'content-length': '16001' }, 413]]) {
    let canceled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"prompt":"untrusted"}'));controller.close(); }, cancel() { canceled = true; } });
    const incoming = request(stream, origin, headers);
    await assert.rejects(h.server.payload(incoming), error => error.status === status);
    assert.equal(incoming.bodyUsed, true);assert.equal(incoming.body.locked, false);assert.equal(canceled, false);
  }
  let canceled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"prompt":"valid"}'));controller.close(); }, cancel() { canceled = true; } });
  assert.deepEqual(await h.server.payload(request(body, 'https://motes.test')), { prompt: 'valid' });
  assert.equal(canceled, false);
});

test('rejected-body draining stops at its byte budget and cannot wait on a never-ending stream or cancellation', async t => {
  const h = await workflowHarness();t.after(h.close);
  let pulls = 0, canceled = false;
  const oversized = new ReadableStream({ pull(controller) { pulls++;controller.enqueue(new Uint8Array(8192)); }, cancel() { canceled = true;return Promise.reject(new Error('cancel failed')); } });
  await assert.rejects(h.server.payload(request(oversized)), error => error.status === 403);
  assert.equal(canceled, true);assert.ok(pulls <= 3, 'At most two read chunks plus stream prefetch; never consume the remaining body');
  let timeoutCanceled = false;
  const endless = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { timeoutCanceled = true;return new Promise(() => {}); } });
  const incoming = request(endless), started = performance.now();
  await assert.rejects(h.server.payload(incoming), error => error.status === 403);
  assert.ok(performance.now() - started < 1500, 'The 500ms budget also bounds an unresolved cancellation');
  assert.equal(timeoutCanceled, true);assert.equal(incoming.body.locked, false);
});

test('failed or locked rejected streams cannot replace a 403 with an internal error', async t => {
  const h = await workflowHarness();t.after(h.close);
  const failed = new ReadableStream({ start(controller) { controller.error(new Error('incoming stream failed')); } });
  await assert.rejects(h.server.payload(request(failed)), error => error.status === 403);
  const incoming = request(new ReadableStream()), reader = incoming.body.getReader();
  try { await assert.rejects(h.server.payload(incoming), error => error.status === 403); }
  finally { await reader.cancel();reader.releaseLock(); }
});
