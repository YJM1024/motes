import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const initialSql=await readFile(new URL('../drizzle/0000_great_roland_deschain.sql',import.meta.url),'utf8');
const managementSql=await readFile(new URL('../drizzle/0001_first_wind_dancer.sql',import.meta.url),'utf8');
async function harness({migrate=true}={}) {
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(initialSql);
  if(migrate)sqlite.exec(managementSql);
  function prepare(sql,args=[]) {return {bind(...values){return prepare(sql,values)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return {results:sqlite.prepare(sql).all(...args)}},run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}}
  const key=crypto.randomUUID();
  globalThis[key]={DB:{prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(statement=>statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}}};
  const cache=new Map();
  async function moduleUrl(file){
    if(cache.has(file))return cache.get(file);
    let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');
    source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);
    const imports=[...source.matchAll(/(?:from\s+)(['"])(\.[^'"]+)\1/g)];
    for(const match of imports){
      const target=new URL(match[2]+'.ts',new URL('../lib/'+file+'.ts',import.meta.url));
      const relative=target.pathname.split('/lib/').at(-1).replace(/\.ts$/,'');
      source=source.replaceAll(match[1]+match[2]+match[1],JSON.stringify(await moduleUrl(relative)));
    }
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url;
  }
  const management=await import(await moduleUrl('motes/management'));
  const security=await import(await moduleUrl('forma/security'));
  const server=await import(await moduleUrl('forma/server'));delete globalThis[key];
  const tokens={a:'a'.repeat(64),b:'b'.repeat(64)};
  async function who(visitor='a'){return security.digest(tokens[visitor])}
  async function seed(visitor='a',title='旧应用',identifier=crypto.randomUUID()){
    const own=await who(visitor),now='2026-10-29T10:00:00.000Z',versionId=crypto.randomUUID();
    sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(identifier,own,title,now,now,versionId);
    sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(versionId,identifier,1,'旧需求','旧摘要','<!doctype html><html><body>keep me</body></html>',now,'demo',null);
    return {id:identifier,currentVersionId:versionId,owner:own};
  }
  async function request(body,visitor='a',query='',origin='https://motes.test'){
    const req=new Request('https://motes.test/api/workspace'+query,{method:body?'POST':'GET',headers:{cookie:'forma_session='+tokens[visitor],...(body?{origin,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const response=await server.route(()=>body?management.manageWorkspace(req):management.getWorkspace(req));
    return {status:response.status,data:await response.json()};
  }
  return {sqlite,management,seed,request,who,close:()=>sqlite.close()};
}

test('schema-only migration is repeatable and runtime initialization preserves legacy rows and isolates owners',async(t)=>{
  const h=await harness({migrate:false});t.after(h.close);
  const a=await h.seed('a'),b=await h.seed('b');
  const secondId=crypto.randomUUID();
  h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(secondId,a.id,2,'第二版需求','第二版摘要','<!doctype html><html><body>second</body></html>','2026-10-29T11:00:00.000Z','demo',null);
  h.sqlite.prepare('UPDATE forma_projects SET current_version_id=? WHERE id=?').run(secondId,a.id);
  const before={apps:h.sqlite.prepare('SELECT * FROM forma_projects ORDER BY id').all(),versions:h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY id').all()};
  h.sqlite.exec(managementSql);h.sqlite.exec(managementSql);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_projects ORDER BY id').all(),before.apps);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY id').all(),before.versions);
  const statements=managementSql.replace(/--[^\r\n]*/g,'').split(';').map(sql=>sql.trim()).filter(Boolean);
  assert.ok(statements.every(sql=>/^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b/i.test(sql)),'Migrations only declare schema; backfills run per owner at runtime');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_workspaces').get().n,0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_apps').get().n,0);
  const own=(await h.request()).data;
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_workspaces').get().n,1,'GET initializes only the current owner');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_apps').get().n,1);
  const other=(await h.request(undefined,'b')).data;
  await h.request();await h.request(undefined,'b');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_workspaces').get().n,2);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_apps').get().n,2);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_projects ORDER BY id').all(),before.apps);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY id').all(),before.versions);
  assert.notEqual(own.workspace.id,other.workspace.id);
  assert.equal(own.profile.kind,'test');assert.equal(own.apps[0].id,a.id);assert.equal(other.apps[0].id,b.id);
  assert.equal(own.apps[0].currentVersionId,secondId);
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal('owner' in own.workspace,false,'Owner hashes are never part of the UI contract');
});

