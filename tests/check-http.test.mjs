import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyHttp, workerOrigin } from '../scripts/check-http.mjs';

async function fixture(t, mode = 'success') {
  const root = await mkdtemp(path.join(tmpdir(), 'motes-check-http-'));
  assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
  assert.ok(path.basename(root).startsWith('motes-check-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'tests', 'node_modules/wrangler/bin', 'dist/server', '.wrangler/state']) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, 'scripts/sites-env.mjs'), '');
  await writeFile(path.join(root, 'dist/server/wrangler.json'), '{}');
  await writeFile(path.join(root, 'node_modules/wrangler/bin/wrangler.js'), `
    import {createServer} from 'node:http';
    import {writeFileSync} from 'node:fs';
    import {spawn} from 'node:child_process';
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
    // Reap the fixture child before the fake Worker exits on POSIX. Otherwise
    // an exited orphan can briefly remain a zombie and look alive to kill(pid,0).
    process.once('SIGTERM',()=>{
      child.once('exit',()=>process.exit(0));
      child.kill('SIGTERM');
      if(child.exitCode!==null||child.signalCode!==null)process.exit(0);
    });
    writeFileSync('pids.json',JSON.stringify([process.pid,child.pid]));
    writeFileSync('argv.json',JSON.stringify(process.argv.slice(2)));
    if(${JSON.stringify(mode)}==='early-exit'){child.kill();process.exit(3);}
    const server=createServer((request,response)=>{response.setHeader('Content-Type','application/json');response.end('{"mode":"demo"}');});
    server.listen(0,'127.0.0.1',()=>{
      if(${JSON.stringify(mode)}==='startup-timeout')return;
      const origin='http://127.0.0.1:'+server.address().port;
      process.stdout.write('[wrangler:info] Ready on '+origin.slice(0,-2));
      setTimeout(()=>process.stdout.write(origin.slice(-2)+'\\n'),30);
    });
  `);
  await writeFile(path.join(root, 'tests/smoke.mjs'), `
    import assert from 'node:assert/strict';
    import {writeFile} from 'node:fs/promises';
    const origin=process.argv[2];
    assert.equal(new URL(origin).hostname,'127.0.0.1');
    assert.ok(Number(new URL(origin).port)>0);
    await writeFile(process.argv[3],JSON.stringify({passed:${mode !== 'smoke-failure'},origin,modelCalls:0}));
    if(${JSON.stringify(mode)}==='smoke-timeout')await new Promise(()=>setInterval(()=>{},1000));
    process.exitCode=${mode === 'smoke-failure' ? 1 : 0};
  `);
  return root;
}

async function assertStopped(root) {
  const pids = JSON.parse(await readFile(path.join(root, 'pids.json'), 'utf8'));
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH', `Owned process ${pid} must be stopped`);
}

test('Worker URL parser waits for complete port output and accepts only actual loopback Ready/Local lines', () => {
  assert.equal(workerOrigin('[wrangler:info] Ready on http://127.0.0.1:12'), null);
  assert.equal(workerOrigin('[wrangler:info] Ready on http://127.0.0.1:12345\n'), 'http://127.0.0.1:12345');
  assert.equal(workerOrigin('  Local: http://127.0.0.1:43210/\n'), 'http://127.0.0.1:43210');
  for (const text of ['http://127.0.0.1:5173\n', 'Ready on http://localhost:5173\n', 'Ready on https://example.com:123\n', 'Ready on http://127.0.0.1:0\n', 'Ready on http://127.0.0.1:70000\n']) assert.equal(workerOrigin(text), null);
});

test('HTTP verification uses its random owned Worker and stops the Worker process tree after success', async t => {
  const root = await fixture(t);
  const result = await verifyHttp({ root, startupTimeoutMs: 10000, smokeTimeoutMs: 10000 });
  const report = JSON.parse(await readFile(result.report, 'utf8'));
  assert.equal(path.dirname(result.report), path.join(root, 'outputs'));
  assert.deepEqual(report, { passed: true, origin: result.origin, modelCalls: 0 });
  const args = JSON.parse(await readFile(path.join(root, 'argv.json'), 'utf8'));
  assert.ok(!args.includes('--env-file'));assert.ok(!args.includes('--remote'));
  await assertStopped(root);
});

test('HTTP verification passes only the existing root env-file path to its local Worker', async t => {
  const root = await fixture(t), envFile = path.join(root, '.dev.vars');
  const sentinel = 'test-only-value-never-on-command-line';
  await writeFile(envFile, 'OPENAI_API_KEY=' + sentinel + '\nMOTES_WORKSPACE_VISIBILITY=shared\n');
  await verifyHttp({ root, startupTimeoutMs: 10000, smokeTimeoutMs: 10000 });
  const args = JSON.parse(await readFile(path.join(root, 'argv.json'), 'utf8'));
  assert.equal(args[args.indexOf('--env-file') + 1], envFile);
  assert.equal(args.filter(arg => arg === '--env-file').length, 1);
  assert.ok(args.includes('--local'));assert.ok(!args.includes('--remote'));
  assert.ok(!JSON.stringify(args).includes(sentinel));assert.ok(!JSON.stringify(args).includes('OPENAI_API_KEY='));
  assert.equal(await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'), '{}');
  assert.equal(await readFile(envFile, 'utf8'), 'OPENAI_API_KEY=' + sentinel + '\nMOTES_WORKSPACE_VISIBILITY=shared\n');
  await assertStopped(root);
});

test('HTTP verification stops only its own Worker tree when smoke fails or times out', async t => {
  for (const mode of ['smoke-failure', 'smoke-timeout']) {
    const root = await fixture(t, mode);
    await assert.rejects(verifyHttp({ root, startupTimeoutMs: 10000, smokeTimeoutMs: mode === 'smoke-timeout' ? 1000 : 10000 }), /HTTP smoke (?:failed|exceeded)/);
    await assertStopped(root);
  }
});

test('HTTP verification bounds startup waiting and handles early Worker exit', async t => {
  for (const mode of ['startup-timeout', 'early-exit']) {
    const root = await fixture(t, mode);
    await assert.rejects(verifyHttp({ root, startupTimeoutMs: mode === 'startup-timeout' ? 3000 : 10000 }), /(?:startup deadline|stopped before ready)/);
    await assertStopped(root);
  }
});
