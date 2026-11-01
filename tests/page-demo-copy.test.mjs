import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('app/page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function declarationExpression(name) {
  let found;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node.initializer;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found, 'missing ' + name + ' expression');
  return found.getText(source);
}

function firstCallArgument(functionName, callName) {
  let functionNode, result;
  const findFunction = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) functionNode = node;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) functionNode = node.initializer;
    if (!functionNode) ts.forEachChild(node, findFunction);
  };
  findFunction(source);
  assert.ok(functionNode, 'missing ' + functionName);
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callName) result = node.arguments[0];
    if (!result) ts.forEachChild(node, visit);
  };
  visit(functionNode);
  assert.ok(result, 'missing ' + callName + ' call in ' + functionName);
  return result.getText(source);
}

const translate = key => key;

test('in-flight demo and model hints select the correct fee language', () => {
  const evaluate = new Function('sending','a','saving','saveOnly','checking','checkOnly','status','t','return (' + declarationExpression('hint') + ')');
  const demo = evaluate(true,{mode:'demo'},false,false,false,false,null,translate);
  const model = evaluate(true,{mode:'model'},false,false,false,false,null,translate);
  assert.equal(demo,'示例使用已有模板，不调用模型。');
  assert.match(model,/服务端可能继续执行并产生费用/);
});

test('stopping or pausing demo work has no model fee claim while model warnings remain', () => {
  const stop = new Function('attempt','t','return (' + declarationExpression('stopCopy') + ')');
  const notice = new Function('attempt','t','return (' + declarationExpression('noticeCopy') + ')');
  const pause = new Function('attempt','t','return (' + firstCallArgument('pauseRecovery','setNotice') + ')');
  for (const getText of [stop,notice,pause]) {
    const demo=getText({mode:'demo'},translate);
    assert.match(demo,/不调用模型/);assert.doesNotMatch(demo,/费用|收费|服务端执行/);
    assert.match(getText({mode:'model'},translate),/费用|收费/);
  }
});

test('switching after a recovered demo does not imply a server charge; model recovery retains warning', () => {
  const newProjectNotice = new Function('recovered','t','return (' + firstCallArgument('newProject','setNotice') + ')');
  assert.match(newProjectNotice([{recovered:true,mode:'demo'}],translate),/不调用模型/);
  assert.doesNotMatch(newProjectNotice([{recovered:true,mode:'demo'}],translate),/费用|收费/);
  assert.match(newProjectNotice([{recovered:true,mode:'model'}],translate),/费用/);
});

test('demo-only wording is present in the bilingual host catalog', async () => {
  const catalog = await readFile(new URL('../lib/motes/locale/ux-panels.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(catalog,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const {uxPanelMessages}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  assert.match(uxPanelMessages['已停止本页示例等待；示例使用已有模板，不调用模型。原需求和草稿已保留。'],/Stopped waiting/);
  assert.match(uxPanelMessages['已暂停本页示例核对；示例使用已有模板，不调用模型。'],/Paused checks/);
});
