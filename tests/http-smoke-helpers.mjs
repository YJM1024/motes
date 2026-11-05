import assert from 'node:assert/strict';

// Legacy suites change workspace preferences and require a disposable private workspace.
// Perform this read-only check before obtaining fixtures or sending any write request.
export async function requirePrivateWorkspace(origin) {
  const response = await fetch(new URL('/api/session', origin), {
    redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  assert.equal(response.status, 200, 'Session preflight must succeed before testing');
  const session = await response.json();
  assert.equal(session.visibility, 'private',
    'This legacy suite requires a disposable private workspace. No writes were sent. Use tests/smoke.mjs for the visibility-aware core journey or tests/shared-runtime-smoke.mjs for shared runtime checks.');
}
