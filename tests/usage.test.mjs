import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

async function harness(config={}){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const control={failRead:false};
  function prepare(sql,args=[]){return {bind(...values){return prepare(sql,values)},async first(){if(control.failRead&&sql.startsWith('SELECT id,title')&&sql.includes('AND id=?')){control.failRead=false;throw Error('simulated read failure')}return sqlite.prepare(sql).get(...args)??null},async all(){return {results:sqlite.prepare(sql).all(...args)}},run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}}
  const env={OPENAI_API_KEY:'test-secret-never-return',OPENAI_MODEL:'gpt-6-luna',OPENAI_MODELS:'gpt-6-luna,gpt-5.4-mini',...config,DB:{prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}}};
  const key=crypto.randomUUID();globalThis[key]=env;const cache=new Map();
  async function moduleUrl(file){if(cache.has(file))return cache.get(file);let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);for(const match of [...source.matchAll(/(?:from\s+)(['"])(\.[^'"]+)\1/g)]){const target=new URL(match[2]+'.ts',new URL('../lib/'+file+'.ts',import.meta.url));source=source.replaceAll(match[1]+match[2]+match[1],JSON.stringify(await moduleUrl(target.pathname.split('/lib/').at(-1).replace(/\.ts$/,''))))}const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url}
  const serverUrl=await moduleUrl('forma/server'),usageUrl=await moduleUrl('motes/usage');
  const server=await import(serverUrl),usage=await import(usageUrl),settings=await import(await moduleUrl('motes/settings')),security=await import(await moduleUrl('forma/security')),management=await import(await moduleUrl('motes/management')),demo=await import(await moduleUrl('forma/demo'));delete globalThis[key];
  const routeSource=(await readFile(new URL('../app/api/usage/route.ts',import.meta.url),'utf8')).replaceAll("'@/lib/forma/server'",JSON.stringify(serverUrl)).replaceAll("'@/lib/motes/usage'",JSON.stringify(usageUrl)).replaceAll("'@/lib/forma/security'",JSON.stringify(await moduleUrl('forma/security')));
  const route=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(routeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
  const who=visitor=>config.MOTES_WORKSPACE_VISIBILITY==='shared'?security.SHARED_OWNER:security.digest(visitor.repeat(64));
  async function generate(body,visitor='a'){const req=new Request('https://motes.test/api/generate',{method:'POST',headers:{origin:'https://motes.test',cookie:'forma_session='+visitor.repeat(64),'content-type':'application/json'},body:JSON.stringify(body)});const response=await server.route(()=>server.generate(req));return{status:response.status,data:await response.json()}}
  const snapshot=async(visitor='a')=>usage.readUsage(env.DB,await who(visitor),await security.digest(visitor.repeat(64)));
  const save=async(patch,scope='workspace',selection={})=>settings.saveSettings(env.DB,await who('a'),server.modelName(),{scope,patch,...selection},server.modelNames());
  const success=(model='gpt-6-luna',reported={input_tokens:120,output_tokens:80,total_tokens:200})=>Response.json({status:'completed',model,usage:reported,output:[{content:[{type:'output_text',text:demo.generateDemo('番茄钟').html}]}]});
  return{sqlite,env,control,server,usage,settings,management,route,security,who,generate,snapshot,save,success,close:()=>sqlite.close()};
}

test('configured model allowlist has no secrets and missing key remains honest demo',async t=>{
  const h=await harness();t.after(h.close);assert.deepEqual(h.server.modelNames(),['gpt-6-luna','gpt-5.4-mini']);
  const noKey=await harness({OPENAI_API_KEY:''});t.after(noKey.close);assert.deepEqual(noKey.server.modelNames(),[]);assert.equal(noKey.server.modelName(),null);
  const unsafe=await harness({OPENAI_MODEL:'sk-do-not-expose',OPENAI_MODELS:'sk-do-not-expose'});t.after(unsafe.close);assert.deepEqual(unsafe.server.modelNames(),[]);
  assert.equal((await noKey.generate({mode:'model',prompt:'test',requestId:crypto.randomUUID()})).status,503);
  assert.equal((await noKey.generate({mode:'demo',prompt:'番茄钟',requestId:crypto.randomUUID()})).status,200);
  assert.doesNotMatch(JSON.stringify(await noKey.snapshot()),/test-secret|sk-do-not-expose/);
  assert.equal((await h.route.GET(new Request('https://motes.test/api/usage'))).status,401);
});

test('workspace/project/app model inheritance and explicit allowed request choose the real fetch model',async t=>{
  const h=await harness();t.after(h.close);const who=await h.who('a'),wid=await h.management.initializeWorkspace(who),now=new Date().toISOString(),group=crypto.randomUUID();
  h.sqlite.prepare('INSERT INTO motes_projects(id,workspace_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(group,wid,'模型项目',now,now);
  await h.save({model:'gpt-5.4-mini'});await h.save({model:'gpt-6-luna'},'project',{projectId:group});
  const calls=[];t.mock.method(globalThis,'fetch',async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);assert.equal(options.headers.Authorization,'Bearer test-secret-never-return');return h.success(body.model)});
  const first=await h.generate({mode:'model',prompt:'new',managedProjectId:group,requestId:crypto.randomUUID()});assert.equal(first.status,200);assert.equal(calls[0].model,'gpt-6-luna');
  await h.save({model:'gpt-5.4-mini'},'app',{appId:first.data.project.id});
  const second=await h.generate({mode:'model',prompt:'edit',projectId:first.data.project.id,requestId:crypto.randomUUID()});assert.equal(second.status,200);assert.equal(calls[1].model,'gpt-5.4-mini');assert.equal(second.data.project.versions.at(-1).model,'gpt-5.4-mini');
  assert.equal((await h.generate({mode:'model',model:'gpt-6-luna',prompt:'override',projectId:first.data.project.id,requestId:crypto.randomUUID()})).status,200);assert.equal(calls[2].model,'gpt-6-luna');
  for(const bad of ['gpt-6-astra','arbitrary','sk-fake'])assert.equal((await h.generate({mode:'model',model:bad,prompt:'test',requestId:crypto.randomUUID()})).status,400);
  await assert.rejects(h.save({model:'arbitrary'}),e=>e.status===400);
  assert.equal(calls.length,3);const usage=await h.snapshot();assert.equal(usage.quota.model.used,3);assert.equal(usage.tokens.total,600);assert.equal(usage.tokens.coverage,'complete');assert.doesNotMatch(JSON.stringify(usage),/test-secret|Bearer|new|override/);
});

test('removed model preference falls back visibly and legacy request fingerprint/retry is unchanged',async t=>{
  const h=await harness();t.after(h.close);await h.management.initializeWorkspace(await h.who('a'));await h.save({model:'gpt-5.4-mini'});
  h.env.OPENAI_MODELS='gpt-6-luna';
  const prefs=await h.settings.readSettings(h.env.DB,await h.who('a'),h.server.modelName(),{},h.server.modelNames());assert.equal(prefs.effective.model,'gpt-6-luna');assert.equal(prefs.sources.model,'server');
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});
  const body={mode:'model',prompt:'legacy prompt',requestId:crypto.randomUUID()},result=await h.generate(body);assert.equal(result.status,200);
  const expected=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([body.prompt,body.mode,null,null])));assert.equal(h.sqlite.prepare('SELECT fingerprint FROM forma_requests WHERE id=?').get(body.requestId).fingerprint,Buffer.from(expected).toString('hex'));
  const retry=await h.generate(body);assert.equal(retry.data.project.id,result.data.project.id);assert.equal(calls,1);assert.equal((await h.snapshot()).items.length,1);
  assert.equal((await h.generate({...body,model:'gpt-6-luna'})).status,409);
});

