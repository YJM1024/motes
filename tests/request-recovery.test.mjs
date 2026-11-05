import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

function loader(key){
  const cache=new Map();
  return async function moduleUrl(file){
    if(cache.has(file))return cache.get(file);
    let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');
    source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);
    for(const match of [...source.matchAll(/(?:from\s+)(['"])(\.[^'"]+)\1/g)]){
      const target=new URL(match[2]+'.ts',new URL('../lib/'+file+'.ts',import.meta.url));
      source=source.replaceAll(match[1]+match[2]+match[1],JSON.stringify(await moduleUrl(target.pathname.split('/lib/').at(-1).replace(/\.ts$/,''))));
    }
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url;
  };
}
async function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(await readFile(new URL('../drizzle/0000_great_roland_deschain.sql',import.meta.url),'utf8'));
  sqlite.exec(await readFile(new URL('../drizzle/0017_stale_millenium_guard.sql',import.meta.url),'utf8'));
  sqlite.exec(await readFile(new URL('../drizzle/0011_generation_results.sql',import.meta.url),'utf8'));
  const sql=[];
  const prepare=(query,args=[])=>({bind(...values){return prepare(query,values);},async first(){sql.push(query);return sqlite.prepare(query).get(...args)??null;}});
  const key=crypto.randomUUID();globalThis[key]={DB:{prepare}};
  const moduleUrl=loader(key),api=await import(await moduleUrl('motes/request-status')),server=await import(await moduleUrl('forma/server')),security=await import(await moduleUrl('forma/security'));delete globalThis[key];
  const who=await security.digest('a'.repeat(64)),now=new Date().toISOString();
  function requestRow(status='running',mode='model'){
    const id=crypto.randomUUID(),projectId=crypto.randomUUID();sqlite.prepare('INSERT INTO forma_requests VALUES(?,?,?,?,?,?,?,?,?)').run(id,who,projectId,'PRIVATE FINGERPRINT',now.slice(0,10),mode,status,now,null);return {id,projectId};
  }
  async function get(id,visitor='a'){
    const request=new Request('https://motes.test/api/requests/'+id,{headers:visitor?{cookie:'forma_session='+visitor.repeat(64)}:{}});
    const response=await server.route(()=>api.requestStatus(request,id));return {status:response.status,data:await response.json(),headers:response.headers};
  }
  function done(){
    const row=requestRow('done'),v1=crypto.randomUUID(),v2=crypto.randomUUID();sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(row.projectId,who,'已保存应用',now,now,v2);
    for(const [id,n,html]of [[v1,1,'<!doctype html><html><body>persisted result</body></html>'],[v2,2,'PRIVATE OTHER HTML']])sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(id,row.projectId,n,'PRIVATE PROMPT','PRIVATE SUMMARY',html,now,'model','PRIVATE MODEL');
    sqlite.prepare('UPDATE forma_requests SET result_version_id=? WHERE id=?').run(v1,row.id);return {...row,v1,v2};
  }
  return {sqlite,sql,who,requestRow,get,done,close:()=>sqlite.close()};
}

test('status is read-only and derives running/expired from this exact live lease, not another worker',async t=>{
  const h=await harness();t.after(h.close);const live=h.requestRow(),expired=h.requestRow(),missing=h.requestRow(),replaced=h.requestRow(),wrongProject=h.requestRow(),failed=h.requestRow('failed');
  const expires=Date.now()+60000;
  h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(live.projectId,live.id,expires);
  h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(expired.projectId,expired.id,Date.now()-1);
  h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(replaced.projectId,crypto.randomUUID(),expires);
  h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(crypto.randomUUID(),wrongProject.id,expires);
  const before=h.sqlite.prepare('SELECT * FROM forma_requests ORDER BY id').all(),locks=h.sqlite.prepare('SELECT * FROM forma_locks ORDER BY project_id').all();
  assert.deepEqual((await h.get(live.id)).data,{requestId:live.id,status:'running',leaseExpiresAt:expires});
  for(const item of [expired,missing,replaced,wrongProject])assert.deepEqual((await h.get(item.id)).data,{requestId:item.id,status:'expired',retry:'new'});
  assert.deepEqual((await h.get(failed.id)).data,{requestId:failed.id,status:'failed',retry:'new'});
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_requests ORDER BY id').all(),before);assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_locks ORDER BY project_id').all(),locks);assert.ok(h.sql.every(q=>q.trim().startsWith('SELECT')));
});

