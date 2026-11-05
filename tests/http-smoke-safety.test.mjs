import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('legacy HTTP suites reject shared workspaces before any write or fixture read', async t => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ visibility: 'shared', mode: 'model' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const name of ['management', 'settings', 'creation-flow', 'sharing']) {
    const before = requests.length;
    const file = fileURLToPath(new URL(`./${name}-smoke.mjs`, import.meta.url));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [file, origin], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => output += chunk);
      child.stderr.on('data', chunk => output += chunk);
      const timer = setTimeout(() => { child.kill(); reject(Error(`${name} preflight timed out`)); }, 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve({ code, output }); });
    });
    assert.equal(result.code, 1, `${name} must report failure, never an isolation pass`);
    assert.match(result.output, /requires a disposable private workspace/);
    assert.deepEqual(requests.slice(before), [{ method: 'GET', path: '/api/session' }], `${name} must stop before fixture reads and mutations`);
  }
});
