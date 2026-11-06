import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applicationArtifact, assertPublishedApplication } from './helpers/application-artifact.mjs';
import { loadSourceModule } from './helpers/source-modules.mjs';

const { createReactProject } = await loadSourceModule('motes/react-project');
const { renderApplicationHtml } = await loadSourceModule('motes/react-render');
const { exportApplicationHtml } = await loadSourceModule('motes/application-export');
const hash = text => createHash('sha256').update(text).digest('hex');

test('model journey exports compiled React HTML and compares publications to exact compiled source without executing it', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Zero-paid regression must not make network requests'); });
  const source = createReactProject({
    'src/App.jsx': 'globalThis.modelJourneySourceExecuted=true;export default ()=> <h1 className="p-4">Counter</h1>;',
    'src/index.css': '@import "tailwindcss";',
  });
  delete globalThis.modelJourneySourceExecuted;
  const artifact = await applicationArtifact(source);
  assert.equal(globalThis.modelJourneySourceExecuted, undefined);
  const rendered = await renderApplicationHtml(source);
  assert.equal(artifact.renderedHtml, rendered);
  assert.equal(artifact.exportedHtml, exportApplicationHtml(source, rendered));
  assert.notEqual(artifact.exportedHtml, source);assert.notEqual(artifact.exportedHtml, rendered);
  for (const [prefix, text] of [['source', source], ['renderedHtml', rendered], ['exportedHtml', artifact.exportedHtml]]) {
    assert.equal(artifact[prefix + 'Sha256'], hash(text));assert.equal(artifact[prefix + 'Bytes'], Buffer.byteLength(text));
  }
  assert.doesNotThrow(() => assertPublishedApplication({ html: rendered }, artifact));
  for (const html of [source, artifact.exportedHtml, rendered.replace('Counter', 'Changed')]) assert.throws(() => assertPublishedApplication({ html }, artifact));
});

test('model journey preserves legacy HTML export and exact publication comparisons', async () => {
  const source = '<!doctype html><html><body><h1>Legacy app</h1></body></html>';
  const artifact = await applicationArtifact(source);
  assert.equal(artifact.exportedHtml, source);assert.equal(artifact.renderedHtml, source);
  assert.equal(artifact.sourceSha256, artifact.exportedHtmlSha256);
  assert.doesNotThrow(() => assertPublishedApplication({ html: source }, artifact));
  assert.throws(() => assertPublishedApplication({ html: source + 'changed' }, artifact));
});
