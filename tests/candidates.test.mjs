import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

async function harness(config={}){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const control={beforeBatch:null};function prepare(sql,args=[]){return{sql,bind(...values){return prepare(sql,values)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return{results:sqlite.prepare(sql).all(...args)}},run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}}
  const env={OPENAI_API_KEY:'fake-test-only',OPENAI_MODEL:'gpt-6-luna',OPENAI_MODELS:'gpt-6-luna,gpt-5.4-mini',...config,DB:{prepare,async batch(statements){if(control.beforeBatch){const action=control.beforeBatch;control.beforeBatch=null;action(statements)}sqlite.exec('BEGIN');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}}};
  const key=crypto.randomUUID();globalThis[key]=env;const cache=new Map();async function urlFor(file){if(cache.has(file))return cache.get(file);let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);for(const match of [...source.matchAll(/(?:from\s+)(['"])(\.[^'"]+)\1/g)]){const target=new URL(match[2]+'.ts',new URL('../lib/'+file+'.ts',import.meta.url));source=source.replaceAll(match[1]+match[2]+match[1],JSON.stringify(await urlFor(target.pathname.split('/lib/').at(-1).replace(/\.ts$/,''))))}const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');cache.set(file,url);return url}
  const tools=await import(await urlFor('motes/candidates')),server=await import(await urlFor('forma/server')),management=await import(await urlFor('motes/management')),security=await import(await urlFor('forma/security')),demo=await import(await urlFor('forma/demo'));delete globalThis[key];
  const who=visitor=>security.digest(visitor.repeat(64));
  async function seed(visitor='a') {const owner=await who(visitor),wid=await management.initializeWorkspace(owner),id=crypto.randomUUID(),version=crypto.randomUUID(),now=new Date().toISOString();sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,owner,'手动应用名',now,now,version);sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(version,id,1,'原需求','原摘要',demo.generateDemo('番茄钟').html,now,'demo',null);await management.initializeWorkspace(owner);return{id,version,owner,wid,target:`project:${owner}`}}
  async function call(action,body,visitor='a',origin='https://motes.test'){const req=new Request('https://motes.test/api/candidates',{method:body?'POST':'GET',headers:{cookie:'forma_session='+visitor.repeat(64),...body?{origin,'content-type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}});const response=await server.route(()=>action(req));return{status:response.status,data:await response.json()}}
  const create=(body,visitor='a',origin)=>call(req=>tools.createCandidates(req),body,visitor,origin),read=(id,visitor='a')=>call(req=>tools.getCandidates(req,id),null,visitor),adopt=(groupId,candidateId,asNew=false,visitor='a')=>call(req=>tools.adoptCandidate(req,groupId),{candidateId,asNew},visitor);
  const success=(title='候选')=>Response.json({status:'completed',model:'gpt-6-luna',usage:{input_tokens:10,output_tokens:20,total_tokens:30},output:[{content:[{type:'output_text',text:demo.generateDemo('番茄钟').html.replace(/<title>.*?<\/title>/,'<title>'+title+'</title>')}]}]});
  const generate=body=>call(req=>server.generate(req),body);
  const retry=(groupId,body,visitor='a')=>call(req=>tools.retryCandidate(req,groupId),body,visitor);
  return{retry,sqlite,control,env,who,tools,server,seed,create,read,adopt,generate,success,close:()=>sqlite.close()};
}
const body=(extra={})=>({requestId:crypto.randomUUID(),prompt:'生成计时工具',mode:'model',confirmTwoCalls:true,...extra});
async function fillApps(h,count){const who=await h.who('a'),now=new Date().toISOString();while(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects WHERE owner=?').get(who).n<count){const id=crypto.randomUUID(),version=crypto.randomUUID();h.sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,who,'已有作品',now,now,version);h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(version,id,1,'原需求','原摘要','<!doctype html><html><body>existing</body></html>',now,'manual',null);}}
function oldRequests(h,n,who,mode='model'){const now=new Date().toISOString();for(let i=0;i<n;i++)h.sqlite.prepare('INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),who,'old','old',now.slice(0,10),mode,'failed',now)}

test('two model candidates reserve two real usage records and never overwrite the source before adoption',async t=>{
  const h=await harness();t.after(h.close);const app=await h.seed();let calls=0;const prompts=[];t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;const sent=JSON.parse(options.body);prompts.push(sent.instructions);assert.equal(sent.model,'gpt-6-luna');return h.success('方案'+calls)});
  const input=body({appId:app.id,baseVersionId:app.version}),result=await h.create(input);assert.equal(result.status,201);const group=result.data.group;assert.equal(calls,2);assert.equal(group.candidates.length,2);assert.ok(group.candidates.every(c=>c.status==='ready'));assert.notEqual(prompts[0],prompts[1]);
  assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get(app.id).current_version_id,app.version);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,1);
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM forma_requests WHERE mode='model'").get().n,2);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM motes_model_usage WHERE operation='candidate' AND status='succeeded'").get().n,2);
  const retry=await h.create(input);assert.equal(retry.status,200);assert.equal(retry.data.group.id,group.id);assert.equal(calls,2);assert.equal((await h.read(group.id)).data.group.candidates[0].html,group.candidates[0].html);
  assert.equal((await h.read(group.id,'b')).status,404);assert.equal((await h.create({...input,prompt:'changed'})).status,409);
});

test('one remaining visitor or global slot rejects both reservations before any fetch',async t=>{
  for(const scope of ['visitor','global']){const h=await harness();try{oldRequests(h,scope==='visitor'?9:49,await h.who(scope==='visitor'?'a':'b'));let calls=0;const mocked=t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});const before=h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n;const result=await h.create(body());assert.equal(result.status,429);assert.equal(calls,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,before);for(const table of ['motes_candidate_groups','motes_candidates','motes_model_usage','forma_locks'])assert.equal(h.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);mocked.mock.restore()}finally{h.close()}}
});

test('concurrent duplicate retries and competing final-two slots never call extra models',async t=>{
  const h=await harness();t.after(h.close);oldRequests(h,8,await h.who('a'));let calls=0;const gates=[];t.mock.method(globalThis,'fetch',()=>{calls++;return new Promise(resolve=>gates.push(()=>resolve(h.success())))});
  const input=body(),pending=h.create(input);for(let n=0;gates.length<2&&n<500;n++)await new Promise(r=>setImmediate(r));assert.equal(gates.length,2);
  const retry=await h.create(input);assert.equal(retry.status,200);assert.ok(retry.data.group.candidates.every(c=>c.status==='running'));assert.equal((await h.create(body())).status,429);assert.equal(calls,2);
  gates.forEach(run=>run());assert.equal((await pending).status,201);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM forma_requests WHERE mode='model'").get().n,10);
});

test('partial failure remains selectable, failure usage stays unknown, and no retry is automatic',async t=>{
  const h=await harness();t.after(h.close);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;if(calls===2)throw new DOMException('timeout','TimeoutError');return h.success()});
  const input=body(),result=await h.create(input),group=result.data.group;assert.equal(result.status,201);assert.deepEqual(group.candidates.map(c=>c.status),['ready','failed']);
  assert.equal((await h.adopt(group.id,group.candidates[1].id)).status,409);assert.equal((await h.adopt(group.id,group.candidates[0].id)).status,201);await h.create(input);assert.equal(calls,2);
  const failed=h.sqlite.prepare("SELECT input_tokens,total_tokens,status FROM motes_model_usage WHERE status='failed'").get();assert.equal(failed.total_tokens,null);assert.equal(failed.input_tokens,null);
});

test('adoption is idempotent, fences changed current versions and supports explicit private copy resolution',async t=>{
  const h=await harness();t.after(h.close);const app=await h.seed();t.mock.method(globalThis,'fetch',async()=>h.success());const group=(await h.create(body({appId:app.id,baseVersionId:app.version}))).data.group;
  const adopted=await h.adopt(group.id,group.candidates[0].id);assert.equal(adopted.status,201);assert.equal(adopted.data.appId,app.id);assert.equal(h.sqlite.prepare('SELECT title FROM forma_projects WHERE id=?').get(app.id).title,'手动应用名');
  const retry=await h.adopt(group.id,group.candidates[0].id);assert.equal(retry.status,200);assert.deepEqual(retry.data,adopted.data);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions WHERE project_id=?').get(app.id).n,2);
  assert.equal((await h.adopt(group.id,group.candidates[1].id)).status,409);const copy=await h.adopt(group.id,group.candidates[1].id,true);assert.equal(copy.status,201);assert.notEqual(copy.data.appId,app.id);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions WHERE project_id=?').get(copy.data.appId).n,1);assert.equal((await h.read(group.id)).data.group.candidates[1].adoptedAppId,copy.data.appId);
});

test('adoption transaction rechecks locks, ownership, archive and capacity while preserving candidates on rejection',async t=>{
  const h=await harness();t.after(h.close);const app=await h.seed();t.mock.method(globalThis,'fetch',async()=>h.success());const group=(await h.create(body({appId:app.id,baseVersionId:app.version}))).data.group,candidate=group.candidates[0];
  h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(app.id,'other',Date.now()+60000);assert.equal((await h.adopt(group.id,candidate.id)).status,409);h.sqlite.prepare('DELETE FROM forma_locks').run();
  h.sqlite.prepare('UPDATE motes_projects SET archived=1 WHERE id=?').run(app.target);assert.equal((await h.adopt(group.id,candidate.id)).status,409);h.sqlite.prepare('UPDATE motes_projects SET archived=0 WHERE id=?').run(app.target);
  const now=new Date().toISOString();for(let n=2;n<=60;n++)h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),app.id,n,'x','x',candidate.html,now,'demo',null);assert.equal((await h.adopt(group.id,candidate.id)).status,409);
  assert.equal((await h.read(group.id)).data.group.candidates[0].html,candidate.html);assert.equal((await h.adopt(group.id,candidate.id,false,'b')).status,404);assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get(app.id).current_version_id,app.version);
});

