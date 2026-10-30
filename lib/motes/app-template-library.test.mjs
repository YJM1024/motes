import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./app-template-library.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('an identical retried mutation retains its request ID', () => {
  const fingerprint = mod.appTemplateRequestFingerprint('/api/app-templates', { action: 'create', name: 'A' });
  const first = mod.stableAppTemplateRequestId(null, fingerprint, () => 'request-1');
  assert.deepEqual(mod.stableAppTemplateRequestId(first, fingerprint, () => 'request-2'), first);
});

test('editing the body or changing the endpoint starts a distinct mutation ID', () => {
  const first = { fingerprint: mod.appTemplateRequestFingerprint('/api/app-templates', { action: 'create', name: 'A' }), requestId: 'request-1' };
  const edited = mod.appTemplateRequestFingerprint('/api/app-templates', { action: 'create', name: 'B' });
  assert.deepEqual(mod.stableAppTemplateRequestId(first, edited, () => 'request-2'), { fingerprint: edited, requestId: 'request-2' });
});
