import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// This is a review aid, not an automatic translator. Literal payloads and stored
// user content require human review and must never be rewritten just to clear it.
const root = process.cwd();
const files = ['app/page.tsx', 'app/manage/page.tsx', 'app/settings/page.tsx', 'app/compare/page.tsx'];
for (const name of await readdir(path.join(root, 'app/components'))) {
  if (/\.(?:tsx|ts)$/.test(name)) files.push(`app/components/${name}`);
}
const directMisses = [], reviewLiterals = [], fixedDateLocales = [];
const chinese = /[\u3400-\u9fff]/;
for (const file of files) {
  const text = await readFile(path.join(root, file), 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const record = (node, category, value) => ({ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, category, text: value.trim() });
  function translated(node) {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isCallExpression(current) && ['t', 'tText', 'hostText', 'translateHostMessage'].includes(current.expression.getText(tree))) return true;
    }
    return false;
  }
  function visit(node) {
    if (ts.isJsxText(node) && chinese.test(node.text)) directMisses.push(record(node, 'jsx-text', node.text));
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && chinese.test(node.initializer.text)) directMisses.push(record(node, 'jsx-attribute', node.initializer.text));
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && chinese.test(node.text) && !translated(node) && !ts.isJsxAttribute(node.parent)) reviewLiterals.push(record(node, 'literal-needs-review', node.text));
    if (ts.isCallExpression(node) && /\.toLocale(?:DateString|TimeString|String)$/.test(node.expression.getText(tree)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'zh-CN') fixedDateLocales.push(record(node, 'fixed-host-date-locale', node.getText(tree)));
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
const report = { files: files.length, directMisses, fixedDateLocales, reviewLiterals, note: 'Direct JSX misses and fixed host date locales need correction. Review literals may be intentional prompt payloads, data enums, or source snapshots; do not translate user or generated content.' };
const output = process.argv[2];
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, directMisses: directMisses.length, fixedDateLocales: fixedDateLocales.length, reviewLiterals: reviewLiterals.length, ...(output ? { output } : {}) }));