test('storage failure during adoption rolls back everything and retries do not call the model',async t=>{
  const h=await harness();t.after(h.close);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});const group=(await h.create(body())).data.group;
  h.sqlite.exec("CREATE TRIGGER fail_adopt BEFORE INSERT ON forma_versions BEGIN SELECT RAISE(ABORT,'simulated adoption failure'); END");assert.equal((await h.adopt(group.id,group.candidates[0].id)).status,500);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,0);assert.equal((await h.read(group.id)).data.group.candidates[0].adoptedAppId,null);
  h.sqlite.exec('DROP TRIGGER fail_adopt');assert.equal((await h.adopt(group.id,group.candidates[0].id)).status,201);assert.equal(calls,2);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('late source mutation inside adoption transaction is fenced and concurrent last-slot copies create only one app',async t=>{
  const h=await harness();t.after(h.close);const app=await h.seed();t.mock.method(globalThis,'fetch',async()=>h.success());
  const group=(await h.create(body({appId:app.id,baseVersionId:app.version}))).data.group;
  const newer=crypto.randomUUID(),now=new Date().toISOString();h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(newer,app.id,2,'new','new',group.candidates[0].html,now,'manual',null);
  h.control.beforeBatch=()=>h.sqlite.prepare('UPDATE forma_projects SET current_version_id=? WHERE id=?').run(newer,app.id);
  assert.equal((await h.adopt(group.id,group.candidates[0].id)).status,409);assert.equal((await h.read(group.id)).data.group.candidates[0].adoptedAppId,null);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions WHERE project_id=?').get(app.id).n,2);
  while(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n<99){const id=crypto.randomUUID(),v=crypto.randomUUID();h.sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,app.owner,'existing',now,now,v);h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(v,id,1,'old','old',group.candidates[0].html,now,'demo',null)}
  const copies=await Promise.all(group.candidates.map(c=>h.adopt(group.id,c.id,true)));assert.deepEqual(copies.map(c=>c.status).sort(),[201,409]);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,100);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('candidate save failure affects one peer only and retains paid usage without automatic model retry',async t=>{
  const h=await harness();t.after(h.close);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});
  h.sqlite.exec("CREATE TRIGGER fail_peer BEFORE UPDATE ON motes_candidates WHEN NEW.slot=1 AND NEW.status='ready' BEGIN SELECT RAISE(ABORT,'simulated peer storage failure'); END");
  const input=body(),result=await h.create(input);assert.equal(result.status,201);assert.deepEqual(result.data.group.candidates.map(c=>c.status),['ready','failed']);assert.equal(result.data.group.candidates[1].errorCode,'storage');assert.equal(h.sqlite.prepare("SELECT total_tokens FROM motes_model_usage WHERE status='failed'").get().total_tokens,30);await h.create(input);assert.equal(calls,2);
});

