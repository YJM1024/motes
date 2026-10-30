import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/motes/publication-client.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('reuses an id only for the exact same publication request body', () => {
  let sequence = 0;
  const id = () => `request-${++sequence}`;
  const publish = { action: 'publish', versionId: 'v1', expectedRevision: 0 };
  const first = mod.publicationRequestId(null, publish, id);
  assert.equal(mod.publicationRequestId(first, publish, id).requestId, first.requestId);
  assert.notEqual(mod.publicationRequestId(first, { ...publish, versionId: 'v2' }, id).requestId, first.requestId);
  assert.notEqual(mod.publicationRequestId(first, { ...publish, expectedRevision: 1 }, id).requestId, first.requestId);
  assert.notEqual(mod.publicationRequestId(first, { action: 'unpublish', expectedRevision: 0 }, id).requestId, first.requestId);
});

test('publication links stay same-origin and reject unsafe or external paths', () => {
  assert.equal(mod.publicationUrl('/publish/abc', 'https://motes.example'), 'https://motes.example/publish/abc');
  assert.throws(() => mod.publicationUrl('//evil.example/x', 'https://motes.example'));
  assert.throws(() => mod.publicationUrl('javascript:alert(1)', 'https://motes.example'));
  assert.throws(() => mod.publicationUrl('https://evil.example/x', 'https://motes.example'));
});
