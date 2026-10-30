import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./version-config-view.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('unrecorded versions are explicitly unknown and are not inferred', () => {
  assert.match(mod.versionConfigStatus({ recorded: false, operation: 'generate', settings: null }), /未记录/);
});

test('manual and copy operations with null settings are described without guessing', () => {
  assert.match(mod.versionConfigStatus({ recorded: true, operation: 'template-copy', settings: null }), /没有使用生成模型配置/);
  assert.match(mod.versionConfigStatus({ recorded: true, operation: 'modify', settings: null }), /没有可显示/);
});

test('setting values and operations receive readable labels without exposing unknown fields', () => {
  assert.equal(mod.versionConfigOperationLabel('element'), '选中元素修改');
  assert.equal(mod.formatVersionConfigValue('autoFollow', false), '关闭');
  assert.equal(mod.formatVersionConfigValue('visualStyle', 'soft'), '柔和');
  assert.equal(mod.formatVersionConfigValue('model', 'demo-model-name'), 'demo-model-name');
  assert.equal(mod.formatVersionConfigValue('apiKey', 'not-in-schema'), '未显示');
  assert.equal(mod.versionConfigSettingLabel('apiKey'), '未识别设置');
});

test('English labels preserve raw model names and hide unknown/prototype settings',()=>{assert.match(mod.versionConfigStatus({recorded:false},'en'),/did not record/);assert.equal(mod.versionConfigSettingLabel('language','en'),'Generated app language');assert.equal(mod.versionConfigOperationLabel('element','en'),'Selected element change');assert.equal(mod.formatVersionConfigValue('autoFollow',false,'en'),'Off');assert.equal(mod.formatVersionConfigValue('model','模型','en'),'模型');assert.equal(mod.formatVersionConfigValue('visualStyle','user-custom-value','en'),'user-custom-value');for(const key of ['apiKey','__proto__','toString']){assert.equal(mod.versionConfigSettingLabel(key,'en'),'Unknown setting');assert.equal(mod.formatVersionConfigValue(key,'secret','en'),'Not shown');}assert.equal(mod.formatVersionConfigDate(undefined,'en'),'Time not recorded');});
