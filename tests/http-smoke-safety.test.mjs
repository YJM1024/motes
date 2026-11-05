import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('legacy HTTP suites reject shared workspaces before any write or fixture read', async () => {
  // Exercise the real executable scripts in fresh processes, with recording
  // transport instead of loopback sockets (which some Windows environments deny).
  // Every attempted fetch is observable, including unexpected writes/fixture reads.
  const marker = 'SMOKE_PREFLIGHT_REQUEST ';
  const fixture = 'data:text/javascript;base64,' + Buffer.from(`
    globalThis.fetch = async (input, init = {}) => {
      const request = new Request(input, init);
      process.stdout.write(${JSON.stringify(marker)} + JSON.stringify({method:request.method,path:new URL(request.url).pathname}) + '\\n');
      return Response.json({visibility:'shared',mode:'model'});
    };
  `).toString('base64');
  const origin = 'http://fixture.invalid';
  for (const name of ['management', 'settings', 'creation-flow', 'sharing']) {
    const file = fileURLToPath(new URL(`./${name}-smoke.mjs`, import.meta.url));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', fixture, file, origin], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => output += chunk);
      child.stderr.on('data', chunk => output += chunk);
      const timer = setTimeout(() => { child.kill(); reject(Error(`${name} preflight timed out`)); }, 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve({ code, output }); });
    });
    assert.equal(result.code, 1, `${name} must report failure, never an isolation pass`);
    assert.match(result.output, /requires a disposable private workspace/);
    const requests = result.output.split(/\r?\n/).filter(line => line.startsWith(marker)).map(line => JSON.parse(line.slice(marker.length)));
    assert.deepEqual(requests, [{ method: 'GET', path: '/api/session' }], `${name} must stop before fixture reads and mutations`);
  }
});