test('initialization is idempotent and newly generated applications receive metadata without moving existing apps',async(t)=>{
  const h=await harness();t.after(h.close);
  const initial=(await h.request()).data;
  assert.equal(initial.projects.length,1);assert.equal(initial.apps.length,0);
  const legacy=await h.seed();
  await Promise.all([h.request(),h.request()]);
  const first=(await h.request()).data;
  assert.equal(first.apps[0].id,legacy.id);assert.equal(first.projects.length,1);
  const created=(await h.request({action:'project.create',name:'工具集'})).data;
  const target=created.projects.find(p=>!p.isDefault);
  await h.request({action:'app.update',appId:legacy.id,projectId:target.id});
  await h.management.initializeWorkspace(await h.who());
  h.sqlite.exec(managementSql);
  assert.equal((await h.request()).data.apps[0].projectId,target.id);
});

test('project, app, profile and tag management persist atomically without touching versions',async(t)=>{
  const h=await harness();t.after(h.close);const legacy=await h.seed();
  let result=await h.request({action:'project.create',name:'计算工具',description:'个人工具集'});assert.equal(result.status,200);
  const project=result.data.projects.find(p=>!p.isDefault);
  result=await h.request({action:'project.update',projectId:project.id,name:'常用工具',starred:true});assert.equal(result.status,200);
  result=await h.request({action:'tag.create',name:'效率',color:'#aaBBcc'});assert.equal(result.status,200);
  const tag=result.data.tags[0];assert.equal(tag.color,'#AABBCC');
  result=await h.request({action:'app.update',appId:legacy.id,name:'新应用名',description:'一个小工具',projectId:project.id,starred:true,tagIds:[tag.id]});
  assert.equal(result.status,200);let app=result.data.apps[0];
  assert.equal(app.name,'新应用名');assert.equal(app.projectId,project.id);assert.equal(app.starred,true);assert.deepEqual(app.tagIds,[tag.id]);
  assert.equal(h.sqlite.prepare('SELECT title FROM forma_projects WHERE id=?').get(legacy.id).title,'新应用名');
  result=await h.request({action:'tag.update',tagId:tag.id,name:'重要',color:'#123456'});assert.equal(result.status,200);
  assert.equal(result.data.tags[0].name,'重要');
  result=await h.request({action:'profile.update',displayName:'测试创作者'});assert.equal(result.data.profile.displayName,'测试创作者');
  result=await h.request({action:'app.update',appId:legacy.id,archived:true});assert.equal(result.status,200);assert.equal(result.data.apps[0].archived,true);
  assert.equal((await h.request()).data.apps.length,0);
  assert.equal((await h.request(undefined,'a','?archived=archived')).data.apps.length,1);
  await h.request({action:'app.update',appId:legacy.id,archived:false});
  await h.request({action:'project.update',projectId:project.id,archived:true});
  assert.equal((await h.request()).data.apps.length,0,'Archived projects hide their applications in the active list');
  await h.request({action:'project.update',projectId:project.id,archived:false});
  result=await h.request({action:'tag.delete',tagId:tag.id});assert.equal(result.status,200);
  assert.deepEqual(result.data.apps[0].tagIds,[]);assert.equal(result.data.tags.length,0);
  const persisted=(await h.request()).data;assert.equal(persisted.apps[0].name,'新应用名');
  assert.equal(persisted.profile.displayName,'测试创作者');assert.equal(persisted.projects.find(p=>p.id===project.id).starred,true);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,1);
  assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects').get().current_version_id,legacy.currentVersionId);
  assert.match(h.sqlite.prepare('SELECT html FROM forma_versions').get().html,/keep me/);
});

test('filters cover names, descriptions and tags, sorting, project scope, stars and navigation-only reads',async(t)=>{
  const h=await harness();t.after(h.close);const z=await h.seed('a','Zulu'),a=await h.seed('a','Alpha');
  let state=(await h.request({action:'tag.create',name:'旅行'})).data;const tag=state.tags[0];
  await h.request({action:'app.update',appId:z.id,description:'预算计算',starred:true,tagIds:[tag.id]});
  let result=await h.request(undefined,'a','?sort=name');assert.deepEqual(result.data.apps.map(a=>a.name),['Alpha','Zulu']);
  for(const query of ['q=zulu','q='+encodeURIComponent('预算'),'q='+encodeURIComponent('旅行'),'tagId='+tag.id,'starred=true']){
    result=await h.request(undefined,'a','?'+query);assert.equal(result.status,200);assert.deepEqual(result.data.apps.map(a=>a.id),[z.id]);
  }
  assert.equal((await h.request(undefined,'a','?q=NOTFOUND')).data.apps.length,0);
  state=(await h.request({action:'project.create',name:'空项目'})).data;
  const empty=state.projects.find(p=>!p.isDefault);
  assert.equal((await h.request(undefined,'a','?projectId='+empty.id)).data.apps.length,0);
  const navigation=await h.request(undefined,'a','?listOnly=true');assert.equal(navigation.data.apps.length,0);assert.equal(navigation.data.projects.length,2);assert.equal(navigation.data.tags.length,1);
  assert.equal((await h.request(undefined,'a','?starred=false')).data.apps[0].id,a.id);
});

