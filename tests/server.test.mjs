import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Import pure TS modules through data URLs so Node's tests need no extra runner.
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
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

// Execute production queries against SQLite, with D1's transactional batch API.
async function serverHarness() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../drizzle/0000_great_roland_deschain.sql',import.meta.url),'utf8'));
  const harness={sqlite,failRead:false};
  function prepare(sql,args=[]) {
    return {
      bind(...values){return prepare(sql,values)},
      async first(){
        if(harness.failRead && sql.startsWith('SELECT id,title') && sql.includes('AND id=?')){harness.failRead=false;throw new Error('simulated read outage')}
        return sqlite.prepare(sql).get(...args)??null;
      },
      async all(){return {results:sqlite.prepare(sql).all(...args)}},
      async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}},
    };
  }
  harness.env={DB:{prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}},OPENAI_API_KEY:'fake-test-key',OPENAI_MODEL:'fake-model'};
  const key=crypto.randomUUID();globalThis[key]=harness.env;
  let source=await readFile(new URL('../lib/forma/server.ts',import.meta.url),'utf8');
  source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);
  for(const file of ['demo','model','security']){
    const raw=await readFile(new URL(`../lib/forma/${file}.ts`,import.meta.url),'utf8');
    const js=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    source=source.replaceAll(`'./${file}'`,JSON.stringify('data:text/javascript;base64,'+Buffer.from(js).toString('base64')));
  }
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const server=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  delete globalThis[key];
  const request=body=>new Request('https://forma.test/api/generate',{method:'POST',headers:{origin:'https://forma.test','content-type':'application/json',cookie:'forma_session='+'a'.repeat(64)},body:JSON.stringify(body)});
  return {...harness,server,request,close:()=>sqlite.close(),setFailRead:()=>{harness.failRead=true}};
}

test('committed generation survives read failure and same request retries without a model call',async(t)=>{
  const h=await serverHarness();t.after(h.close);
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;h.setFailRead();return Response.json({status:'completed',output:[{content:[{type:'output_text',text:generateDemo('番茄钟').html}]}]})});
  const body={prompt:'番茄钟',mode:'model',requestId:crypto.randomUUID()};
  const first=await h.server.route(()=>h.server.generate(h.request(body)));
  assert.equal(first.status,500);
  assert.equal((await first.json()).retry,undefined,'Post-commit read failure must reconcile the same request ID');
  assert.equal(h.sqlite.prepare('SELECT status FROM forma_requests').get().status,'done');
  const retry=await h.server.generate(h.request(body));
  assert.equal(retry.status,200);
  assert.equal((await retry.json()).project.versions.length,1);
  assert.equal(calls,1);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,1);
});

test('confirmed model failure explicitly permits one-click retry with a new ID',async(t)=>{
  for(const failure of ['timeout','unavailable']){
    const h=await serverHarness();
    let calls=0;
    const mocked=t.mock.method(globalThis,'fetch',async()=>{
      calls++;
      if(calls===1){if(failure==='timeout')throw new DOMException('timed out','TimeoutError');return new Response('',{status:503})}
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:generateDemo('番茄钟').html}]}]});
    });
    try{
      const body={prompt:'番茄钟',mode:'model',requestId:crypto.randomUUID()};
      const first=await h.server.route(()=>h.server.generate(h.request(body)));
      assert.equal(first.status,failure==='timeout'?504:502);
      const error=await first.json();
      assert.equal(error.retry,'new');
      assert.equal(h.sqlite.prepare('SELECT status FROM forma_requests').get().status,'failed');
      assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_locks').get().n,0);
      const retryBody={...body,requestId:error.retry==='new'?crypto.randomUUID():body.requestId};
      const retry=await h.server.generate(h.request(retryBody));
      assert.equal(retry.status,200);
      assert.equal((await retry.json()).project.versions.length,1);
      assert.equal(calls,2,'One retry immediately reaches the model');
    }finally{mocked.mock.restore();h.close()}
  }
});

test('expired running request can be reissued and its old worker cannot commit over the new version',async(t)=>{
  const h=await serverHarness();t.after(h.close);
  const initial=await (await h.server.generate(h.request({prompt:'番茄钟',mode:'demo',requestId:crypto.randomUUID()}))).json();
  const projectId=initial.project.id;
  let release;const waiting=new Promise(resolve=>{release=resolve});let entered;const started=new Promise(resolve=>{entered=resolve});
  t.mock.method(globalThis,'fetch',async()=>{entered();await waiting;return Response.json({status:'completed',output:[{content:[{type:'output_text',text:generateDemo('番茄钟').html}]}]})});
  const old={prompt:'调整页面',mode:'model',projectId,requestId:crypto.randomUUID()};
  const pending=h.server.generate(h.request(old));await started;
  h.sqlite.prepare('UPDATE forma_locks SET expires_at=0 WHERE request_id=?').run(old.requestId);
  const expired=await h.server.route(()=>h.server.generate(h.request(old)));
  assert.equal(expired.status,409);
  assert.equal((await expired.json()).retry,'new');
  assert.equal(h.sqlite.prepare('SELECT status FROM forma_requests WHERE id=?').get(old.requestId).status,'failed');
  const fresh=await (await h.server.generate(h.request({prompt:'改成蓝色主题',mode:'demo',projectId,requestId:crypto.randomUUID()}))).json();
  release();await assert.rejects(pending,e=>e.status===409&&/重新发起/.test(e.message));
  const stored=await h.server.readProject(await owner(h.request(old)),projectId);
  assert.equal(stored.currentVersionId,fresh.project.currentVersionId);
  assert.equal(stored.versions.length,2);
});

test('late worker cannot delete a newer worker lease or publish after losing ownership',async(t)=>{
  const h=await serverHarness();t.after(h.close);
  const initial=await (await h.server.generate(h.request({prompt:'番茄钟',mode:'demo',requestId:crypto.randomUUID()}))).json();
  const projectId=initial.project.id;
  const gates=[];
  t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>gates.push(()=>resolve(Response.json({status:'completed',output:[{content:[{type:'output_text',text:generateDemo('番茄钟').html}]}]})))));
  const old={prompt:'旧修改',mode:'model',projectId,requestId:crypto.randomUUID()};
  const pendingOld=h.server.generate(h.request(old));
  while(gates.length<1)await new Promise(resolve=>setImmediate(resolve));
  const active=await h.server.route(()=>h.server.generate(h.request(old)));
  assert.equal(active.status,409);
  assert.equal((await active.json()).retry,undefined,'A live request must retain its ID');
  h.sqlite.prepare('UPDATE forma_locks SET expires_at=0 WHERE request_id=?').run(old.requestId);
  const fresh={prompt:'新修改',mode:'model',projectId,requestId:crypto.randomUUID()};
  const pendingFresh=h.server.generate(h.request(fresh));
  while(gates.length<2)await new Promise(resolve=>setImmediate(resolve));
  gates[0]();await assert.rejects(pendingOld,e=>e.status===409);
  assert.equal(h.sqlite.prepare('SELECT request_id FROM forma_locks WHERE project_id=?').get(projectId).request_id,fresh.requestId);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,1);
  gates[1]();const result=await (await pendingFresh).json();
  assert.equal(result.project.versions.length,2);
  assert.equal(result.project.versions.at(-1).prompt,'新修改');
});
