#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['tests', 'lib/motes', 'app/manage'];
const files = [];

for (const directory of roots) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      files.push(join(root, directory, entry.name));
    }
  }
}

files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
if (files.length === 0) {
  console.error('No test files found in tests, lib/motes, or app/manage.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
