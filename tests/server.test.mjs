import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Import pure TS modules through data URLs so Node's tests need no extra runner.
import ts from 'typescript';
async function moduleAt(path){const src=await readFile(new URL(path,import.meta.url),'utf8');const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))}
const {generateDemo}=await moduleAt('../lib/forma/demo.ts');
const {parseModelOutput,generateModel}=await moduleAt('../lib/forma/model.ts');
const {owner,assertOrigin}=await moduleAt('../lib/forma/security.ts');
test('three working standalone demos and limited modifications',()=>{
  for(const prompt of ['旅行预算计算器','任务看板','番茄钟']){const {html}=generateDemo(prompt);assert.match(html,/<!doctype html>/i);assert.match(html,/<script>/);assert.doesNotMatch(html,/localStorage|https?:\/\//);new Function(html.match(/<script>([\s\S]*)<\/script>/)[1])}
  const initial=generateDemo('旅行预算计算器').html;
  const changed=generateDemo('深色主题，改成蓝色，预算上限 8000',initial).html;
  assert.match(changed,/forma:budget:dark:#3375df:8000/);
  assert.throws(()=>generateDemo('接入支付宝',initial),/超出示例模式能力/);
  assert.throws(()=>generateDemo('给我一个 CRM'),/示例模式只支持/);
});
test('model parser rejects truncation, incomplete and malformed output',()=>{
  const html=generateDemo('番茄钟').html;
  const response={status:'completed',output:[{content:[{type:'output_text',text:'```html\n'+html+'\n```'}]}]};
  assert.equal(parseModelOutput(response),html);
  assert.throws(()=>parseModelOutput({...response,status:'incomplete'}),/未完成/);
  assert.throws(()=>parseModelOutput({status:'completed',output:[{content:[{type:'output_text',text:'<p>partial</p>'}]}]}),/完整 HTML/);
});
test('ownership uses opaque hashed cookie and mutations require matching origin',async()=>{
  const request=(token)=>new Request('https://forma.test/api/projects',{headers:{cookie:'forma_session='+token}});
  const a=await owner(request('a'.repeat(64))),b=await owner(request('b'.repeat(64)));
  assert.notEqual(a,b);assert.notEqual(a,'a'.repeat(64));assert.equal(a.length,64);
  await assert.rejects(owner(request('invalid')),e=>e.status===401);
  assert.throws(()=>assertOrigin(new Request('https://forma.test/api/generate',{headers:{origin:'https://evil.test'}})),e=>e.status===403);
  assert.throws(()=>assertOrigin(new Request('https://forma.test/api/generate')),e=>e.status===403);
  assert.doesNotThrow(()=>assertOrigin(new Request('https://forma.test/api/generate',{headers:{origin:'https://forma.test'}})));
});

test('model failures distinguish timeout, quota and authentication',async(t)=>{
 const mocked=t.mock.method(globalThis,'fetch');
 mocked.mock.mockImplementation(async()=>{throw new DOMException('timed out','TimeoutError')});
 await assert.rejects(generateModel('test',undefined,'test-key','gpt-6-luna'),e=>e.status===504&&/3 分钟/.test(e.message));
 mocked.mock.mockImplementation(async()=>Response.json({error:{code:'insufficient_quota'}},{status:429}));
 await assert.rejects(generateModel('test',undefined,'test-key','gpt-6-luna'),e=>e.status===429&&/额度不足/.test(e.message));
 mocked.mock.mockImplementation(async()=>new Response('',{status:401}));
 await assert.rejects(generateModel('test',undefined,'test-key','gpt-6-luna'),e=>e.status===503&&/密钥/.test(e.message));
 mocked.mock.restore();
});
