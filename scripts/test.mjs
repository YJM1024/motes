#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Run the current application and backend regression suites.
const roots = [
  { directory: 'tests', required: true },
  { directory: 'lib/motes', required: false },
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
  // Bound file workers while preserving race/concurrency assertions inside tests.
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
