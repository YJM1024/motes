import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./workspace-backup-panel.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('export query keeps project and app scopes mutually exclusive and preserves repeated app IDs', () => {
  const sections = { discussions: true, promptTemplates: false, appTemplates: true, settings: false, versionConfigs: true };
  const params = new URLSearchParams(mod.buildWorkspaceBackupQuery({ kind: 'apps', appIds: ['a', 'b'] }, sections));
  assert.deepEqual(params.getAll('appId'), ['a', 'b']);
  assert.equal(params.has('projectId'), false);
  assert.equal(params.get('promptTemplates'), 'false');
  assert.equal(params.get('appTemplates'), 'true');
});

test('invalid scopes are rejected before any request', () => {
  assert.throws(() => mod.buildWorkspaceBackupQuery({ kind: 'apps', appIds: [] }, { discussions: true, promptTemplates: true, appTemplates: true, settings: true, versionConfigs: true }), /1–10/);
  assert.throws(() => mod.buildWorkspaceBackupQuery({ kind: 'apps', appIds: Array.from({ length: 11 }, (_, index) => String(index)) }, { discussions: true, promptTemplates: true, appTemplates: true, settings: true, versionConfigs: true }), /1–10/);
  assert.throws(() => mod.buildWorkspaceBackupQuery({ kind: 'project', projectId: '' }, { discussions: true, promptTemplates: true, appTemplates: true, settings: true, versionConfigs: true }), /项目/);
});

test('same preview hash reuses its import ID while changed backup content creates a new ID', () => {
  const first = mod.stableWorkspaceBackupRequest(null, 'hash-a', () => 'request-1');
  assert.deepEqual(mod.stableWorkspaceBackupRequest(first, 'hash-a', () => 'request-2'), first);
  assert.deepEqual(mod.stableWorkspaceBackupRequest(first, 'hash-b', () => 'request-3'), { fingerprint: '["workspace-backup-import","hash-b"]', requestId: 'request-3' });
});

test('legacy v1 app backups are identified for the original import entry', () => {
  assert.equal(mod.isLegacyAppBackup({ format: 'motes-backup', version: 1 }), true);
  assert.equal(mod.isLegacyAppBackup({ format: 'motes-workspace-backup', version: 2 }), false);
});