test('timeout/error usage stays unknown while failed attempts consume the same daily budget',async t=>{
  const h=await harness();t.after(h.close);t.mock.method(globalThis,'fetch',async()=>{throw new DOMException('timeout','TimeoutError')});
  for(let n=0;n<10;n++)assert.equal((await h.generate({mode:'model',prompt:'failed',requestId:crypto.randomUUID()})).status,504);
  const denied=await h.generate({mode:'model',prompt:'eleventh',requestId:crypto.randomUUID()});assert.equal(denied.status,429);
  const data=await h.snapshot();assert.equal(data.quota.model.used,10);assert.equal(data.quota.model.remaining,0);assert.equal(data.outcomes.failed,10);assert.equal(data.tokens.total,null);assert.equal(data.tokens.coverage,'unknown');assert.ok(data.items.every(r=>r.inputTokens===null&&r.errorCode==='timeout'));
  assert.equal(data.tokens.recordedCalls,10);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_model_usage').get().n,10);
});

test('incomplete output retains actual usage, explicit zero counts stay known, and owner scope excludes other activity',async t=>{
  const h=await harness();t.after(h.close);let count=0;t.mock.method(globalThis,'fetch',async()=>{count++;if(count===1)return Response.json({status:'incomplete',model:'gpt-6-luna',usage:{input_tokens:5,output_tokens:7,total_tokens:12}});return h.success('gpt-6-luna',{input_tokens:0,output_tokens:0,total_tokens:0})});
  assert.equal((await h.generate({mode:'model',prompt:'incomplete',requestId:crypto.randomUUID()})).status,502);
  assert.equal((await h.generate({mode:'model',prompt:'zero',requestId:crypto.randomUUID()})).status,200);
  assert.equal((await h.generate({mode:'model',prompt:'other',requestId:crypto.randomUUID()},'b')).status,200);
  const own=await h.snapshot();assert.equal(own.items.length,2);assert.equal(own.tokens.total,12);assert.equal(own.tokens.knownRecords,2);assert.equal(own.tokens.coverage,'complete');assert.equal(own.outcomes.failed,1);assert.equal(own.items.find(i=>i.status==='failed').errorCode,'output');
  const other=await h.snapshot('b');assert.equal(other.items.length,1);assert.equal(other.tokens.total,0);assert.equal(other.quota.model.used,1);
  const response=await h.route.GET(new Request('https://motes.test/api/usage',{headers:{cookie:'forma_session='+'b'.repeat(64)}}));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).items.length,1);
});

