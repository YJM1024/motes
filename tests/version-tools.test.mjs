import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

async function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0000_great_roland_deschain.sql','0001_first_wind_dancer.sql','0004_version_annotations.sql','0007_generation_candidates.sql','0014_version_config.sql'])sqlite.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const control={beforeBatch:null};
  function prepare(sql,args=[]){return {bind(...values){return prepare(sql,values)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return {results:sqlite.prepare(sql).all(...args)}},run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}};}
  const key=crypto.randomUUID(),env={DB:{prepare,async batch(statements){if(control.beforeBatch){const run=control.beforeBatch;control.beforeBatch=null;run();}sqlite.exec('BEGIN');try{const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};globalThis[key]=env;
  const cache=new Map();
  async function moduleUrl(file){
    if(cache.has(file))return cache.get(file);
    let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');
    source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);
    for(const declaration of ts.createSourceFile('module.ts',source,ts.ScriptTarget.Latest,true).statements.filter(n=>(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier).toReversed()){if(declaration.importClause?.isTypeOnly||declaration.isTypeOnly)continue;const spec=declaration.moduleSpecifier.text;const resolved=spec.startsWith('.')?await moduleUrl((new URL(spec+'.ts',new URL('../lib/'+file+'.ts',import.meta.url))).pathname.split('/lib/').at(-1).replace(/\.ts$/,'')):import.meta.resolve(spec);source=source.slice(0,declaration.moduleSpecifier.getStart())+JSON.stringify(resolved)+source.slice(declaration.moduleSpecifier.end);}
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url;
  }
  const tools=await import(await moduleUrl('motes/version-tools')),server=await import(await moduleUrl('forma/server')),security=await import(await moduleUrl('forma/security')),management=await import(await moduleUrl('motes/management'));
  delete globalThis[key];
  const who=visitor=>security.digest(visitor.repeat(64));
  async function seed(visitor='a',mode='model'){
    const own=visitor==='shared'?security.sharedWorkspaceOwner():await who(visitor),id=crypto.randomUUID(),versionId=crypto.randomUUID(),current=crypto.randomUUID(),now=new Date().toISOString();
    sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,own,'原应用',now,now,current);
    for(const [v,n,html] of [[versionId,1,'<html><body>old</body></html>'],[current,2,'<html><body>current</body></html>']])sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(v,id,n,'原需求','原摘要',html,now,mode,mode==='model'?'source-model':null);
    await management.initializeWorkspace(own);return {id,versionId,current,owner:own};
  }
  async function request(id,body,visitor='a',origin='https://motes.test'){
    const req=new Request('https://motes.test/api/projects/'+id+'/fork',{method:'POST',headers:{origin,cookie:'forma_session='+visitor.repeat(64),'content-type':'application/json'},body:JSON.stringify(body)});
    const response=await server.route(()=>tools.forkVersion(req,id));return {status:response.status,data:await response.json()};
  }
  return {sqlite,control,tools,management,who,seed,request,enableShared:()=>{env.MOTES_WORKSPACE_VISIBILITY='shared';},sharedOwner:security.sharedWorkspaceOwner,close:()=>sqlite.close()};
}

test('historical copy preserves selected HTML as v1, source pointers and ownership; no model call',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed();
  t.mock.method(globalThis,'fetch',()=>{throw Error('Fork must never call a model');});
  const before=h.sqlite.prepare('SELECT * FROM forma_versions WHERE project_id=? ORDER BY number').all(source.id);
  const body={versionId:source.versionId,requestId:crypto.randomUUID()};const result=await h.request(source.id,body);
  assert.equal(result.status,201);const copy=result.data.project;
  assert.notEqual(copy.id,source.id);assert.equal(copy.versions.length,1);assert.equal(copy.currentVersionId,copy.versions[0].id);
  assert.equal(copy.versions[0].number,1);assert.equal(copy.versions[0].html,before[0].html);assert.equal(copy.versions[0].mode,'model');assert.equal(copy.versions[0].model,'source-model');
  assert.match(copy.versions[0].summary,/历史副本.*未调用模型/);
  assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get(source.id).current_version_id,source.current);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions WHERE project_id=? ORDER BY number').all(source.id),before);
  const app=h.sqlite.prepare('SELECT * FROM motes_apps WHERE app_id=?').get(copy.id);
  assert.equal(app.project_id,'project:'+source.owner);assert.equal(app.workspace_id,'workspace:'+source.owner);
  const retry=await h.request(source.id,body);assert.equal(retry.status,200);assert.equal(retry.data.project.id,copy.id);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,2);
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM forma_requests WHERE mode IN ('model','demo')").get().n,0,'Copy does not use generation quota');
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('shared historical copies are labeled public demo apps for all visitors',async t=>{
  const h=await harness();t.after(h.close);h.enableShared();const source=await h.seed('shared'),result=await h.request(source.id,{versionId:source.versionId,requestId:crypto.randomUUID()});assert.equal(result.status,201);assert.match(result.data.project.versions[0].summary,/公共演示应用，所有访客可见和修改/);const description=h.sqlite.prepare('SELECT description FROM motes_apps WHERE app_id=?').get(result.data.project.id).description;assert.match(description,/公共演示应用，所有访客可见和修改/);
});

