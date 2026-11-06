import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const root = new URL('../../lib/', import.meta.url), cache = new Map();
async function moduleUrl(file) {
  if (!file.href.startsWith(root.href) || !file.pathname.endsWith('.ts')) throw new Error('Only trusted project TypeScript modules may be loaded');
  if (cache.has(file.href)) return cache.get(file.href);
  let source = await readFile(file, 'utf8');
  const nodes = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true).statements
    .filter(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly && !node.importClause?.isTypeOnly);
  for (const node of nodes.toReversed()) {
    const specifier = node.moduleSpecifier.text;
    const url = specifier.startsWith('.') ? await moduleUrl(new URL(specifier + '.ts', file)) : import.meta.resolve(specifier);
    source = source.slice(0, node.moduleSpecifier.getStart()) + JSON.stringify(url) + source.slice(node.moduleSpecifier.end);
  }
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  cache.set(file.href, url);
  return url;
}

// This loads trusted compiler/export modules only. Generated application source
// is passed to those functions as data and is never imported or evaluated here.
export async function loadSourceModule(name) {
  return import(await moduleUrl(new URL(name + '.ts', root)));
}
