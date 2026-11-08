import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

async function harness({key=true}={}) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort()) sqlite.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const control={beforeBatch:null,failSnapshot:false};
  function prepare(sql,args=[]) { return {isDiscuss:sql.startsWith('INSERT INTO forma_locks')&&sql.includes('motes_discussion_threads'),bind(...values){return prepare(sql,values)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){if(control.failSnapshot&&sql.includes('SELECT t.*,r.status')){control.failSnapshot=false;throw Error('simulated read outage')}return{results:sqlite.prepare(sql).all(...args)}},run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}; }
  const env={OPENAI_API_KEY:key?'fake-test-key':'',OPENAI_MODEL:'fake-model',OPENAI_MODELS:'fake-model,another-model',DB:{prepare,async batch(statements){if(control.beforeBatch&&statements.some(s=>s.isDiscuss)){const run=control.beforeBatch;control.beforeBatch=null;run()}sqlite.exec('BEGIN');try{const r=statements.map(s=>s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}};
  const envKey=crypto.randomUUID();globalThis[envKey]=env;const cache=new Map();
  // Short file URLs keep fixture-isolated ESM imports linear in source size. Recursively
  // embedded base64 dependency URLs otherwise retain hundreds of MiB in Node's ESM cache.
  const tempRoot=await mkdtemp(join(tmpdir(),'motes-discussion-test-'));
  async function moduleUrl(file){
    if(cache.has(file))return cache.get(file);
    let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');
    source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(envKey)}];`);
    for(const declaration of ts.createSourceFile('module.ts',source,ts.ScriptTarget.Latest,true).statements.filter(n=>(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier).toReversed()){if(declaration.importClause?.isTypeOnly||declaration.isTypeOnly)continue;const spec=declaration.moduleSpecifier.text;const resolved=spec.startsWith('.')?await moduleUrl((new URL(spec+'.ts',new URL('../lib/'+file+'.ts',import.meta.url))).pathname.split('/lib/').at(-1).replace(/\.ts$/,'')):import.meta.resolve(spec);source=source.slice(0,declaration.moduleSpecifier.getStart())+JSON.stringify(resolved)+source.slice(declaration.moduleSpecifier.end);}
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const output=join(tempRoot,file+'.mjs');await mkdir(dirname(output),{recursive:true});await writeFile(output,js);
    const url=pathToFileURL(output).href;cache.set(file,url);return url;
  }
  const discussions=await import(await moduleUrl('motes/discussions')),server=await import(await moduleUrl('forma/server')),security=await import(await moduleUrl('forma/security')),usage=await import(await moduleUrl('motes/usage')),model=await import(await moduleUrl('forma/discussion-model')),tasks=await import(await moduleUrl('motes/tasks'));delete globalThis[envKey];
  const who=v=>security.digest(v.repeat(64));
  function req(body,visitor='a',query='',origin='https://motes.test'){return new Request('https://motes.test/api/discussions'+query,{method:body?'POST':'GET',headers:{cookie:'forma_session='+visitor.repeat(64),...(body?{origin,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}
  async function run(fn){const r=await server.route(fn);return{status:r.status,data:await r.json()}}
  const create=(body={},visitor='a')=>run(()=>discussions.createDiscussionThread(req({threadId:crypto.randomUUID(),...body},visitor)));
  const get=(query='',visitor='a')=>run(()=>discussions.getDiscussions(req(undefined,visitor,query)));
  const send=(threadId,body={},visitor='a',origin)=>run(()=>discussions.sendDiscussion(req({threadId,prompt:'请先讨论产品的交互方向',requestId:crypto.randomUUID(),...body},visitor,'',origin)));
  const status=(id,visitor='a')=>run(()=>discussions.discussionRequestStatus(req(undefined,visitor),id));
  const save=(id,visitor='a')=>run(()=>discussions.saveDiscussionResult(req({},visitor),id)),saveTask=(id,visitor='a')=>run(()=>tasks.saveTask(req({},visitor),id)),listTasks=()=>run(()=>tasks.listTasks(req()));
  const attach=(threadId,appId,visitor='a')=>run(()=>discussions.attachDiscussion(req({appId},visitor),threadId));
  async function app(visitor='a',html='<!doctype html><html><head><title>Current</title></head><body><button>OWN SAVED CODE</button></body></html>'){const owner=await who(visitor),id=crypto.randomUUID(),version=crypto.randomUUID(),now=new Date().toISOString();sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,owner,'App',now,now,version);sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(version,id,1,'SECRET BUILD PROMPT','summary',html,now,'manual',null);return{id,version,owner}}
  function answer(text='这是讨论回答，不会修改应用。',counts={input_tokens:10,output_tokens:20,total_tokens:30}){return Response.json({status:'completed',model:'fake-model',usage:counts,output:[{content:[{type:'output_text',text}]}]})}
  function budget(owner,count){const day=new Date().toISOString().slice(0,10);for(let i=0;i<count;i++)sqlite.prepare('INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at,result_version_id) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),owner,'legacy','legacy',day,'model','done',day+'T01:00:00Z',null)}
  return{sqlite,env,control,discussions,server,usage,model,who,req,run,create,get,send,status,save,saveTask,listTasks,attach,app,answer,budget,close:async()=>{sqlite.close();const target=resolve(tempRoot);if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('motes-discussion-test-'))throw Error('Unexpected fixture cleanup path');await rm(target,{recursive:true,force:true})}};
}

test('pre-app text discussion persists and never creates an app, version or preview HTML',async t=>{
  const h=await harness();t.after(h.close);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.answer('<script>plain text only</script>')});
  const thread=(await h.create()).data.thread;const body={prompt:'先解释一下',requestId:crypto.randomUUID()};const result=await h.send(thread.id,body);assert.equal(result.status,200);assert.equal(result.data.turns[0].reply,'<script>plain text only</script>');assert.equal(result.data.turns[0].status,'done');
  assert.equal((await h.get('?threadId='+thread.id)).data.turns.length,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,0);assert.equal(calls,1);
  const usage=await h.usage.readUsage(h.env.DB,await h.who('a'));assert.equal(usage.quota.model.used,1);assert.equal(usage.items[0].operation,'discuss');assert.equal(usage.tokens.total,30);
});
test('app context is owner-checked saved HTML; model is allowlisted and source/version pointers stay unchanged',async t=>{
  const h=await harness();t.after(h.close);const app=await h.app(),other=await h.app('b','<!doctype html><html><head></head><body>OTHER PRIVATE CODE</body></html>');const thread=(await h.create({appId:app.id})).data.thread;const before=h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY id').all();
  t.mock.method(globalThis,'fetch',async(_url,options)=>{const b=JSON.parse(options.body);assert.equal(b.model,'another-model');assert.equal(b.max_output_tokens,1600);assert.equal(b.store,false);assert.match(b.input,/OWN SAVED CODE/);assert.doesNotMatch(b.input,/OTHER PRIVATE CODE|SECRET BUILD PROMPT/);return h.answer()});
  const result=await h.send(thread.id,{model:'another-model',baseVersionId:app.version});assert.equal(result.status,200);assert.equal(result.data.turns[0].contextVersionId,app.version);assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY id').all(),before);assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get(app.id).current_version_id,app.version);
  assert.equal((await h.send(thread.id,{baseVersionId:other.version})).status,404);assert.equal((await h.send(thread.id,{model:'not-allowed'})).status,400);
});
test('threads, turns, request status, creation scopes and linking all reject cross-owner access',async t=>{
  const h=await harness();t.after(h.close);const app=await h.app(),thread=(await h.create()).data.thread;t.mock.method(globalThis,'fetch',async()=>h.answer());const body={requestId:crypto.randomUUID()};await h.send(thread.id,body);
  assert.equal((await h.get('?threadId='+thread.id,'b')).status,404);assert.equal((await h.send(thread.id,{},'b')).status,404);assert.equal((await h.status(body.requestId,'b')).status,404);assert.equal((await h.create({appId:app.id},'b')).status,404);assert.equal((await h.attach(thread.id,app.id,'b')).status,404);assert.equal((await h.get('','b')).data.threads.length,0);
});
test('deduplicated active/done request retries never call the model twice',async t=>{
  const h=await harness();t.after(h.close);const thread=(await h.create()).data.thread;let release,entered;const gate=new Promise(r=>{release=r}),started=new Promise(r=>{entered=r});let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;entered();await gate;return h.answer()});
  const body={requestId:crypto.randomUUID(),prompt:'先讨论'};const first=h.send(thread.id,body);await started;assert.equal((await h.status(body.requestId)).data.status,'running');const active=await h.send(thread.id,body);assert.equal(active.status,409);assert.equal(active.data.retry,undefined);
  release();assert.equal((await first).status,200);const retry=await h.send(thread.id,body);assert.equal(retry.status,200);assert.equal(retry.data.turns.length,1);assert.equal(calls,1);assert.equal((await h.send(thread.id,{...body,prompt:'different'})).status,409);
});
test('discussion consumes the same visitor/global model budget as building and candidates, with no orphan reservations',async t=>{
  const h=await harness();t.after(h.close);const a=(await h.create()).data.thread,b=(await h.create()).data.thread;h.budget(await h.who('a'),9);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.answer()});
  const results=await Promise.all([h.send(a.id),h.send(b.id)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(calls,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_model_usage').get().n,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_locks').get().n,0);
  const global=await harness();t.after(global.close);const thread=(await global.create()).data.thread;global.budget(await global.who('b'),50);assert.equal((await global.send(thread.id)).status,429);assert.equal(global.sqlite.prepare('SELECT count(*) AS n FROM motes_discussion_turns').get().n,0);
});
test('HTTP errors retain the question, count the attempt and permit an explicit new-ID retry',async t=>{
  const h=await harness();t.after(h.close);const thread=(await h.create()).data.thread;let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls===1?Response.json({error:{code:'insufficient_quota'}},{status:429}):h.answer());const body={requestId:crypto.randomUUID(),prompt:'原始问题'};
  const failed=await h.send(thread.id,body);assert.equal(failed.status,429);assert.equal(failed.data.retry,'new');const status=await h.status(body.requestId);assert.equal(status.data.status,'failed');assert.equal(status.data.snapshot.turns[0].prompt,'原始问题');assert.equal(status.data.snapshot.turns[0].reply,null);
  assert.equal((await h.send(thread.id,body)).status,409);assert.equal((await h.send(thread.id,{...body,requestId:crypto.randomUUID()})).status,200);assert.equal(calls,2);assert.equal((await h.usage.readUsage(h.env.DB,await h.who('a'))).quota.model.used,2);
});
test('no configured key, invalid payloads, foreign base and invalid Origin cause zero model reservations',async t=>{
  const h=await harness({key:false});t.after(h.close);const thread=(await h.create()).data.thread;t.mock.method(globalThis,'fetch',()=>{throw Error('No real model calls')});assert.equal((await h.send(thread.id)).status,503);
  for(const patch of [{prompt:''},{prompt:'a'.repeat(4001)},{requestId:'bad'},{runtimeInputs:{secret:'no'}},{apiKey:'no'}])assert.equal((await h.send(thread.id,patch)).status,400);
  assert.equal((await h.send(thread.id,{},'a','https://invalid.test')).status,403);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,0);
});
test('late expired discussion cannot overwrite a newer reply or delete its lease',async t=>{
  const h=await harness();t.after(h.close);const thread=(await h.create()).data.thread,gates=[];t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>gates.push(()=>resolve(h.answer('reply '+gates.length)))));
  const oldId=crypto.randomUUID(),freshId=crypto.randomUUID(),old=h.send(thread.id,{requestId:oldId});while(gates.length<1)await new Promise(r=>setImmediate(r));h.sqlite.prepare('UPDATE forma_locks SET expires_at=0 WHERE request_id=?').run(oldId);assert.equal((await h.status(oldId)).data.status,'expired');const fresh=h.send(thread.id,{requestId:freshId});while(gates.length<2)await new Promise(r=>setImmediate(r));gates[0]();assert.equal((await old).status,409);assert.equal(h.sqlite.prepare('SELECT request_id FROM forma_locks').get().request_id,freshId);gates[1]();assert.equal((await fresh).status,200);assert.equal((await h.status(freshId)).data.status,'done');
});
test('adopting a pre-app thread links only metadata, preserves all turns and never steals an existing app discussion',async t=>{
  const h=await harness();t.after(h.close);const thread=(await h.create()).data.thread,app=await h.app();t.mock.method(globalThis,'fetch',async()=>h.answer());await h.send(thread.id);const before=h.sqlite.prepare('SELECT * FROM forma_versions').all();assert.equal((await h.attach(thread.id,app.id)).status,200);const result=await h.get('?appId='+app.id);assert.equal(result.data.thread.id,thread.id);assert.equal(result.data.turns.length,1);assert.equal(result.data.turns[0].contextVersionId,null);assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions').all(),before);
  const second=(await h.create()).data.thread;assert.equal((await h.attach(second.id,app.id)).status,409);assert.equal((await h.get('?threadId='+second.id)).data.thread.appId,null);
});
test('post-commit read failure preserves a completed receipt and retry returns the existing text',async t=>{
  const h=await harness();t.after(h.close);const thread=(await h.create()).data.thread;let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;h.control.failSnapshot=true;return h.answer()});const body={requestId:crypto.randomUUID()};assert.equal((await h.send(thread.id,body)).status,500);assert.equal((await h.send(thread.id,body)).status,200);assert.equal(calls,1);assert.equal((await h.status(body.requestId)).data.status,'done');
});
test('response completeness and output bounds are enforced',async t=>{
  const h=await harness();t.after(h.close);assert.throws(()=>h.model.parseDiscussion({status:'incomplete',output:[]}));assert.throws(()=>h.model.parseDiscussion({status:'completed',output:[{content:[{type:'output_text',text:'x'.repeat(8001)}]}]}));
});
test('thread and turn caps are fenced without model calls or orphan usage rows',async t=>{
  const h=await harness();t.after(h.close);const first=(await h.create()).data.thread,wid='workspace:'+await h.who('a'),now=new Date().toISOString();
  for(let i=1;i<49;i++)h.sqlite.prepare('INSERT INTO motes_discussion_threads VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),wid,null,null,'saved',now,now);
  const result=await Promise.all([h.create(),h.create()]);assert.deepEqual(result.map(r=>r.status).sort(),[201,429]);
  for(let i=0;i<100;i++){const rid=crypto.randomUUID();h.sqlite.prepare('INSERT INTO forma_requests(id,owner,project_id,fingerprint,day,mode,status,created_at,result_version_id) VALUES(?,?,?,?,?,?,?,?,?)').run(rid,await h.who('a'),'discussion:'+first.id,'old','2026-01-01','model','done','2026-01-01T00:00:00Z',rid);h.sqlite.prepare('INSERT INTO motes_discussion_turns(request_id,thread_id,prompt,reply,created_at) VALUES(?,?,?,?,?)').run(rid,first.id,'q','a','2026-01-01T00:00:00Z')}
  t.mock.method(globalThis,'fetch',()=>{throw Error('No calls at capacity')});assert.equal((await h.send(first.id)).status,429);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_model_usage').get().n,0);
});
test('ownership changes before reservation fence abort without reserving a paid attempt',async t=>{
  const h=await harness();t.after(h.close);const app=await h.app(),thread=(await h.create({appId:app.id})).data.thread;
  h.control.beforeBatch=()=>h.sqlite.prepare('UPDATE forma_projects SET owner=? WHERE id=?').run('another-owner',app.id);
  t.mock.method(globalThis,'fetch',()=>{throw Error('No call after owner changed')});assert.equal((await h.send(thread.id)).status,429);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_model_usage').get().n,0);
});
test('discussion final-save failure retains paid text durably and only retries saving without another model call',async t=>{
 const h=await harness();t.after(h.close);const thread=(await h.create()).data.thread;let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.answer('已经付费返回的原始文字回复')});h.sqlite.exec("CREATE TRIGGER fail_discussion_answer BEFORE UPDATE ON motes_discussion_turns WHEN NEW.reply IS NOT NULL BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END");
 const body={requestId:crypto.randomUUID(),prompt:'保留这条问题'},first=await h.send(thread.id,body);assert.equal(first.status,503);assert.equal(first.data.retry,undefined);const pending=await h.status(body.requestId);assert.equal(pending.data.status,'save_pending');assert.equal(pending.data.retry,'save');assert.equal(pending.data.snapshot.turns[0].reply,null);assert.equal(pending.data.snapshot.turns[0].pendingReply,'已经付费返回的原始文字回复');assert.equal((await h.save(body.requestId,'b')).status,404);assert.equal((await h.send(thread.id,body)).status,503);assert.equal((await h.send(thread.id,{...body,requestId:crypto.randomUUID()})).status,409);assert.equal(calls,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_locks').get().n,0);
 const task=(await h.listTasks()).data.items[0];assert.equal(task.kind,'discussion');assert.equal(task.phase,'save_pending');assert.ok(task.resultStagedAt);const used=await h.usage.readUsage(h.env.DB,await h.who('a'));assert.equal(used.quota.model.used,1);assert.equal(used.tokens.total,30);assert.equal(used.items[0].status,'succeeded');
 h.sqlite.exec('DROP TRIGGER fail_discussion_answer');assert.equal((await h.saveTask(body.requestId)).status,200);assert.equal((await h.save(body.requestId)).status,200);assert.equal((await h.send(thread.id,body)).status,200);const done=await h.status(body.requestId);assert.equal(done.data.status,'done');assert.equal(done.data.snapshot.turns[0].reply,'已经付费返回的原始文字回复');assert.equal(calls,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_model_usage').get().n,1);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('0008 is schema-only and follows the stable 0007 snapshot',async t=>{
  const h=await harness();t.after(h.close);const sql=await readFile(new URL('../drizzle/0008_text_discussions.sql',import.meta.url),'utf8');assert.ok(sql.split(';').map(s=>s.replace(/--[^\r\n]*/g,'').trim()).filter(Boolean).every(s=>/^CREATE (?:TABLE|UNIQUE INDEX|INDEX)/i.test(s)));
  const previous=JSON.parse(await readFile(new URL('../drizzle/meta/0007_snapshot.json',import.meta.url),'utf8')),current=JSON.parse(await readFile(new URL('../drizzle/meta/0008_snapshot.json',import.meta.url),'utf8'));assert.equal(current.prevId,previous.id);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('discussion staged TTL and scope locks are enforced without replaying a paid call',async t=>{const h=await harness();t.after(h.close);const thread=(await h.create()).data.thread;let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return h.answer()});h.sqlite.exec("CREATE TRIGGER fail_discussion_answer BEFORE UPDATE ON motes_discussion_turns WHEN NEW.reply IS NOT NULL BEGIN SELECT RAISE(ABORT,'storage failure'); END");const body={requestId:crypto.randomUUID()};assert.equal((await h.send(thread.id,body)).status,503);h.sqlite.exec('DROP TRIGGER fail_discussion_answer');h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run('discussion:'+thread.id,'other-active',Date.now()+60000);assert.equal((await h.save(body.requestId)).status,409);assert.equal(calls,1);h.sqlite.prepare('DELETE FROM forma_locks WHERE request_id=?').run('other-active');h.sqlite.prepare('UPDATE motes_discussion_threads SET managed_project_id=? WHERE id=?').run('project:'+await h.who('a'),thread.id);assert.equal((await h.save(body.requestId)).status,409);assert.equal(calls,1);h.sqlite.prepare('UPDATE motes_discussion_threads SET managed_project_id=NULL WHERE id=?').run(thread.id);h.sqlite.prepare("UPDATE motes_discussion_results SET expires_at='2000-01-01T00:00:00.000Z' WHERE request_id=?").run(body.requestId);assert.equal((await h.save(body.requestId)).status,410);assert.equal((await h.status(body.requestId)).data.status,'expired');assert.equal(calls,1);assert.equal((await h.send(thread.id,{requestId:crypto.randomUUID()})).status,200);assert.equal(calls,2);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);});
