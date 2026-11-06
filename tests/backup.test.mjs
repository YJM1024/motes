import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

async function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0000_great_roland_deschain.sql','0001_first_wind_dancer.sql','0002_workspace_settings.sql','0003_fixed_version_shares.sql','0004_version_annotations.sql'])sqlite.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const control={htmlReads:0,beforeImport:null};
  function prepare(sql,args=[]){return {sql,bind(...values){return prepare(sql,values)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){if(sql.startsWith('SELECT v.id,v.number'))control.htmlReads++;return {results:sqlite.prepare(sql).all(...args)}},run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}};}
  const key=crypto.randomUUID();globalThis[key]={DB:{prepare,async batch(statements){if(control.beforeImport&&statements[0].sql.startsWith('INSERT INTO motes_projects')){const action=control.beforeImport;control.beforeImport=null;action()}sqlite.exec('BEGIN');try{const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}}};
  const cache=new Map();async function moduleUrl(file){
    if(cache.has(file))return cache.get(file);
    let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);
    for(const declaration of ts.createSourceFile('module.ts',source,ts.ScriptTarget.Latest,true).statements.filter(n=>(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier).toReversed()){if(declaration.importClause?.isTypeOnly||declaration.isTypeOnly)continue;const spec=declaration.moduleSpecifier.text;const resolved=spec.startsWith('.')?await moduleUrl((new URL(spec+'.ts',new URL('../lib/'+file+'.ts',import.meta.url))).pathname.split('/lib/').at(-1).replace(/\.ts$/,'')):import.meta.resolve(spec);source=source.slice(0,declaration.moduleSpecifier.getStart())+JSON.stringify(resolved)+source.slice(declaration.moduleSpecifier.end);}
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url;
  }
  const backup=await import(await moduleUrl('motes/backup')),server=await import(await moduleUrl('forma/server')),security=await import(await moduleUrl('forma/security')),management=await import(await moduleUrl('motes/management'));delete globalThis[key];
  const who=visitor=>security.digest(visitor.repeat(64));
  async function seed(visitor='a',name='预算应用'){
    const own=await who(visitor),id=crypto.randomUUID(),v1=crypto.randomUUID(),v2=crypto.randomUUID(),now=new Date().toISOString();
    sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,own,name,now,now,v1);
    for(const [vid,n,mode] of [[v1,1,'model'],[v2,2,'manual']])sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(vid,id,n,'保留完整需求 '+n,'摘要 '+n,`<!doctype html><html><head><title>${name}</title></head><body>version ${n}</body></html>`,now,mode,mode==='model'?'test-model':null);
    await management.initializeWorkspace(own);
    sqlite.prepare('INSERT INTO motes_version_annotations VALUES(?,?,?,?)').run(v1,'重要第一版',1,now);
    return {id,v1,v2,owner:own,wid:`workspace:${own}`,projectId:`project:${own}`};
  }
  async function request(body,visitor='a',query='',origin='https://motes.test',raw){
    const req=new Request('https://motes.test/api/backup'+query,{method:body||raw?'POST':'GET',headers:{cookie:'forma_session='+visitor.repeat(64),...body||raw?{origin,'content-type':'application/json'}:{}},...body||raw?{body:raw??JSON.stringify(body)}:{}});
    const response=await server.route(()=>body||raw?backup.receiveBackup(req):backup.exportBackup(req));return {status:response.status,data:await response.json(),headers:response.headers};
  }
  async function preview(document,visitor='a'){return request({action:'preview',backup:document},visitor)}
  async function importDoc(document,requestId=crypto.randomUUID(),visitor='a'){const checked=await preview(document,visitor);assert.equal(checked.status,200);return request({action:'import',backup:document,previewHash:checked.data.previewHash,requestId},visitor)}
  return {sqlite,control,who,seed,request,preview,importDoc,close:()=>sqlite.close()};
}

