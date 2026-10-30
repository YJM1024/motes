import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./requirement-draft.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('only entered fields appear in the structured draft', () => {
  assert.equal(mod.buildRequirementDraft({ targetUser: '店主', mainActions: '', preserve: '原有记录', style: '', device: '', constraints: '' }), '目标用户：店主\n\n必须保留：原有记录');
  assert.equal(mod.buildRequirementDraft({ targetUser: '', mainActions: '', preserve: '', style: '', device: '', constraints: '' }), '');
});

test('conflict hints identify explicit opposing requirements only', () => {
  assert.deepEqual(mod.findRequirementConflicts('仅手机使用，同时要求仅桌面使用'), ['同时出现“仅手机”和“仅桌面”要求']);
  assert.deepEqual(mod.findRequirementConflicts('适配手机和桌面，不需要登录'), []);
  assert.deepEqual(mod.findRequirementConflicts('必须用户登录，同时不需要登录'), ['同时出现“需要登录”和“不需要登录”要求']);
});

test('append preserves the original draft and enforces the 4000 character limit', () => {
  assert.equal(mod.appendRequirementDraft('现有需求', '结构化要求'), '现有需求\n\n结构化要求');
  assert.throws(() => mod.appendRequirementDraft('x'.repeat(3999), '新内容'), /4000/);
  assert.equal(mod.REQUIREMENT_DRAFT_LIMIT, 4000);
});
