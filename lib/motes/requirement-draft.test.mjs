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
  assert.deepEqual(mod.findRequirementConflicts('仅手机使用，同时要求仅桌面使用'), ['你希望只支持手机，还是也需要桌面？当前描述同时写了“仅手机”和“仅桌面”。']);
  assert.deepEqual(mod.findRequirementConflicts('适配手机和桌面，不需要登录'), []);
  assert.deepEqual(mod.findRequirementConflicts('必须用户登录，同时不需要登录'), ['是否需要用户登录？当前描述同时写了“需要登录”和“不需要登录”。']);
  assert.match(mod.findRequirementConflicts('仅离线使用，必须联网同步')[0], /只离线使用，还是需要联网同步/);
});

test('guidance asks for core actions and data scope without inventing requirements', () => {
  const blank = { targetUser: '', mainActions: '', preserve: '', style: '', device: '', constraints: '' };
  assert.deepEqual(mod.requirementGuidance(blank), { suggestions: [], needsDataScopeClarification: false });
  assert.deepEqual(mod.requirementGuidance({ ...blank, style: '简洁', device: '手机优先' }), {
    suggestions: ['还没有说明用户要完成的主要操作；可补充核心操作后再生成草稿。'], needsDataScopeClarification: false,
  });
  assert.equal(mod.requirementGuidance({ ...blank, constraints: '需要账号登录并云端同步' }).needsDataScopeClarification, true);
});

test('append preserves the original draft and enforces the 4000 character limit', () => {
  assert.equal(mod.appendRequirementDraft('现有需求', '结构化要求'), '现有需求\n\n结构化要求');
  assert.throws(() => mod.appendRequirementDraft('x'.repeat(3999), '新内容'), /4000/);
  assert.equal(mod.REQUIREMENT_DRAFT_LIMIT, 4000);
});