test('export preserves full history/current pointer/annotations/settings/tags and omits identity and sharing',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed();await h.seed('a','第二应用');
  const now=new Date().toISOString(),tagId=crypto.randomUUID();
  h.sqlite.prepare('INSERT INTO motes_tags VALUES(?,?,?,?,?,?)').run(tagId,source.wid,'旅行','#123456',now,now);
  h.sqlite.prepare('INSERT INTO motes_app_tags VALUES(?,?)').run(source.id,tagId);
  h.sqlite.prepare('INSERT INTO motes_settings VALUES(?,?,?,?,?,?)').run(source.wid,'app',source.id,'previewDevice','"mobile"',now);
  h.sqlite.prepare('INSERT INTO motes_shares(id,app_id,version_id,title,token,request_id,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),source.id,source.v1,'私有标题','DO_NOT_EXPORT_TOKEN',crypto.randomUUID(),now);
  const result=await h.request(undefined,'a','?appId='+source.id);assert.equal(result.status,200);assert.match(result.headers.get('content-disposition'),/attachment/);
  const doc=result.data;assert.equal(doc.apps.length,1);assert.equal(doc.apps[0].currentVersion,1);assert.equal(doc.apps[0].versions.length,2);
  assert.equal(doc.apps[0].versions[1].mode,'manual');assert.equal(doc.apps[0].versions[0].name,'重要第一版');assert.equal(doc.apps[0].versions[0].important,true);
  assert.equal(doc.apps[0].settings.previewDevice,'mobile');assert.deepEqual(doc.apps[0].tagKeys,[doc.tags[0].key]);
  assert.doesNotMatch(JSON.stringify(doc),/DO_NOT_EXPORT_TOKEN|owner|cookie|requestId|token|APIKey/);
  for(const oldId of [source.id,source.v1,source.v2,tagId])assert.equal(JSON.stringify(doc).includes(oldId),false);
  assert.equal((await h.request(undefined,'a','?projectId='+source.projectId)).data.apps.length,2);
  assert.equal((await h.request(undefined,'b','?appId='+source.id)).status,404);
});

test('preview never writes; import creates new private IDs and idempotent receipts survive later moves',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed();
  const doc=(await h.request(undefined,'a','?appId='+source.id)).data;
  const before=h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n;
  assert.equal((await h.preview(doc)).data.versionCount,2);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,before);
  t.mock.method(globalThis,'fetch',()=>{throw Error('No model calls in backups')});
  const requestId=crypto.randomUUID(),result=await h.importDoc(doc,requestId);assert.equal(result.status,201);assert.equal(result.data.appIds.length,1);
  const id=result.data.appIds[0];assert.notEqual(id,source.id);
  const copied=h.sqlite.prepare('SELECT * FROM forma_projects WHERE id=?').get(id),versions=h.sqlite.prepare('SELECT * FROM forma_versions WHERE project_id=? ORDER BY number').all(id);
  assert.equal(copied.current_version_id,versions[0].id);assert.notEqual(versions[0].id,source.v1);assert.equal(versions[1].mode,'manual');assert.equal(versions[0].html,doc.apps[0].versions[0].html);
  assert.equal(h.sqlite.prepare('SELECT important FROM motes_version_annotations WHERE version_id=?').get(versions[0].id).important,1);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_shares WHERE app_id=?').get(id).n,0);
  h.sqlite.prepare('UPDATE motes_apps SET project_id=? WHERE app_id=?').run(source.projectId,id);
  const retry=await h.importDoc(doc,requestId);assert.equal(retry.status,200);assert.deepEqual(retry.data,result.data);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,before+1);
  assert.equal((await h.importDoc(doc,requestId,'b')).status,409);
  const changed=structuredClone(doc);changed.apps[0].name='改过内容';assert.equal((await h.importDoc(changed,requestId)).status,409);
});

test('import restores labels and effective preferences without overwriting existing same-name labels or originals',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed(),now=new Date().toISOString();
  const doc=(await h.request(undefined,'a','?appId='+source.id)).data;
  doc.tags=[{key:'travel',name:'旅行',color:'#ABCDEF'}];doc.apps[0].tagKeys=['travel'];doc.apps[0].settings.language='en';doc.apps[0].archived=true;doc.apps[0].starred=true;
  h.sqlite.prepare('INSERT INTO motes_tags VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),source.wid,'旅行','#123456',now,now);
  const result=await h.importDoc(doc);assert.equal(result.status,201);const id=result.data.appIds[0];
  const metadata=h.sqlite.prepare('SELECT * FROM motes_apps WHERE app_id=?').get(id);assert.equal(metadata.archived,1);assert.equal(metadata.starred,1);
  assert.equal(h.sqlite.prepare('SELECT color FROM motes_tags WHERE workspace_id=? AND name=?').get(source.wid,'旅行').color,'#123456');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_app_tags WHERE app_id=?').get(id).n,1);
  assert.equal(h.sqlite.prepare("SELECT value_json FROM motes_settings WHERE scope_type='app' AND scope_id=? AND setting_key='language'").get(id).value_json,'"en"');
  assert.equal(h.sqlite.prepare('SELECT current_version_id FROM forma_projects WHERE id=?').get(source.id).current_version_id,source.v1);
});

