import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeLocalDb, prepareLocalDb } from "../scripts/init-local-db.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "motes-local-db-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "dist", "server"), { recursive: true });
  await mkdir(path.join(root, "drizzle", "meta"), { recursive: true });
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "wrangler", "bin"), { recursive: true });
  await writeFile(path.join(root, "dist", "server", "wrangler.json"), JSON.stringify({
    d1_databases: [{ binding: "DB", database_name: "test-db" }],
  }));
  await writeFile(path.join(root, "scripts", "sites-env.mjs"), "");
  await writeFile(path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"), "");
  return root;
}

test("prepares sorted local migrations and ignores Drizzle metadata", async t => {
  const root = await fixture(t);
  const drizzle = path.join(root, "drizzle");
  await writeFile(path.join(drizzle, "0002_last.sql"), "SELECT 2;");
  await writeFile(path.join(drizzle, "0001_first.sql"), "SELECT 1;");
  await writeFile(path.join(drizzle, "meta", "journal.json"), "{}");

  const plan = await prepareLocalDb(root);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan.map(step => path.basename(step.args.at(-1))), ["0001_first.sql", "0002_last.sql"]);
  for (const step of plan) {
    assert.ok(step.args.includes("--local"));
    assert.ok(!step.args.includes("--remote"));
    assert.ok(step.args.includes("DB"));
  }
});

test("refuses to initialize when any SQLite file is already in local state", async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, "drizzle", "0001_first.sql"), "SELECT 1;");
  const state = path.join(root, ".wrangler", "state", "v3", "d1");
  await mkdir(state, { recursive: true });
  await writeFile(path.join(state, "database.bin"), Buffer.from("SQLite format 3\0existing"));

  await assert.rejects(prepareLocalDb(root), /已有 SQLite 数据库/);
});

test("validates the whole plan before invoking the runner", async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, "drizzle", "0001_first.sql"), "SELECT 1;");
  await writeFile(path.join(root, "drizzle", "0002_second.sql"), "SELECT 2;");
  const calls = [];
  await initializeLocalDb(root, (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.args.includes("--local") && !call.args.includes("--remote")));
});

test("Node can preload the planned absolute Windows-compatible file URL", async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, "drizzle", "0001_first.sql"), "SELECT 1;");
  await writeFile(path.join(root, "scripts", "sites-env.mjs"), "process.env.MOTES_TEST_IMPORT = 'loaded';\n");
  const [step] = await prepareLocalDb(root);
  const importIndex = step.args.indexOf("--import");
  const importUrl = step.args[importIndex + 1];

  assert.match(importUrl, /^file:/);
  const result = spawnSync(process.execPath, [
    "--import", importUrl,
    "-e", "process.stdout.write(process.env.MOTES_TEST_IMPORT || 'missing')",
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "loaded");
});
