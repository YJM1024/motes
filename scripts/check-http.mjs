import { access, mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import path from 'node:path';

export function workerOrigin(output) {
  const match = stripVTControlCharacters(output).match(/(?:Ready on|Local:)\s*(http:\/\/127\.0\.0\.1:(\d+))(?=[\s/])/);
  return match && Number(match[2]) > 0 && Number(match[2]) <= 65535 ? match[1] : null;
}

function ownedProcess(args, cwd, stdio) {
  const child = spawn(process.execPath, args, { cwd, windowsHide: true, detached: process.platform !== 'win32', stdio });
  const done = new Promise(resolve => {
    let error;
    child.once('error', value => { error = value; });
    child.once('close', (code, signal) => resolve({ code, signal, error }));
  });
  return { child, done };
}

async function stopOwned({ child, done } = {}) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    // Only this invocation's own PID tree, never all Node/Wrangler processes.
    const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
    if ((result.error || result.status !== 0) && child.exitCode === null && child.signalCode === null) throw new Error(`Could not stop owned verification process tree (PID ${child.pid}); taskkill failed.`);
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await bounded(done, 3000, 'Process shutdown timed out').catch(() => {});
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  await bounded(done, 10000, 'Owned HTTP verification process did not stop');
}

function bounded(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function readyOrigin(worker, signal) {
  return new Promise((resolve, reject) => {
    let output = '';
    const cleanup = () => { worker.child.stdout.off('data', data); signal.removeEventListener('abort', aborted); };
    const finish = (error, origin) => { cleanup(); if (error) reject(error); else resolve(origin); };
    const data = chunk => {
      output = (output + chunk.toString()).slice(-16384);
      const origin = workerOrigin(output);
      if (origin) finish(null, origin);
    };
    const aborted = () => finish(signal.reason);
    worker.child.stdout.on('data', data);
    signal.addEventListener('abort', aborted, { once: true });
    worker.done.then(result => finish(new Error('Built Worker stopped before ready' + (result.error ? ': ' + result.error.message : ` (exit ${result.code})`))));
  });
}

/** Existing built Worker + initialized local D1 only; the smoke uses demo APIs. */
export async function verifyHttp({ root = fileURLToPath(new URL('../', import.meta.url)), startupTimeoutMs = 120000, smokeTimeoutMs = 180000 } = {}) {
  root = path.resolve(root);
  const config = path.join(root, 'dist', 'server', 'wrangler.json');
  const loader = path.join(root, 'scripts', 'sites-env.mjs');
  const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const smokeFile = path.join(root, 'tests', 'smoke.mjs');
  const state = path.join(root, '.wrangler', 'state');
  const envFile = path.join(root, '.dev.vars');
  let envArgs = [];
  try { await access(envFile);envArgs = ['--env-file', envFile]; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const required of [config, loader, wrangler, smokeFile, state]) {
    try { await access(required); } catch { throw new Error('Run npm run build and npm run db:init:local before npm run verify:http.'); }
  }
  const reports = path.join(root, 'outputs');
  await mkdir(reports, { recursive: true });
  const report = path.join(reports, `verify-http-${Date.now()}-${process.pid}.json`);
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('HTTP verification interrupted'));
  process.once('SIGINT', interrupt);process.once('SIGTERM', interrupt);
  const interrupted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
  interrupted.catch(() => {});
  let worker, smoke;
  try {
    worker = ownedProcess(['--import', pathToFileURL(loader).href, wrangler, 'dev', '--config', config, '--local', '--persist-to', state, '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0', ...envArgs], root, ['ignore', 'pipe', 'pipe']);
    // Drain diagnostics without copying possible local environment values to reports.
    worker.child.stderr.resume();
    const origin = await bounded(Promise.race([readyOrigin(worker, controller.signal), interrupted]), startupTimeoutMs, 'Built Worker did not become ready before the startup deadline');
    worker.child.stdout.resume();
    console.log(`Checking built Worker at ${origin} (HTTP only; no model calls).`);
    smoke = ownedProcess([smokeFile, origin, report], root, ['ignore', 'inherit', 'inherit']);
    const result = await bounded(Promise.race([smoke.done, interrupted, worker.done.then(() => { throw new Error('Built Worker stopped during HTTP verification'); })]), smokeTimeoutMs, 'HTTP smoke exceeded its deadline');
    if (result.error) throw result.error;
    if (result.code !== 0) throw new Error(`HTTP smoke failed (exit ${result.code}); report: ${report}`);
    console.log(`HTTP checks passed; browser interaction is not tested. Report: ${report}`);
    return { origin, report };
  } finally {
    // Smoke finishes first so it cannot write after its owned Worker is stopped.
    try { await stopOwned(smoke); } finally {
      try { await stopOwned(worker); } finally {
        controller.abort(new Error('HTTP verification finished'));
        process.removeListener('SIGINT', interrupt);process.removeListener('SIGTERM', interrupt);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('verify:http does not accept extra arguments.');
    await verifyHttp();
  } catch (error) { console.error(error.message);process.exitCode = 1; }
}