test('malformed references, unknown secrets/sharing fields, incomplete HTML and oversized streams are rejected without writes',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed(),doc=(await h.request(undefined,'a','?appId='+source.id)).data;
  for(const change of [d=>{d.owner='injected'},d=>{d.shares=[{token:'never'}]},d=>{d.apps[0].currentVersion=99},d=>{d.apps[0].tagKeys=['missing']},d=>{d.apps[0].settings.apiKey='secret'},d=>{d.apps[0].settings.creationMode=['demo']},d=>{d.apps[0].versions[0].mode=['model']},d=>{d.apps[0].versions[0].html='<p>broken</p>'},d=>{d.apps[0].versions.push(d.apps[0].versions[0])},d=>{d.apps=Array(11).fill(d.apps[0])},d=>{d.version=999}]){
    const damaged=structuredClone(doc);change(damaged);assert.equal((await h.preview(damaged)).status,422);
  }
  assert.equal((await h.request({action:'preview',backup:doc},'a','','https://evil.test')).status,403);
  assert.equal((await h.request(null,'a','','https://motes.test','{broken')).status,400);
  assert.equal((await h.request(null,'a','','https://motes.test',' '.repeat(2*1024*1024+1))).status,413);
  assert.equal((await h.request({action:'import',requestId:crypto.randomUUID(),previewHash:'wrong',backup:doc})).status,409);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,1);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_requests').get().n,0);
});

test('bounded bulk import accepts 200 complete versions and rejects totals or per-app history above limits',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed(),doc=(await h.request(undefined,'a','?appId='+source.id)).data;
  const base=structuredClone(doc.apps[0]),version=base.versions[0];
  doc.apps=Array.from({length:4},(_,i)=>({...structuredClone(base),name:'应用'+i,currentVersion:25,versions:Array.from({length:50},(_,n)=>({...version,number:n+1,html:'<!doctype html><html><body>'+('x'.repeat(2000))+'</body></html>'}))}));
  const result=await h.importDoc(doc);assert.equal(result.status,201);assert.equal(result.data.appIds.length,4);
  for(const id of result.data.appIds){assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions WHERE project_id=?').get(id).n,50);assert.equal(h.sqlite.prepare('SELECT v.number FROM forma_projects p JOIN forma_versions v ON v.id=p.current_version_id WHERE p.id=?').get(id).number,25)}
  const tooMany=structuredClone(doc);tooMany.apps[0].versions.push({...version,number:51});assert.equal((await h.preview(tooMany)).status,422);
  const perApp=structuredClone(doc);perApp.apps=[{...base,versions:Array.from({length:61},(_,n)=>({...version,number:n+1}))}];assert.equal((await h.preview(perApp)).status,422);
});

test('export uses SQL size/count preflight before materializing HTML',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed();
  const html='<!doctype html><html><body>'+'x'.repeat(170000)+'</body></html>',now=new Date().toISOString();
  for(let n=3;n<=15;n++)h.sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),source.id,n,'需求','摘要',html,now,'manual',null);
  const result=await h.request(undefined,'a','?appId='+source.id);assert.equal(result.status,413);assert.equal(h.control.htmlReads,0);
  for(let n=0;n<10;n++)await h.seed('a','额外应用'+n);
  assert.equal((await h.request(undefined,'a','?projectId='+source.projectId)).status,413);assert.equal(h.control.htmlReads,0);
});

test('import failures roll back project/app/version/settings/annotations/receipt and retry remains safe',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed(),doc=(await h.request(undefined,'a','?appId='+source.id)).data;
  const tables=['forma_projects','forma_versions','motes_projects','motes_apps','motes_settings','motes_version_annotations','forma_requests'];
  const counts=()=>tables.map(table=>h.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n),before=counts();
  h.sqlite.exec("CREATE TRIGGER fail_import BEFORE INSERT ON forma_requests WHEN NEW.mode='backup-import' BEGIN SELECT RAISE(ABORT,'simulated import failure'); END");
  const requestId=crypto.randomUUID();assert.equal((await h.importDoc(doc,requestId)).status,500);assert.deepEqual(counts(),before);
  h.sqlite.exec('DROP TRIGGER fail_import');assert.equal((await h.importDoc(doc,requestId)).status,201);
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('capacity is fenced in the transaction and concurrent duplicate receipts create only one import',async t=>{
  const h=await harness();t.after(h.close);const source=await h.seed(),doc=(await h.request(undefined,'a','?appId='+source.id)).data;
  const requestId=crypto.randomUUID(),results=await Promise.all([h.importDoc(doc,requestId),h.importDoc(doc,requestId)]);
  assert.ok(results.every(r=>[200,201].includes(r.status)));assert.deepEqual(results[0].data,results[1].data);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,2);
  h.control.beforeImport=()=>{const now=new Date().toISOString();while(h.sqlite.prepare('SELECT count(*) AS n FROM motes_projects').get().n<50)h.sqlite.prepare('INSERT INTO motes_projects(id,workspace_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),source.wid,'占位',now,now)};
  assert.equal((await h.importDoc(doc)).status,429);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_projects').get().n,2);
});