test('partial or malformed reported counts stay nullable and provider errors expose only safe status',async t=>{
  const h=await harness();t.after(h.close);let n=0;
  t.mock.method(globalThis,'fetch',async()=>{n++;return n===1?h.success('gpt-6-luna',{input_tokens:9,output_tokens:-2,total_tokens:null}):Response.json({error:{code:'insufficient_quota',message:'NEVER_EXPOSE_PROVIDER_DETAIL'}},{status:429})});
  assert.equal((await h.generate({mode:'model',prompt:'PRIVATE_PROMPT',requestId:crypto.randomUUID()})).status,200);
  const failed=await h.generate({mode:'model',prompt:'PRIVATE_PROMPT',requestId:crypto.randomUUID()});assert.equal(failed.status,429);assert.doesNotMatch(JSON.stringify(failed),/NEVER_EXPOSE|test-secret/);
  const data=await h.snapshot();assert.equal(data.tokens.input,9);assert.equal(data.tokens.output,null);assert.equal(data.tokens.total,null);assert.equal(data.tokens.coverage,'partial');assert.equal(data.tokens.knownRecords,0);assert.equal(data.items.find(i=>i.status==='failed').errorCode,'quota');assert.doesNotMatch(JSON.stringify(data),/PRIVATE_PROMPT|NEVER_EXPOSE|test-secret|Bearer/);
});

test('post-commit read failure preserves succeeded usage and retry does not consume another call',async t=>{
  const h=await harness();t.after(h.close);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;h.control.failRead=true;return h.success()});
  const body={mode:'model',prompt:'save then read fails',requestId:crypto.randomUUID()};assert.equal((await h.generate(body)).status,500);
  assert.equal((await h.snapshot()).items[0].status,'succeeded');assert.equal((await h.snapshot()).tokens.total,200);
  assert.equal((await h.generate(body)).status,200);assert.equal(calls,1);assert.equal((await h.snapshot()).quota.model.used,1);
});