test('done returns the exact committed version, not the newer current version, and excludes private metadata',async t=>{
  const h=await harness();t.after(h.close);t.mock.method(globalThis,'fetch',()=>{throw Error('Status must never generate');});const row=h.done(),response=await h.get(row.id);
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.data.status,'done');assert.equal(response.data.resultVersionId,row.v1);assert.match(response.data.result.html,/persisted result/);assert.equal(response.data.result.number,1);
  assert.deepEqual(Object.keys(response.data.result).sort(),['createdAt','html','number','projectId','title','versionId']);assert.doesNotMatch(JSON.stringify(response.data),/PRIVATE|fingerprint|prompt|owner|model|key/);
  assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get(row.projectId).current_version_id,row.v2);
});

test('unknown and cross-owner requests uniformly 404; authentication and malformed IDs are safe',async t=>{
  const h=await harness();t.after(h.close);const row=h.done();
  const foreign=await h.get(row.id,'b'),missing=await h.get(row.id.replace(/./,'f'),'b');assert.equal(foreign.status,404);assert.equal(foreign.data.status,'not-found');assert.equal(missing.status,404);assert.equal('result' in foreign.data,false);
  assert.equal((await h.get(row.id,'')).status,401);assert.deepEqual((await h.get('<bad>')).data,{status:'not-found'});
  assert.equal((await h.get(h.requestRow('done','fork').id)).status,404,'Do not confuse import/fork receipts with generation attempts');
  const discussion=h.requestRow();h.sqlite.prepare('UPDATE forma_requests SET project_id=? WHERE id=?').run('discussion:thread',discussion.id);assert.equal((await h.get(discussion.id)).status,404,'Discussion receipts use a separate result DTO and endpoint');
  const candidate=h.requestRow();h.sqlite.prepare('UPDATE forma_requests SET project_id=? WHERE id=?').run('candidate:variant',candidate.id);assert.equal((await h.get(candidate.id)).status,404,'Candidate receipts must not masquerade as a saved application version');
  h.sqlite.prepare('UPDATE forma_projects SET owner=? WHERE id=?').run('other',row.projectId);assert.equal((await h.get(row.id)).status,404,'A malformed ownership association never exposes another owner result');
});

const modules=loader('unused');
const state=await import(await modules('motes/recovery-state')),poll=await import(await modules('motes/recovery-poll'));
const id=()=>crypto.randomUUID();
const attempt=()=>({id:id(),requestId:id(),text:'原始需求',mode:'demo',state:'failed',startedAt:1,recovered:true,managedProjectId:'project-a',contextId:'draft-a'});
const identity=a=>({attemptId:a.id,requestId:a.requestId,contextKey:state.contextKey(a),epoch:1});
const done=a=>({requestId:a.requestId,status:'done',projectId:'app-a',resultVersionId:'version-a',result:{projectId:'app-a',title:'saved',versionId:'version-a',number:1,html:'<html>saved</html>',createdAt:'now'}});
test('pure transitions ignore stale request, epoch and context responses; unknown state never authorizes new ID',()=>{
  const a=attempt(),key=identity(a),original=state.initialRecovery(key);
  for(const old of [{...key,requestId:id()},{...key,contextKey:'other'},{...key,epoch:0}])assert.equal(state.recoveryReducer(original,{type:'status',identity:old,status:done(a)}),original);
  assert.equal(state.recoveryReducer(original,{type:'status',identity:key,status:{requestId:id(),status:'failed',retry:'new'}}),original);
  let current=state.recoveryReducer(original,{type:'error',identity:key});assert.equal(current.retry,'check');assert.equal(current.nextDelayMs,2000);
  current=state.recoveryReducer(current,{type:'status',identity:key,status:{requestId:a.requestId,status:'running',leaseExpiresAt:5000}});assert.equal(current.retry,'check');assert.equal(current.nextDelayMs,3000);
});

