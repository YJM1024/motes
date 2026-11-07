import { access, open, readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");
const WRANGLER = ["node_modules", "wrangler", "bin", "wrangler.js"];

async function sqliteFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const found = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await sqliteFiles(fullPath));
    } else if (entry.isFile()) {
      const nameLooksLikeSqlite = /(?:\.sqlite(?:3)?(?:-.*)?|\.db)$/i.test(entry.name);
      if (nameLooksLikeSqlite) {
        found.push(fullPath);
        continue;
      }
      const handle = await open(fullPath, "r");
      try {
        const header = Buffer.alloc(SQLITE_HEADER.length);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (bytesRead === SQLITE_HEADER.length && header.equals(SQLITE_HEADER)) found.push(fullPath);
      } finally {
        await handle.close();
      }
    }
  }
  return found;
}

export async function prepareLocalDb(root) {
  const projectRoot = path.resolve(root);
  const configPath = path.join(projectRoot, "dist", "server", "wrangler.json");
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("请先运行 npm run build，生成 dist/server/wrangler.json。");
    throw new Error(`无法读取本地 Wrangler 配置：${error.message}`);
  }
  const databases = config.d1_databases;
  if (!Array.isArray(databases) || databases.length !== 1 || databases[0]?.binding !== "DB" || databases[0]?.remote === true || config.remote === true) {
    throw new Error("本地初始化要求构建配置中只有一个 D1 数据库绑定 DB；已停止。");
  }

  const drizzleRoot = path.join(projectRoot, "drizzle");
  const entries = await readdir(drizzleRoot, { withFileTypes: true });
  const migrations = entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
    .map(entry => entry.name)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (migrations.length === 0) throw new Error("drizzle/ 中没有可应用的顶层 SQL 迁移。");

  const envLoader = path.join(projectRoot, "scripts", "sites-env.mjs");
  const wranglerPath = path.join(projectRoot, ...WRANGLER);
  const migrationPaths = migrations.map(name => path.join(drizzleRoot, name));
  for (const requiredPath of [envLoader, wranglerPath, ...migrationPaths]) {
    await access(requiredPath);
  }

  const stateRoot = path.join(projectRoot, ".wrangler", "state");
  const existing = await sqliteFiles(stateRoot);
  if (existing.length > 0) {
    throw new Error("检测到 .wrangler/state 中已有 SQLite 数据库。为避免重放迁移或影响旧库，已拒绝 fresh 初始化；请按 README.md 的已有库说明处理。");
  }

  return migrations.map(name => ({
    command: process.execPath,
    args: [
      "--import", pathToFileURL(envLoader).href,
      wranglerPath, "d1", "execute", "DB", "--local",
      "--config", configPath,
      "--persist-to", stateRoot,
      "--file", path.join(drizzleRoot, name),
    ],
    cwd: projectRoot,
  }));
}

export async function initializeLocalDb(root, run = (command, args, options) => spawnSync(command, args, {
  ...options,
  stdio: "inherit",
  windowsHide: true,
})) {
  const plan = await prepareLocalDb(root);
  for (const step of plan) {
    const result = run(step.command, step.args, { cwd: step.cwd });
    if (result?.error) throw result.error;
    if (result?.status !== 0) throw new Error(`本地 D1 迁移失败，退出状态：${result?.status ?? "未知"}。后续迁移已停止。`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error("db:init:local 不接受额外参数。");
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  await initializeLocalDb(projectRoot);
  console.log("本地 D1 全新初始化完成。");
}