test('legacy model attempts show coverage gaps and manual/fork/import/demo never masquerade as model usage',async t=>{
  const h=await harness();t.after(h.close);const who=await h.who('a'),now=new Date().toISOString(),day=now.slice(0,10);
  for(const mode of ['model','manual','fork','backup-import'])h.sqlite.prepare('INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),who,'old-app','fingerprint',day,mode,'done',now);
  assert.equal((await h.generate({mode:'demo',prompt:'番茄钟',requestId:crypto.randomUUID()})).status,200);
  const result=await h.snapshot();assert.equal(result.quota.model.used,1);assert.equal(result.quota.demo.used,1);assert.equal(result.tokens.recordedCalls,0);assert.equal(result.tokens.total,null);assert.equal(result.tokens.coverage,'unknown');assert.equal(result.items.length,0);
  const migration=await readFile(new URL('../drizzle/0006_model_usage.sql',import.meta.url),'utf8');assert.ok(migration.replace(/--[^\r\n]*/g,'').split(';').map(v=>v.trim()).filter(Boolean).every(s=>/^CREATE (?:TABLE|INDEX)/.test(s)));
});

test('shared visitors read and modify the same app while legacy private records stay inaccessible',async t=>{
 const h=await harness({MOTES_WORKSPACE_VISIBILITY:'shared',OPENAI_API_KEY:''});t.after(h.close);
 const body={mode:'demo',prompt:'番茄钟',requestId:crypto.randomUUID()},first=await h.generate(body,'a');assert.equal(first.status,200);
 const same=await h.generate(body,'b');assert.equal(same.status,200);assert.equal(same.data.project.id,first.data.project.id);
 const modified=await h.generate({mode:'demo',prompt:'改成蓝色主题',projectId:first.data.project.id,requestId:crypto.randomUUID()},'b');assert.equal(modified.status,200);assert.equal(modified.data.project.versions.length,2);
 assert.equal((await h.server.listProjects(h.security.SHARED_OWNER)).length,1);
 const privateOwner=await h.security.digest('c'.repeat(64)),oldId=crypto.randomUUID(),oldVersion=crypto.randomUUID(),now=new Date().toISOString();
 h.sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(oldId,privateOwner,'OLD PRIVATE',now,now,oldVersion);
 h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(oldVersion,oldId,1,'OLD PRIVATE PROMPT','private','<!doctype html><html><body>old</body></html>',now,'manual',null);
 await assert.rejects(h.server.readProject(h.security.SHARED_OWNER,oldId),{status:404});
 assert.equal((await h.generate({mode:'demo',prompt:'改成蓝色主题',projectId:oldId,requestId:crypto.randomUUID()},'c')).status,404);
 assert.equal((await h.server.listProjects(h.security.SHARED_OWNER)).length,1);
 assert.equal(h.sqlite.prepare('SELECT owner FROM forma_projects WHERE id=?').get(oldId).owner,privateOwner);
 const snapshot=await h.snapshot('b');assert.equal(snapshot.limits.visitor.demo.used,1);assert.equal(snapshot.limits.shared.demo.used,2);assert.equal(snapshot.limits.global.demo.used,2);
});
test('shared daily model cap cannot be reset by cookie rotation and original request recovery stays free',async t=>{
 const h=await harness({MOTES_WORKSPACE_VISIBILITY:'shared'});t.after(h.close);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.success()});
 const original={mode:'model',prompt:'test',requestId:crypto.randomUUID()},first=await h.generate(original,'a');assert.equal(first.status,200);
 for(let i=1;i<10;i++)assert.equal((await h.generate({mode:'model',prompt:'test',requestId:crypto.randomUUID()},i%2?'b':'a')).status,200);
 assert.equal((await h.generate({mode:'model',prompt:'denied',requestId:crypto.randomUUID()},'c')).status,429);
 const recovered=await h.generate(original,'c');assert.equal(recovered.status,200);assert.equal(recovered.data.project.id,first.data.project.id);assert.equal(calls,10);
 const usage=await h.snapshot('c');assert.equal(usage.limits.visitor.model.used,0);assert.equal(usage.limits.shared.model.used,10);assert.equal(usage.limits.global.model.used,10);assert.equal(usage.quota.model.remaining,0);
 assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests WHERE visitor_id IS NOT NULL').get().n,10);
 assert.doesNotMatch(JSON.stringify(usage),/test-secret-never-return|forma_session|PRIVATE/);
});
test('shared reservation retains legacy visitor spend, global spend and atomic candidate units',async t=>{
 const h=await harness({MOTES_WORKSPACE_VISIBILITY:'shared'});t.after(h.close);const now=new Date().toISOString(),day=now.slice(0,10),actor=await h.security.digest('a'.repeat(64));
 const insert=h.sqlite.prepare('INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at) VALUES(?,?,?,?,?,?,?,?)');
 for(let i=0;i<9;i++)insert.run(crypto.randomUUID(),actor,'legacy','legacy',day,'model','failed',now);
 const reserve=(visitorId,units=1)=>h.usage.budgetReservation(h.env.DB,{id:crypto.randomUUID(),owner:h.security.SHARED_OWNER,visitorId,projectId:crypto.randomUUID(),fingerprint:'x',mode:'model',createdAt:now,units}).run().meta.changes;
 assert.equal(reserve(actor,2),0);assert.equal(reserve(actor),1);assert.equal(reserve(actor),0);
 const b=await h.security.digest('b'.repeat(64));assert.equal(reserve(b,4),1);
 for(let i=10;i<49;i++)insert.run(crypto.randomUUID(),'historical-private','legacy','legacy',day,'model','failed',now);
 assert.equal(reserve(b,2),0); // 11 actual rows + 39 legacy rows already reach the global cap.
 const usage=await h.snapshot('a');assert.equal(usage.limits.visitor.model.used,10);assert.equal(usage.limits.shared.model.used,2);assert.equal(usage.limits.global.model.used,50);assert.equal(usage.quota.model.remaining,0);
});