test('only confirmed failed/expired retry gets new ID; not-found retains original input/ID and the draft is untouched',()=>{
  const a=attempt(),key=identity(a),original=state.initialRecovery(key),draft='用户下一条尚未发送的草稿';
  for(const status of ['failed','expired']){
    const current=state.recoveryReducer(original,{type:'status',identity:key,status:{requestId:a.requestId,status,retry:'new'}}),newId=id();const retry=state.prepareRecoveryRetry(a,current,key.contextKey,()=>newId,123);
    assert.equal(retry.requestId,newId);assert.equal(retry.id,a.id);assert.equal(retry.text,a.text);assert.equal(retry.managedProjectId,a.managedProjectId);assert.equal(retry.contextId,a.contextId);assert.equal(retry.recovered,false);assert.equal(retry.startedAt,123);
  }
  const missing=state.recoveryReducer(original,{type:'status',identity:key,status:{requestId:a.requestId,status:'not-found'}});
  assert.equal(state.prepareRecoveryRetry(a,missing,key.contextKey,()=>{throw Error('Must not allocate a new ID');}).requestId,a.requestId);
  assert.equal(state.prepareRecoveryRetry(a,original,key.contextKey,id),null);assert.equal(state.prepareRecoveryRetry(a,missing,'another-target',id),null);assert.equal(draft,'用户下一条尚未发送的草稿');
});

test('restored outbox validates and bounds data, strips unverified retry flags and isolates app/new-target contexts',()=>{
  const a=attempt(),b={...attempt(),projectId:'app-b',managedProjectId:undefined,contextId:undefined};
  const restored=state.restoredAttempts(JSON.stringify([a,{...a,retry:'new',retryConfirmed:true},b,{...attempt(),text:'x'.repeat(4001)}]));assert.equal(restored.length,2);assert.ok(restored.every(a=>a.recovered&&a.state==='failed'&&!('retry' in a)&&!('retryConfirmed' in a)));
  assert.equal(state.matchesContext(a,{managedProjectId:'project-a',contextId:'draft-a'}),true);assert.equal(state.matchesContext(a,{managedProjectId:'project-b',contextId:'draft-a'}),false);assert.equal(state.matchesContext(a,{managedProjectId:'project-a',contextId:'another-draft'}),false);assert.equal(state.matchesContext(b,{projectId:'app-b'}),true);assert.equal(state.matchesContext(b,{projectId:'app-c'}),false);
  assert.deepEqual(state.restoredAttempts('not json'),[]);assert.ok(state.restoredAttempts(JSON.stringify(Array.from({length:30},attempt))).length<=20);
});

test('polling uses finite backoff and pauses without generating when a lease remains running',async()=>{
  const a=attempt(),key=identity(a),controller=new AbortController(),updates=[],waits=[];let calls=0;
  await poll.pollRecoveredAttempt(a,key,{signal:controller.signal,isCurrent:()=>true,maxChecks:3,query:async()=>{calls++;return {requestId:a.requestId,status:'running',leaseExpiresAt:99999};},wait:async ms=>{waits.push(ms);},onState:s=>updates.push(s),onRecovered:async()=>{throw Error('Not done');}});
  assert.equal(calls,3);assert.deepEqual(waits,[2000,3000]);assert.equal(updates.at(-1).phase,'paused');assert.equal(updates.at(-1).retry,'check');assert.equal(updates.at(-1).nextDelayMs,null);
});

test('network failures pause finitely; auth failures pause immediately; completed result delivery can safely retry',async()=>{
  const a=attempt(),key=identity(a),controller=new AbortController(),updates=[];let calls=0;
  const common={signal:controller.signal,isCurrent:()=>true,maxChecks:3,wait:async()=>{},onState:s=>updates.push(s),onRecovered:async()=>{}};
  await poll.pollRecoveredAttempt(a,key,{...common,query:async()=>{calls++;throw Error('network');}});assert.equal(calls,3);assert.equal(updates.at(-1).retry,'check');
  calls=0;await poll.pollRecoveredAttempt(a,key,{...common,query:async()=>{calls++;throw new poll.RecoveryQueryError('expired session',true);}});assert.equal(calls,1);assert.equal(updates.at(-1).phase,'paused');
  let deliveries=0;calls=0;await poll.pollRecoveredAttempt(a,key,{...common,query:async()=>{calls++;return done(a);},onRecovered:async()=>{if(++deliveries===1)throw Error('project read interrupted');}});assert.equal(calls,2);assert.equal(deliveries,2);assert.equal(updates.at(-1).phase,'done');
});

