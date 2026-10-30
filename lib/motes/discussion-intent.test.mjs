import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

const intent = await loadTypeScript('./discussion-intent.ts');
const diagnostics = await loadTypeScript('./runtime-diagnostics.ts');

test('runtime repair scaffold is build intent even though the body mentions problems and causes', () => {
  const prompt = diagnostics.runtimeRepairRequest([
    { kind: 'error', errorType: 'TypeError', line: 17, column: 4 },
    { kind: 'unhandledrejection', errorType: 'UnhandledRejection', line: 0, column: 0 },
  ]);
  assert.match(prompt, /^请排查并修复当前应用在隔离预览中出现的以下运行问题：/);
  assert.match(prompt, /问题|原因/);
  assert.equal(intent.suggestDiscussion(prompt), false);
});

test('adopted discussion build scaffolds stay build intent when quoted question contains why/how wording', () => {
  const full = intent.discussionBuildDraft('为什么当前页面会空白？', '建议修复运行问题，同时解释原因并调整提示。');
  assert.equal(full.shortened, false);
  assert.equal(intent.suggestDiscussion(full.text), false);

  const shortened = intent.discussionBuildDraft('为什么页面空白？'.repeat(350), '如何保留功能并排查原因？'.repeat(500));
  assert.equal(shortened.shortened, true);
  assert.equal(intent.suggestDiscussion(shortened.text), false);
});

test('ordinary questions still receive the discussion choice, including long and repair-worded questions', () => {
  const questions = [
    '为什么按钮没有反应？',
    '如何修复当前应用中的空白页面？',
    '怎么修复运行问题？',
    '请问为什么修复后的按钮仍然没有反应？',
    `当前应用打开后页面空白。${'我已经检查了布局、按钮、表单和控制台错误，但仍然不明白为什么状态没有更新，也不知道如何修复。'.repeat(12)}？`,
  ];
  for (const question of questions) assert.equal(intent.suggestDiscussion(question), true, question.slice(0, 60));
});

test('greetings and explicit create/build requests remain build intent', () => {
  for (const prompt of ['你好', '帮我创建一个预算工具', '请生成一个番茄钟', 'Build a simple task list']) {
    assert.equal(intent.suggestDiscussion(prompt), false, prompt);
  }
});
