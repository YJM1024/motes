#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Lite requires its main suite and keeps backend/domain tests; pure management
// filter tests remain in scope even though the manage UI is absent.
const roots = [
  { directory: 'tests', required: true },
  { directory: 'lib/motes', required: false },
  { directory: 'app/manage', required: false },
];
const files = [];

for (const { directory, required } of roots) {
  let entries;
  try {
    entries = await readdir(join(root, directory), { withFileTypes: true });
  } catch (error) {
    if (!required && error?.code === 'ENOENT') continue;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      files.push(join(root, directory, entry.name));
    }
  }
}

files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
if (files.length === 0) {
  console.error('No test files found in the required tests root or available shared test roots.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files], {
  // 62 files × Node's default 15 workers exceeded this environment's
  // available memory. Limit file workers while preserving concurrency inside
  // each test (Promise races, locks, idempotency and CAS assertions).
  // The same fixed limit keeps local and CI runs resource-predictable.
  // Node's test-runner file concurrency is supported by the project's Node 22+ baseline.
  // Keep concurrency explicit instead of inheriting the host's CPU count.
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
