import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './sites-env.mjs';

// Wrangler resolves env files beside its config; Node can also parse this flag.
// Use one absolute path so both resolve the root configuration on every OS.
const envFile = fileURLToPath(new URL('../.dev.vars', import.meta.url));
const child = spawn(process.execPath, [
  '--import', new URL('./sites-env.mjs', import.meta.url).href,
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', '.wrangler/state',
  '--ip', '127.0.0.1', '--inspector-port', '0',
  ...(existsSync(envFile) ? ['--env-file', envFile] : []), ...process.argv.slice(2),
], { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
