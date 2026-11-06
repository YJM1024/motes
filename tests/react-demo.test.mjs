import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/forma/react-demo.ts', import.meta.url), 'utf8');
const injectable = source.replace("import {createReactProject, parseReactProject} from '../motes/react-project';", `function createReactProject(files){return JSON.stringify(files)}; function parseReactProject(){return null}`);
const js = ts.transpileModule(injectable, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {generateReactDemo} = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('fixed React examples include usable interactions and shared data contract', () => {
  const budget = JSON.parse(generateReactDemo('旅行预算').html)['src/App.jsx'];
  assert.match(budget, /demo\.budget\.v1/);
  assert.match(budget, /实时计算并显式保存/);
  assert.match(budget, /save\(\{limit,expenses\}\)/);
  const tasks = JSON.parse(generateReactDemo('任务看板').html)['src/App.jsx'];
  assert.match(tasks, /demo\.tasks\.v1/);
  assert.match(tasks, /添加任务 \+/);
  assert.match(tasks, /下一步 →/);
  assert.match(tasks, /删除/);
  const timer = JSON.parse(generateReactDemo('番茄钟').html)['src/App.jsx'];
  assert.match(timer, /demo\.timer\.v1/);
  assert.match(timer, /开始专注/);
  assert.match(timer, /暂停/);
  assert.match(timer, /重置/);
  for (const app of [budget,tasks,timer]) assert.match(app, /本地固定 React 示例 · 不调用 AI/);
});

test('React demo keeps supported theme and budget settings in a stable source marker', () => {
  const budget = JSON.parse(generateReactDemo('旅行预算上限8000').html);
  assert.match(budget['src/App.jsx'], /kind=budget;theme=light;color=purple;amount=8000/);
  assert.throws(() => generateReactDemo('自由聊天应用'), /只支持旅行预算计算器/);
});