test('no-key demo has two honest preset outputs, no paid usage and rejects unsafe inputs before reserving',async t=>{
  const h=await harness({OPENAI_API_KEY:''});t.after(h.close);t.mock.method(globalThis,'fetch',()=>{throw Error('Demo must not fetch')});
  assert.equal((await h.create(body())).status,503);assert.equal((await h.create(body({mode:'demo',prompt:'番茄钟',confirmTwoCalls:false}))).status,400);assert.equal((await h.create(body({mode:'demo',prompt:'番茄钟',count:4}))).status,400);assert.equal((await h.create(body({mode:'demo',prompt:'番茄钟'}),'a','https://evil.test')).status,403);
  const result=await h.create(body({mode:'demo',prompt:'番茄钟'}));assert.equal(result.status,201);const group=result.data.group;assert.equal(group.mode,'demo');assert.equal(group.reservedModelCalls,0);assert.notEqual(group.candidates[0].html,group.candidates[1].html);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_model_usage').get().n,0);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM forma_requests WHERE mode='demo'").get().n,2);
  const page=await readFile(new URL('../app/compare/page.tsx',import.meta.url),'utf8');assert.match(page,/sandbox="allow-scripts allow-forms"/);assert.doesNotMatch(page,/sandbox="[^"]*(?:allow-same-origin|allow-top-navigation|allow-popups)/);assert.match(page,/safeDocument\(candidate\.html,PREVIEW_POLICY\)/);const policy=await readFile(new URL('../lib/motes/preview-document.ts',import.meta.url),'utf8');assert.match(policy,/form-action 'none'/);
  const migration=await readFile(new URL('../drizzle/0007_generation_candidates.sql',import.meta.url),'utf8');assert.ok(migration.replace(/--[^\r\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean).every(s=>/^CREATE (?:TABLE|(?:UNIQUE )?INDEX)/.test(s)));
});

