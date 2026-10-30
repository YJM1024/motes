import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const cache = new Map();
async function moduleUrl(name) {
  if (cache.has(name)) return cache.get(name);
  let source = await readFile(new URL('../lib/motes/' + name + '.ts', import.meta.url), 'utf8');
  for (const match of [...source.matchAll(/from\s+(['"])\.\/([^'"]+)\1/g)]) source = source.replaceAll(match[1] + './' + match[2] + match[1], JSON.stringify(await moduleUrl(match[2])));
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); cache.set(name, url); return url;
}
const { RUNTIME_PROTOCOL, diagnosticFromEvent, diagnosticCollector, runtimeRepairRequest, DIAGNOSTIC_LIMITS } = await import(await moduleUrl('runtime-diagnostics'));
const { runtimeBridgeScript } = await import(await moduleUrl('runtime-preview'));
const channel = 'a'.repeat(32), frame = {};
function event(patch = {}, source = frame) { return { source, origin: 'null', data: { protocol: RUNTIME_PROTOCOL, channel, kind: 'error', errorType: 'ReferenceError', line: 12, column: 4, ...patch } }; }

test('only the currently referenced opaque iframe, protocol and random channel are accepted', () => {
  assert.deepEqual(diagnosticFromEvent(event(), frame, channel), { kind: 'error', errorType: 'ReferenceError', line: 12, column: 4 });
  assert.equal(diagnosticFromEvent(event({}, {}), frame, channel), null);
  assert.equal(diagnosticFromEvent(event(), null, channel), null);
  assert.equal(diagnosticFromEvent({ ...event(), origin: 'https://foreign.test' }, frame, channel), null);
  assert.equal(diagnosticFromEvent(event({ protocol: 'other' }), frame, channel), null);
  assert.equal(diagnosticFromEvent(event({ channel: 'b'.repeat(32) }), frame, channel), null);
  assert.equal(diagnosticFromEvent(event(), frame, 'not-random'), null);
});
test('strict schema drops arbitrary error text, stacks, inputs, long strings and invalid positions', () => {
  for (const patch of [{ message: 'PRIVATE INPUT' }, { stack: 'PRIVATE STACK' }, { errorType: 'SECRET'.repeat(100) }, { kind: ['error'] }, { line: -1 }, { line: 0.2 }, { column: 1000001 }, { column: '4' }, { errorType: 'UnhandledRejection' }, { errorType: 'unknown' }]) assert.equal(diagnosticFromEvent(event(patch), frame, channel), null);
  for (const data of [null, [], 'payload', { protocol: RUNTIME_PROTOCOL }]) assert.equal(diagnosticFromEvent({ ...event(), data }, frame, channel), null);
});
test('parent independently merges duplicates and enforces burst and lifetime caps', () => {
  const collector = diagnosticCollector(channel);
  assert.ok(collector.accept(event(), frame, 2000)); assert.equal(collector.accept(event(), frame, 2001), null);
  assert.ok(collector.accept(event({ line: 13 }), frame, 2002)); assert.ok(collector.accept(event({ line: 14 }), frame, 2003)); assert.equal(collector.accept(event({ line: 15 }), frame, 2004), null);
  let total = 3;
  for (let i = 0; i < 20; i++) if (collector.accept(event({ line: 30 + i }), frame, 4000 + i * 1500)) total++;
  assert.equal(total, DIAGNOSTIC_LIMITS.total); assert.equal(collector.accept(event({ line: 999 }), frame, 999999), null);
  assert.equal(diagnosticCollector(channel).accept(event(), frame, NaN), null);
});
function bridge() {
  const callbacks = {}, posts = []; let now = 2000;
  class FakeErrorEvent { constructor(error, lineno = 1, colno = 2) { this.error = error; this.lineno = lineno; this.colno = colno; } }
  const context = { window: { parent: { postMessage: (data, target) => posts.push({ data, target }) }, addEventListener: (kind, callback) => { callbacks[kind] = callback; } }, Error, ErrorEvent: FakeErrorEvent, Date: { now: () => now } };
  runInNewContext(runtimeBridgeScript(channel, 'https://motes.test'), context);
  return { callbacks, posts, FakeErrorEvent, advance: amount => { now += amount; } };
}
test('the actual injected script collects only whitelisted type and bounded positions, never error values', () => {
  const b = bridge(); b.callbacks.error(new b.FakeErrorEvent(new TypeError('PRIVATE INPUT AND API KEY'), 4000000.2, -4));
  b.callbacks.unhandledrejection({ reason: 'PRIVATE REJECTION' }); b.callbacks.unhandledrejection({ reason: new Error('PRIVATE ERROR') });
  const serialized = JSON.stringify(b.posts); assert.doesNotMatch(serialized, /PRIVATE|KEY|message|stack/);
  assert.equal(b.posts[0].data.errorType, 'TypeError'); assert.equal(b.posts[0].data.line, 1000000); assert.equal(b.posts[0].data.column, 0);
  assert.equal(b.posts[1].data.errorType, 'UnhandledRejection'); assert.ok(b.posts.every(p => p.target === 'https://motes.test'));
  assert.equal(Object.keys(b.posts[0].data).length, 6);
});
test('the injected script rate-limits before posting and arbitrary same-frame custom error names are omitted', () => {
  const b = bridge(); const custom = new Error('PRIVATE'); custom.name = 'PRIVATE CUSTOM TYPE';
  b.callbacks.error(new b.FakeErrorEvent(custom)); assert.equal(b.posts[0].data.errorType, 'Error');
  for (let i = 0; i < 20; i++) b.callbacks.error(new b.FakeErrorEvent(new Error('PRIVATE')));
  assert.equal(b.posts.length, 3);
  for (let i = 0; i < 20; i++) { b.advance(1500); b.callbacks.error(new b.FakeErrorEvent(new Error('PRIVATE'))); }
  assert.equal(b.posts.length, 10);
  assert.throws(() => runtimeBridgeScript('bad', 'https://motes.test'));
  assert.throws(() => runtimeBridgeScript(channel, '*'));
  assert.throws(() => runtimeBridgeScript(channel, 'https://motes.test/path'));
});
test('repair request construction is bounded and contains no arbitrary log strings or hidden action', () => {
  const values = Array.from({ length: 20 }, (_, i) => ({ kind: 'error', errorType: 'TypeError', line: i + 1, column: 2, message: 'PRIVATE' }));
  const text = runtimeRepairRequest(values); assert.equal((text.match(/JavaScript 运行错误/g) || []).length, DIAGNOSTIC_LIMITS.repairEntries); assert.doesNotMatch(text, /PRIVATE/); assert.ok(text.length < 4000); assert.match(text, /保留与修复无关/); assert.match(text, /放宽预览安全约束/);
  assert.throws(() => runtimeRepairRequest([]));
  assert.throws(() => runtimeRepairRequest([{ kind: 'error', errorType: 'PRIVATE', line: 1, column: 2 }]));
});