test('explicit destination is scoped to this visitor; wrong source/version and reused IDs cannot leak data',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed(),b=await h.seed('b');
  const target=crypto.randomUUID(),now=new Date().toISOString();h.sqlite.prepare('INSERT INTO motes_projects(id,workspace_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(target,'workspace:'+a.owner,'独立项目',now,now);
  const body={versionId:a.versionId,targetProjectId:target,title:'我的副本',requestId:crypto.randomUUID()};
  const copy=await h.request(a.id,body);assert.equal(copy.status,201);assert.equal(copy.data.project.title,'我的副本');assert.equal(h.sqlite.prepare('SELECT project_id FROM motes_apps WHERE app_id=?').get(copy.data.project.id).project_id,target);
  assert.equal((await h.request(a.id,{...body,versionId:a.current})).status,409);
  assert.equal((await h.request(a.id,body,'b')).status,409);
  for(const [id,extra] of [[b.id,{versionId:b.versionId}],[a.id,{versionId:b.versionId}],[a.id,{targetProjectId:'project:'+b.owner}],[a.id,{targetProjectId:'missing'}]])assert.equal((await h.request(id,{versionId:a.versionId,...extra,requestId:crypto.randomUUID()})).status,404);
  h.sqlite.prepare('UPDATE motes_projects SET archived=1 WHERE id=?').run(target);
  assert.equal((await h.request(a.id,{...body,requestId:crypto.randomUUID()})).status,409);
});

test('validation, live busy locks, expired locks and length limits',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed('a','demo'),valid={versionId:a.versionId,requestId:crypto.randomUUID()};
  for(const body of [{...valid,requestId:'bad'},{...valid,versionId:''},{...valid,title:' '},{...valid,title:'x'.repeat(81)},{...valid,targetProjectId:'x'.repeat(129)},{...valid,owner:'b'}])assert.equal((await h.request(a.id,body)).status,400);
  assert.equal((await h.request(a.id,valid,'a','https://evil.test')).status,403);
  h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(a.id,'generation',Date.now()+60000);
  assert.equal((await h.request(a.id,valid)).status,409);
  h.sqlite.prepare('UPDATE forma_locks SET expires_at=?').run(Date.now()-1);
  assert.equal((await h.request(a.id,valid)).status,201);
  h.sqlite.prepare('UPDATE forma_versions SET html=? WHERE id=?').run('x'.repeat(180001),a.versionId);
  assert.equal((await h.request(a.id,{...valid,requestId:crypto.randomUUID()})).status,422);
});

test('transaction rolls back copy on storage error and same request remains safely retryable',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed(),body={versionId:a.versionId,requestId:crypto.randomUUID()};
  h.sqlite.exec("CREATE TRIGGER fail_copy BEFORE INSERT ON motes_apps BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
  assert.equal((await h.request(a.id,body)).status,500);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,1);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,2);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,0);
  h.sqlite.exec('DROP TRIGGER fail_copy');assert.equal((await h.request(a.id,body)).status,201);
});

test('atomic source and destination guards fence changes between validation and insert',async t=>{
  for(const change of ['busy','target','owner']){
    const h=await harness();const a=await h.seed();
    // initializeWorkspace is itself a batch; arm the second batch only.
    h.control.beforeBatch=()=>{h.control.beforeBatch=()=>{
      if(change==='busy')h.sqlite.prepare('INSERT INTO forma_locks VALUES(?,?,?)').run(a.id,'other',Date.now()+60000);
      if(change==='target')h.sqlite.prepare('UPDATE motes_projects SET archived=1 WHERE id=?').run('project:'+a.owner);
      if(change==='owner')h.sqlite.prepare('UPDATE forma_projects SET owner=? WHERE id=?').run('other',a.id);
    };};
    const r=await h.request(a.id,{versionId:a.versionId,requestId:crypto.randomUUID()});assert.equal(r.status,409,change);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,0);h.close();
  }
});

test('capacity enforced atomically: concurrent final-slot copies and duplicate retries',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed(),now=new Date().toISOString();
  for(let i=0;i<98;i++)h.sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run('filler'+i,a.owner,'占位',now,now,'none');
  const replies=await Promise.all([1,2].map(()=>h.request(a.id,{versionId:a.versionId,requestId:crypto.randomUUID()})));
  assert.deepEqual(replies.map(r=>r.status).sort(),[201,429]);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,100);
  h.sqlite.prepare('DELETE FROM motes_apps WHERE app_id=?').run('filler0');h.sqlite.prepare('DELETE FROM forma_projects WHERE id=?').run('filler0');
  const body={versionId:a.versionId,requestId:crypto.randomUUID()},same=await Promise.all([h.request(a.id,body),h.request(a.id,body)]);
  assert.ok(same.every(r=>[200,201].includes(r.status)));assert.equal(same[0].data.project.id,same[1].data.project.id);
});

const diffSource=ts.transpileModule(await readFile(new URL('../lib/motes/line-diff.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {compareLines}=await import('data:text/javascript;base64,'+Buffer.from(diffSource).toString('base64'));
test('line diff reconstructs both versions, handles repeated lines and bounds large inputs',()=>{
  for(const [a,b] of [['a\nb\na','a\na\nc'],['same','same'],['','hello'],['a\nb','b\na'],['a\r\nb','a\nb\nc']]){
    const diff=compareLines(a,b);
    assert.equal(diff.lines.filter(l=>l.kind!=='added').map(l=>l.text).join('\n'),a.replaceAll('\r\n','\n'));
    assert.equal(diff.lines.filter(l=>l.kind!=='removed').map(l=>l.text).join('\n'),b.replaceAll('\r\n','\n'));
  }
  assert.equal(compareLines('a\n'.repeat(1000),'b\n'.repeat(1000)).coarse,true);
  const large=compareLines('a'.repeat(180000),'b'.repeat(180000));assert.equal(large.limited,true);assert.ok(large.lines.every(l=>l.text.length<=100000));
  assert.ok(compareLines('a\n'.repeat(5000),'b\n'.repeat(5000)).lines.length<=2800);
});