test('candidate adoption can fill the last slot during generation without a 101st app or dangling generation rows',async t=>{
  const h=await harness();t.after(h.close);
  const group=(await h.create(body({mode:'demo',prompt:'番茄钟'}))).data.group;
  await fillApps(h,99);let calls=0,finish;
  t.mock.method(globalThis,'fetch',()=>{calls++;return new Promise(resolve=>{finish=()=>resolve(h.success())})});
  const input={requestId:crypto.randomUUID(),mode:'model',prompt:'番茄钟',managedProjectId:group.managedProjectId},pending=h.generate(input);
  for(let n=0;!finish&&n<500;n++)await new Promise(r=>setImmediate(r));assert.ok(finish);
  const adopted=await h.adopt(group.id,group.candidates[0].id);assert.equal(adopted.status,201);finish();
  const result=await pending;assert.equal(result.status,409);assert.equal(result.data.retry,'new');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,100);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,100);
  const rejected=h.sqlite.prepare('SELECT * FROM forma_requests WHERE id=?').get(input.requestId);assert.equal(rejected.status,'failed');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects WHERE id=?').get(rejected.project_id).n,0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_apps WHERE app_id=?').get(rejected.project_id).n,0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_locks').get().n,0);
  assert.equal((await h.generate(input)).status,409);assert.equal(calls,1);
  assert.equal(h.sqlite.prepare('SELECT status FROM motes_model_usage WHERE request_id=?').get(input.requestId).status,'failed');
  const saved=await h.server.readProject(await h.who('a'),adopted.data.appId);assert.equal(saved.currentVersionId,adopted.data.versionId);assert.equal(saved.versions.length,1);
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('generation rejects changed pointer or newly full capacity before model calls and budget reservation',async t=>{
  for(const changed of ['pointer','capacity']){const h=await harness();try{
    const app=await h.seed();if(changed==='capacity')await fillApps(h,99);
    const input={requestId:crypto.randomUUID(),mode:'model',prompt:'番茄钟',...changed==='pointer'?{projectId:app.id}:{}};
    let expected=app.version;
    h.control.beforeBatch=()=>{if(changed==='pointer'){expected=crypto.randomUUID();const now=new Date().toISOString();h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(expected,app.id,2,'手工更新','手工更新','<!doctype html><html><body>new</body></html>',now,'manual',null);h.sqlite.prepare('UPDATE forma_projects SET current_version_id=? WHERE id=?').run(expected,app.id);}else {const id=crypto.randomUUID(),version=crypto.randomUUID();h.sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,app.owner,'并发副本','now','now',version);h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(version,id,1,'并发','并发','<!doctype html><html><body>copy</body></html>','now','manual',null);}};
    let calls=0;const mocked=t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});
    const result=await h.generate(input);assert.equal(result.status,409);assert.equal(result.data.retry,'new');assert.equal(calls,0);mocked.mock.restore();
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_model_usage').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_locks').get().n,0);
    assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get(app.id).current_version_id,expected);
  }finally{h.close()}}
});

