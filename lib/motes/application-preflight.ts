import { renderApplicationHtml } from './react-render';
import { publicationPreflight } from './publication-preflight';
/** The persisted source has the existing budget; trusted compiled runtime is not source. */
export async function applicationPreflight(source: string) {
  if (Array.from(source).length > 180_000) throw new Error('HTML 超出发布上限。');
  const html = await renderApplicationHtml(source);
  const result = publicationPreflight(html, Number.MAX_SAFE_INTEGER);
  if (result.errors.length) throw new Error(result.errors.join(' '));
  return { html, ...result };
}
