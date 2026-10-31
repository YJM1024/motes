import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/forma/demo.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { generateDemo } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('task board copy describes persisted status without claiming refresh discards it', () => {
  const html = generateDemo('任务看板').html;
  assert.match(html, /点击任务的“下一步”推进状态；完成后可删除。保存结果见下方提示。/);
  assert.doesNotMatch(html, /刷新后恢复示例|刷新后丢失|刷新后清空/);
  assert.match(html, /已保存，所有访客均可查看。/);
});