test('generation admits the final available slot with complete version, metadata and idempotent receipt',async t=>{
  const h=await harness();t.after(h.close);const app=await h.seed();await fillApps(h,99);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});
  const input={requestId:crypto.randomUUID(),mode:'model',prompt:'番茄钟',managedProjectId:app.target},result=await h.generate(input);assert.equal(result.status,200);
  const saved=result.data.project;assert.equal(saved.versions.length,1);assert.equal(saved.currentVersionId,saved.versions[0].id);
  assert.equal(h.sqlite.prepare('SELECT project_id FROM motes_apps WHERE app_id=?').get(saved.id).project_id,app.target);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,100);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,100);
  assert.equal((await h.generate(input)).status,200);assert.equal(calls,1);assert.equal(h.sqlite.prepare('SELECT status FROM forma_requests WHERE id=?').get(input.requestId).status,'done');
});

test('explicit 2/3/4 groups reserve the entire count before independent calls and recover without charge',async t=>{
  for(const count of [2,3,4]){const h=await harness();try{let calls=0;const mocked=t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});const input=body({count,confirmCalls:count});const result=await h.create(input);assert.equal(result.status,201);assert.equal(result.data.group.count,count);assert.equal(result.data.group.candidates.length,count);assert.equal(result.data.group.reservedModelCalls,count);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,count);assert.equal((await h.create(input)).status,200);assert.equal(calls,count);assert.equal((await h.create({...input,count:count===4?3:4,confirmCalls:count===4?3:4})).status,409);mocked.mock.restore();}finally{h.close()}}
});
test('insufficient count rejects atomically and explicit count requires matching confirmation',async t=>{
 const h=await harness();t.after(h.close);oldRequests(h,7,await h.who('a'));t.mock.method(globalThis,'fetch',()=>{throw Error('must not call')});assert.equal((await h.create(body({count:4,confirmCalls:4}))).status,429);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,7);for(const input of [{count:3},{count:4,confirmCalls:2},{count:5,confirmCalls:5}])assert.equal((await h.create(body(input))).status,400);
});

test('single failed lane retry has stable receipt, new budget and does not touch successful peers',async t=>{
 const h=await harness();t.after(h.close);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;if(calls===2)throw new DOMException('timeout','TimeoutError');return h.success()});const group=(await h.create(body({count:3,confirmCalls:3}))).data.group,failed=group.candidates[1],good=group.candidates[0];const retry={requestId:crypto.randomUUID(),candidateId:failed.id,previousAttemptId:failed.attemptId,confirmOneCall:true};assert.equal((await h.retry(group.id,retry,'b')).status,404);const result=await h.retry(group.id,retry);assert.equal(result.status,201);assert.equal(calls,4);assert.equal(result.data.group.candidates[1].id,failed.id);assert.equal(result.data.group.candidates[1].status,'ready');assert.equal(result.data.group.candidates[0].html,good.html);assert.equal((await h.retry(group.id,retry)).status,200);assert.equal(calls,4);assert.equal((await h.retry(group.id,{...retry,requestId:crypto.randomUUID()})).status,409);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,4);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_candidate_attempts').get().n,1);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('retry CAS admits only one concurrent attempt, rejects unresolved peers and stale source state without spending',async t=>{
 const h=await harness();t.after(h.close);let fail=true,finish,calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;if(fail)throw new DOMException('timeout','TimeoutError');return new Promise(resolve=>{finish=()=>resolve(h.success())})});const app=await h.seed(),group=(await h.create(body({appId:app.id,baseVersionId:app.version}))).data.group,candidate=group.candidates[0],retry={requestId:crypto.randomUUID(),candidateId:candidate.id,previousAttemptId:candidate.attemptId,confirmOneCall:true};
 h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(app.id,'other',Date.now()+60000);assert.equal((await h.retry(group.id,retry)).status,409);h.sqlite.prepare('DELETE FROM forma_locks').run();assert.equal(calls,2);
 fail=false;const pending=h.retry(group.id,retry);for(let n=0;!finish&&n<500;n++)await new Promise(r=>setImmediate(r));assert.ok(finish);assert.equal((await h.retry(group.id,retry)).status,200);assert.equal((await h.retry(group.id,{...retry,requestId:crypto.randomUUID()})).status,409);assert.equal(calls,3);h.sqlite.prepare('UPDATE forma_locks SET expires_at=0').run();assert.equal((await h.read(group.id)).data.group.candidates[0].status,'unresolved');assert.equal((await h.retry(group.id,{...retry,requestId:crypto.randomUUID(),previousAttemptId:retry.requestId})).status,409);finish();await pending;assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,3);
});