test('late status responses and waits cannot call back after leaving, retrying or aborting',async()=>{
  for(const cancel of ['abort','context-change']){
    const a=attempt(),key=identity(a),controller=new AbortController(),updates=[];let resolve,current=true,delivered=false;
    const pending=new Promise(r=>{resolve=r;});const task=poll.pollRecoveredAttempt(a,key,{signal:controller.signal,isCurrent:()=>current,query:()=>pending,onState:s=>updates.push(s),onRecovered:async()=>{delivered=true;}});
    await Promise.resolve();const count=updates.length;if(cancel==='abort')controller.abort();else current=false;resolve(done(a));await task;assert.equal(delivered,false);assert.equal(updates.length,count);
  }
  const a=attempt(),controller=new AbortController();let calls=0;
  await poll.pollRecoveredAttempt(a,identity(a),{signal:controller.signal,isCurrent:()=>true,query:async()=>{calls++;return {requestId:a.requestId,status:'running',leaseExpiresAt:99999};},onState:s=>{if(s.phase==='running')controller.abort();},onRecovered:async()=>{}});assert.equal(calls,1);
});

test('query transport only reads the original request, maps 404 to same-ID retry and rejects wrong receipts',async t=>{
  const a=attempt(),controller=new AbortController(),fetch=t.mock.method(globalThis,'fetch',async(path,options)=>{assert.equal(path,'/api/requests/'+a.requestId);assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);assert.equal(options.method,undefined);return Response.json({anything:'ignored'},{status:404});});
  assert.deepEqual(await poll.queryRequestStatus(a.requestId,controller.signal),{requestId:a.requestId,status:'not-found'});
  fetch.mock.mockImplementation(async()=>new Response('unauthorized',{status:401}));await assert.rejects(poll.queryRequestStatus(a.requestId,controller.signal),e=>e.pause===true);
  fetch.mock.mockImplementation(async()=>Response.json({...done(a),requestId:id()}));await assert.rejects(poll.queryRequestStatus(a.requestId,controller.signal),/响应无效/);
});

test('late POST failure/success cannot alter a newer retry; current drafts and newer saved code survive recovery',()=>{
  const old=attempt(),retry={...old,requestId:id(),state:'sending'},other=attempt();
  assert.deepEqual(state.removeFinishedAttempt([retry,other],old),[retry,other]);assert.deepEqual(state.failOriginalAttempt([retry,other],old,'late failure'),[retry,other]);
  assert.deepEqual(state.removeFinishedAttempt([old,other],old),[other]);assert.equal(state.failOriginalAttempt([old],old,'interrupted')[0].requestId,old.requestId);
  assert.equal(state.draftAfterSend('下一条草稿',old.text,true),'下一条草稿');assert.equal(state.draftAfterSend('刚输入的新草稿',old.text,false),'刚输入的新草稿');assert.equal(state.draftAfterSend(old.text,old.text,false),'');
  const newer={id:'app',updatedAt:'2026-10-30T12:00:02Z',versions:[1,2]},older={id:'app',updatedAt:'2026-10-30T12:00:01Z',versions:[1]};
  assert.equal(state.preferSavedProject(newer,older),newer);assert.equal(state.preferSavedProject(older,newer),newer);
});

test('a completed status followed by a late project read cannot steal a newly selected context',async()=>{
  const a=attempt(),controller=new AbortController();let finishRead,entered=false,current=true,applied=false;
  const read=new Promise(resolve=>{finishRead=resolve;});
  const task=poll.pollRecoveredAttempt(a,identity(a),{signal:controller.signal,isCurrent:()=>current,query:async()=>done(a),onState:()=>{},onRecovered:async(_attempt,_receipt,guard)=>{entered=true;await read;if(guard.isCurrent())applied=true;}});
  for(let i=0;i<4&&!entered;i++)await Promise.resolve();assert.equal(entered,true);current=false;controller.abort();finishRead();await task;assert.equal(applied,false);
});
