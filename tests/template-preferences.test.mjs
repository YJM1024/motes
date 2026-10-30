import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/motes/template-preferences.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('renders named variables and reports missing values without dropping placeholders', () => {
  const template = '为{{项目名}}设计页面，服务对象是{{用户}}，再次提到{{项目名}}。';
  assert.deepEqual(helpers.templateVariables(template), ['项目名', '用户']);
  assert.deepEqual(helpers.renderTemplate(template, { 项目名: '预算工具' }), { text: '为预算工具设计页面，服务对象是{{用户}}，再次提到预算工具。', missing: ['用户'] });
  assert.deepEqual(helpers.renderTemplate(template, { 项目名: '预算工具', 用户: '旅行者' }).missing, []);
});

test('keeps browser preferences scoped and tolerates malformed stored data', () => {
  assert.notEqual(helpers.templatePreferencesKey('space/a'), helpers.templatePreferencesKey('space/b'));
  assert.deepEqual(helpers.parseTemplatePreferences('{bad'), helpers.EMPTY_TEMPLATE_PREFERENCES);
  assert.deepEqual(helpers.parseTemplatePreferences(JSON.stringify({ favorites: ['x', 1], categories: { x: '功能', y: 2 }, recent: ['y'] })), { favorites: ['x'], categories: { x: '功能' }, recent: ['y'] });
});