test('cross-owner and cross-workspace references are rejected and failed updates leave data unchanged',async(t)=>{
  const h=await harness();t.after(h.close);const own=await h.seed('a'),other=await h.seed('b');
  const a=(await h.request()).data,b=(await h.request({action:'tag.create',name:'私有标签'},'b')).data;
  for(const action of [
    {action:'app.update',appId:other.id,name:'越权改名'},
    {action:'app.update',appId:own.id,projectId:b.workspace.defaultProjectId},
    {action:'app.update',appId:own.id,name:'不应保存',tagIds:[b.tags[0].id]},
    {action:'project.update',projectId:b.workspace.defaultProjectId,name:'越权项目'},
    {action:'tag.update',tagId:b.tags[0].id,name:'越权标签'},
    {action:'tag.delete',tagId:b.tags[0].id},
    {action:'project.create',workspaceId:b.workspace.id,name:'越权空间'},
  ])assert.equal((await h.request(action)).status,404);
  for(const query of ['workspaceId='+b.workspace.id,'projectId='+b.workspace.defaultProjectId,'tagId='+b.tags[0].id])assert.equal((await h.request(undefined,'a','?'+query)).status,404);
  assert.equal((await h.request()).data.apps[0].name,'旧应用');
  assert.equal((await h.request(undefined,'b')).data.tags[0].name,'私有标签');
  assert.equal((await h.request({action:'project.create',name:'不可信来源'},'a','','https://evil.test')).status,403);
  assert.equal((await h.request()).data.projects.length,a.projects.length);
});

test('invalid inputs, destructive actions, default project archival and duplicate tags fail clearly',async(t)=>{
  const h=await harness();t.after(h.close);const app=await h.seed();const state=(await h.request()).data;
  for(const body of [
    {action:'app.delete',appId:app.id}, {action:'project.create',name:' '}, {action:'project.create',name:'x'.repeat(81)},
    {action:'project.update',projectId:state.workspace.defaultProjectId}, {action:'profile.update',displayName:'x'.repeat(41)},
    {action:'tag.create',name:'标签',color:'red'}, {action:'tag.create',name:'标签',owner:'another'},
    {action:'app.update',appId:app.id,starred:'true'}, {action:'app.update',appId:app.id,tagIds:['same','same']},
    {action:'app.update',appId:app.id,tagIds:Array.from({length:11},()=>crypto.randomUUID())},
  ])assert.equal((await h.request(body)).status,400,JSON.stringify(body));
  assert.equal((await h.request({action:'project.update',projectId:state.workspace.defaultProjectId,archived:true})).status,409);
  assert.equal((await h.request({action:'tag.create',name:'重复'})).status,200);
  assert.equal((await h.request({action:'tag.create',name:'重复'})).status,409);
  for(const query of ['sort=unknown','archived=unknown','starred=1','listOnly=yes','q='+'x'.repeat(101)])assert.equal((await h.request(undefined,'a','?'+query)).status,400);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,1);
});

test('project and tag counts are enforced in the insert SQL, including concurrent requests',async(t)=>{
  const h=await harness();t.after(h.close);const state=(await h.request()).data,wid=state.workspace.id,now=new Date().toISOString();
  for(let i=0;i<48;i++)h.sqlite.prepare('INSERT INTO motes_projects(id,workspace_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),wid,'项目'+i,now,now);
  const projects=await Promise.all([h.request({action:'project.create',name:'最后一席'}),h.request({action:'project.create',name:'超过限额'})]);
  assert.deepEqual(projects.map(p=>p.status).sort(),[200,429]);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_projects').get().n,50);
  for(let i=0;i<49;i++)h.sqlite.prepare('INSERT INTO motes_tags(id,workspace_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),wid,'标签'+i,now,now);
  const tags=await Promise.all([h.request({action:'tag.create',name:'最后标签'}),h.request({action:'tag.create',name:'超过限额'})]);
  assert.deepEqual(tags.map(p=>p.status).sort(),[200,429]);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_tags').get().n,50);
});
