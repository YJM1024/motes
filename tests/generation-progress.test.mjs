import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../app/lite/useGenerationProgress.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const requestId = 'request-a';
const progress = (state = 'pending') => ({ requestId, updatedAt: '2026-11-06T00:00:00.000Z', steps: ['plan', 'execute', 'check', 'save'].map((id, index) => ({ id, state: index === 1 ? state : 'pending' })) });

test('serial polling drops a late response after cancellation and does not depend on busy state', async () => {
  const controller = new AbortController(); let calls = 0, active = 0, maxActive = 0, emitted = 0;
  const query = async () => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await Promise.resolve(); active--;
    return { requestId, status: 'running', progress: progress('running') };
  };
  await mod.pollGenerationProgress(requestId, controller.signal, query, () => { emitted++; }, async () => {
    if (calls === 2) controller.abort();
  });
  assert.equal(calls, 2);
  assert.equal(maxActive, 1);
  assert.equal(emitted, 2);
});

test('read errors stay unknown; only validated server progress can mark a step failed', async () => {
  const controller = new AbortController(); let calls = 0; const emitted = [];
  await mod.pollGenerationProgress(requestId, controller.signal, async () => {
    calls++;
    if (calls === 1) throw new Error('temporary network error');
    return { requestId, status: 'failed', progress: progress('failed') };
  }, value => emitted.push(value), async () => {});
  assert.equal(calls, 2);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].steps[1].state, 'failed');
});

test('wrong request IDs and incomplete step sets are rejected', () => {
  assert.equal(mod.isGenerationProgress(progress(), requestId), true);
  assert.equal(mod.isGenerationProgress({ ...progress(), requestId: 'other' }, requestId), false);
  assert.equal(mod.isGenerationProgress({ ...progress(), steps: progress().steps.slice(1) }, requestId), false);
});

test('an initial 404 can precede real plan, execution and completion progress', async () => {
  const controller = new AbortController(), emitted = [];
  const phase = (active) => ({ ...progress(), steps: ['plan', 'execute', 'check', 'save'].map((id, index) => ({ id, state: active === 'done' || index < active ? 'completed' : index === active ? 'running' : 'pending' })) });
  const replies = [
    { requestId, status: 'not-found' },
    { requestId, status: 'running', progress: phase(0) },
    { requestId, status: 'running', progress: phase(1) },
    { requestId, status: 'done', progress: phase('done') },
  ];
  let reads = 0, waits = 0;
  await mod.pollGenerationProgress(requestId, controller.signal, async () => {
    assert.ok(reads < replies.length, 'No reads after a confirmed terminal state');
    return replies[reads++];
  }, value => emitted.push(value), async () => { waits++; });
  assert.equal(reads, 4); assert.equal(waits, 3);
  assert.equal(emitted.length, 3);
  assert.equal(emitted[0].steps[0].state, 'running');
  assert.equal(emitted[1].steps[1].state, 'running');
  assert.ok(emitted[2].steps.every(step => step.state === 'completed'));
});

test('missing receipts have bounded retries and disappearances after acceptance are terminal', async () => {
  let reads = 0;
  await mod.pollGenerationProgress(requestId, new AbortController().signal, async () => {
    reads++; return { requestId, status: 'not-found' };
  }, () => assert.fail('Missing receipts must not fabricate progress'), async () => {});
  assert.equal(reads, 15);
  reads = 0;
  await mod.pollGenerationProgress(requestId, new AbortController().signal, async () => {
    reads++; return { requestId, status: reads === 1 ? 'running' : 'not-found' };
  }, () => {}, async () => {});
  assert.equal(reads, 2);
});

test('polling stops at the shared lease bound without changing the request', async t => {
  let now = 0, reads = 0;
  t.mock.method(Date, 'now', () => now);
  await mod.pollGenerationProgress(requestId, new AbortController().signal, async () => {
    reads++; return { requestId, status: 'running' };
  }, () => {}, async () => { now += 210000; });
  assert.equal(reads, 1);
});
