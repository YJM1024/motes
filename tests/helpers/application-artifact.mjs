import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadSourceModule } from './source-modules.mjs';

const { renderApplicationHtml } = await loadSourceModule('motes/react-render');
const { exportApplicationHtml } = await loadSourceModule('motes/application-export');
const hash = text => createHash('sha256').update(text).digest('hex');

export async function applicationArtifact(source) {
  const renderedHtml = await renderApplicationHtml(source);
  const exportedHtml = exportApplicationHtml(source, renderedHtml);
  return {
    renderedHtml, exportedHtml,
    sourceSha256: hash(source), sourceBytes: Buffer.byteLength(source),
    renderedHtmlSha256: hash(renderedHtml), renderedHtmlBytes: Buffer.byteLength(renderedHtml),
    exportedHtmlSha256: hash(exportedHtml), exportedHtmlBytes: Buffer.byteLength(exportedHtml),
  };
}

export function assertPublishedApplication(publicVersion, artifact) {
  assert.equal(publicVersion.html, artifact.renderedHtml, 'Anonymous publication must return the exact compiled version, without the standalone export notice');
}
