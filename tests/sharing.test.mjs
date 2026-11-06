import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {createServer} from 'node:http';

const migrations=['0000_great_roland_deschain','0001_first_wind_dancer','0002_workspace_settings','0003_fixed_version_shares','0004_version_annotations'];
async function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of migrations)sqlite.exec(await readFile(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8'));
  const control={beforeInsert:null,failShareRead:false};
  function prepare(sql,args=[]){return {bind(...values){return prepare(sql,values)},async first(){if(control.failShareRead&&sql.includes('WHERE s.id=?')){control.failShareRead=false;throw Error('simulated read outage');}return sqlite.prepare(sql).get(...args)??null;},async all(){return {results:sqlite.prepare(sql).all(...args)}},run(){if(control.beforeInsert&&/^INSERT INTO motes_shares/.test(sql)){const run=control.beforeInsert;control.beforeInsert=null;run();}return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}};}
  const key=crypto.randomUUID(),env={DB:{prepare,async batch(statements){sqlite.exec('BEGIN');try{const values=statements.map(s=>s.run());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};globalThis[key]=env;
  const cache=new Map();
  async function moduleUrl(file){
    if(cache.has(file))return cache.get(file);
    let source=await readFile(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');
    source=source.replace("import { env } from 'cloudflare:workers';",`const env=globalThis[${JSON.stringify(key)}];`);
    for(const declaration of ts.createSourceFile('module.ts',source,ts.ScriptTarget.Latest,true).statements.filter(n=>(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier).toReversed()){if(declaration.importClause?.isTypeOnly||declaration.isTypeOnly)continue;const spec=declaration.moduleSpecifier.text;const resolved=spec.startsWith('.')?await moduleUrl((new URL(spec+'.ts',new URL('../lib/'+file+'.ts',import.meta.url))).pathname.split('/lib/').at(-1).replace(/\.ts$/,'')):import.meta.resolve(spec);source=source.slice(0,declaration.moduleSpecifier.getStart())+JSON.stringify(resolved)+source.slice(declaration.moduleSpecifier.end);}
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file,url);return url;
  }
  const sharing=await import(await moduleUrl('motes/sharing')),server=await import(await moduleUrl('forma/server')),security=await import(await moduleUrl('forma/security')),page=await import(await moduleUrl('motes/shared-page'));
  let routeSource=await readFile(new URL('../app/share/[token]/route.ts',import.meta.url),'utf8');
  for(const file of ['motes/sharing','motes/shared-page'])routeSource=routeSource.replaceAll(`'@/lib/${file}'`,JSON.stringify(await moduleUrl(file)));
  const routeJs=ts.transpileModule(routeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const pageRoute=await import('data:text/javascript;base64,'+Buffer.from(routeJs).toString('base64'));
  delete globalThis[key];
  async function seed(visitor='a'){
    const own=await security.digest(visitor.repeat(64)),id=crypto.randomUUID(),versionId=crypto.randomUUID(),current=crypto.randomUUID(),now=new Date().toISOString();
    sqlite.prepare('INSERT INTO forma_projects VALUES(?,?,?,?,?,?)').run(id,own,'私有标题',now,now,current);
    for(const [v,n,html] of [[versionId,1,'<!doctype html><html><body><button onclick="this.textContent=42">公开的第一版</button></body></html>'],[current,2,'<html><body>PRIVATE OTHER VERSION</body></html>']])sqlite.prepare('INSERT INTO forma_versions VALUES(?,?,?,?,?,?,?,?,?)').run(v,id,n,'PRIVATE PROMPT','PRIVATE SUMMARY',html,now,'model','PRIVATE MODEL');
    return {id,versionId,current,owner:own};
  }
  async function request(action,appId,body={},visitor='a',origin='https://motes.test',shareId=''){
    const method=action==='list'?'GET':action==='revoke'?'DELETE':'POST';
    const req=new Request('https://motes.test/api/projects/'+appId+'/shares',{method,headers:{origin,cookie:visitor?'forma_session='+visitor.repeat(64):'','content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
    const response=await server.route(()=>action==='list'?sharing.listShares(req,appId):action==='revoke'?sharing.revokeShare(req,appId,shareId):sharing.createShare(req,appId));
    return {status:response.status,data:await response.json()};
  }
  const create=(a,body={},visitor='a')=>request('create',a.id,{versionId:a.versionId,requestId:crypto.randomUUID(),...body},visitor);
  return {sqlite,sharing,page,pageRoute,control,seed,request,create,env,close:()=>sqlite.close()};
}

test('links expose only a fixed version and snapshot title; generation/restore/rename never retarget them',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed();
  t.mock.method(globalThis,'fetch',()=>{throw Error('Sharing must not call a model');});
  assert.deepEqual((await h.request('list',a.id)).data.shares,[],'Viewing does not create links');
  const original=h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY id').all();
  const made=await h.create(a);assert.equal(made.status,201);const share=made.data.share;
  assert.equal(share.versionId,a.versionId);assert.equal(share.versionNumber,1);assert.match(share.path,/^\/share\/[a-f0-9]{64}$/);
  assert.ok(!('owner' in share)&&!('html' in share)&&!('prompt' in share));
  h.sqlite.prepare('UPDATE forma_projects SET title=?,current_version_id=? WHERE id=?').run('新标题',a.current,a.id);
  let result=await h.sharing.getSharedVersion(share.path.split('/').at(-1));assert.equal(result.status,200);
  const publicVersion=await result.json();assert.deepEqual(Object.keys(publicVersion).sort(),['html','title','versionNumber']);assert.equal(publicVersion.title,'私有标题');assert.equal(publicVersion.versionNumber,1);assert.match(publicVersion.html,/公开的第一版/);
  assert.doesNotMatch(JSON.stringify(publicVersion),/PRIVATE|owner|versionId|model|prompt/);
  h.sqlite.prepare('UPDATE forma_projects SET current_version_id=? WHERE id=?').run(a.versionId,a.id);
  assert.deepEqual(await h.sharing.readSharedVersion(share.path.split('/').at(-1)),publicVersion);
  assert.deepEqual(h.sqlite.prepare('SELECT * FROM forma_versions ORDER BY id').all(),original);
  assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(result.headers.get('Referrer-Policy'),'no-referrer');assert.equal(result.headers.get('Set-Cookie'),null);
});

test('owner, source-version, Origin, IDs and body validation reject cross-visitor access',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed(),b=await h.seed('b');const share=(await h.create(a)).data.share;
  assert.equal((await h.request('list',a.id,{},'b')).status,404);
  assert.equal((await h.request('list',a.id,{},'')).status,401);
  assert.equal((await h.create(a,{},'b')).status,404);
  assert.equal((await h.create(a,{versionId:b.versionId})).status,404);
  assert.equal((await h.request('revoke',a.id,{},'b','https://motes.test',share.id)).status,404);
  assert.equal((await h.request('revoke',b.id,{},'b','https://motes.test',share.id)).status,404);
  for(const body of [{versionId:'',requestId:crypto.randomUUID()},{versionId:a.versionId,requestId:'bad'},{versionId:a.versionId,requestId:crypto.randomUUID(),owner:'another'},{versionId:'x'.repeat(129),requestId:crypto.randomUUID()}])assert.equal((await h.request('create',a.id,body)).status,400);
  assert.equal((await h.request('create',a.id,{versionId:a.versionId,requestId:crypto.randomUUID()},'a','https://evil.test')).status,403);
  assert.equal((await h.request('revoke',a.id,{},'a','https://evil.test',share.id)).status,403);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_shares').get().n,1);
});

test('revocation immediately invalidates all future public reads and idempotent retries never revive it',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed(),body={requestId:crypto.randomUUID()};const made=await h.create(a,body),share=made.data.share,token=share.path.split('/').at(-1);
  assert.equal((await h.create(a,body)).data.share.id,share.id);
  assert.equal((await h.request('revoke',a.id,{},'a','https://motes.test',share.id)).status,200);
  assert.equal((await h.request('revoke',a.id,{},'a','https://motes.test',share.id)).status,200);
  for(const candidate of [token,'0'.repeat(64),'bad',token.toUpperCase(),'<script>']){
    const r=await h.sharing.getSharedVersion(candidate);assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:'分享不可用，链接可能已撤销或不存在。'});
  }
  const again=await h.create(a,body);assert.equal(again.status,200);assert.ok(again.data.share.revokedAt);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_shares').get().n,1);
  assert.ok((await h.request('list',a.id)).data.shares[0].revokedAt);
  assert.notEqual((await h.create(a)).data.share.path,share.path,'Explicit new share after revocation gets a new high-entropy token');
});

test('concurrent double clicks, response outages and conflicting request IDs preserve exactly one share',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed(),b=await h.seed('b'),body={requestId:crypto.randomUUID()};
  const both=await Promise.all([h.create(a,body),h.create(a,body)]);assert.deepEqual(both.map(r=>r.status).sort(),[200,201]);assert.equal(both[0].data.share.id,both[1].data.share.id);
  assert.equal((await h.create(a,{...body,versionId:a.current})).status,409);assert.equal((await h.create(b,body,'b')).status,409);
  const failedBody={requestId:crypto.randomUUID()};h.control.failShareRead=true;assert.equal((await h.create(a,failedBody)).status,500);
  const retry=await h.create(a,failedBody);assert.equal(retry.status,200);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_shares').get().n,2);
});

test('counts and source validation are enforced in the atomic insertion SQL',async t=>{
  const h=await harness();t.after(h.close);const a=await h.seed();
  for(let i=0;i<19;i++)assert.equal((await h.create(a)).status,201);
  const last=await Promise.all([h.create(a),h.create(a)]);assert.deepEqual(last.map(r=>r.status).sort(),[201,429]);
  const first=(await h.request('list',a.id)).data.shares[0];await h.request('revoke',a.id,{},'a','https://motes.test',first.id);assert.equal((await h.create(a)).status,201);
  const own=await h.seed();const now=new Date().toISOString();
  for(let i=0;i<179;i++)h.sqlite.prepare('INSERT INTO motes_shares VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),own.id,own.versionId,'旧链接',crypto.randomUUID().replaceAll('-','').repeat(2),crypto.randomUUID(),now,now);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_shares').get().n,200);assert.equal((await h.create(own)).status,429,'Total retained records cap includes revoked links');
  assert.equal(h.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('ownership/version mutations between validation and insertion are fenced without orphan links',async t=>{
  for(const mutation of ['owner','version']){
    const h=await harness(),a=await h.seed();h.control.beforeInsert=()=>mutation==='owner'?h.sqlite.prepare('UPDATE forma_projects SET owner=? WHERE id=?').run('different',a.id):h.sqlite.prepare('DELETE FROM forma_versions WHERE id=?').run(a.versionId);
    assert.equal((await h.create(a)).status,404,mutation);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM motes_shares').get().n,0);h.close();
  }
  const h=await harness();t.after(h.close);const a=await h.seed(),b=await h.seed('b');
  const token='a'.repeat(64);h.sqlite.prepare('INSERT INTO motes_shares VALUES(?,?,?,?,?,?,?,NULL)').run(crypto.randomUUID(),a.id,b.versionId,'forged',token,crypto.randomUUID(),new Date().toISOString());
  assert.equal(await h.sharing.readSharedVersion(token),null,'Even a malformed cross-app association never discloses that other version');
});

test('public HTML escapes hostile source/title and uses a policy-bound opaque iframe, never parent execution',async t=>{
  const h=await harness();t.after(h.close);
  const html='<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://evil.test"></head><body><script>parent.document.body.innerHTML="hijack"</script></body></html>';
  const response=h.page.sharedPageResponse({title:'</title><script>titleAttack()</script>',versionNumber:7,html});
  const text=await response.text();assert.equal(response.status,200);assert.match(text,/sandbox="allow-scripts allow-forms"/);assert.doesNotMatch(text,/allow-same-origin|allow-top-navigation|allow-popups/);
  assert.match(text,/&lt;script&gt;parent\.document/);assert.doesNotMatch(text,/<script>parent\.document/);assert.doesNotMatch(text,/<script>titleAttack/);
  assert.match(text,/doc\.querySelectorAll\('meta\[http-equiv\]'\)/);assert.match(text,/connect-src 'none'/);assert.match(text,/frame-src 'none'/);
  assert.match(response.headers.get('Content-Security-Policy'),/frame-src 'self'/);assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.match(text,/不能编辑原应用/);assert.match(text,/完整 HTML 源码/);
  const error=h.page.sharedPageResponse(null);assert.equal(error.status,404);assert.doesNotMatch(await error.text(),/<iframe/);
});

test('share HTTP route returns 200 without server DOMParser and uniform 404 after revocation',async t=>{
  const h=await harness();t.after(h.close);assert.equal(typeof globalThis.DOMParser,'undefined');const a=await h.seed(),share=(await h.create(a)).data.share;
  const server=createServer(async(req,res)=>{
    const token=req.url.split('/').at(-1),result=await h.pageRoute.GET(new Request('http://127.0.0.1'+req.url),{params:Promise.resolve({token})});
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let direct=false;
  const get=async path=>{
    if(!direct)try{return await fetch(origin+path);}catch(error){if(error.cause?.code!=='EACCES')throw error;direct=true;t.diagnostic('Local TCP denied by environment; exercising the production HTTP Request/Response handler directly.');}
    return h.pageRoute.GET(new Request(origin+path),{params:Promise.resolve({token:path.split('/').at(-1)})});
  };
  const response=await get(share.path),html=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/html/);assert.match(response.headers.get('Cache-Control'),/no-store/);
  assert.match(html,/sandbox="allow-scripts allow-forms"/);assert.match(html,/公开的第一版/);assert.doesNotMatch(html,/PRIVATE PROMPT|PRIVATE SUMMARY|PRIVATE OTHER VERSION|PRIVATE MODEL/);
  for(const internal of [a.id,a.owner,a.versionId,a.current])assert.equal(html.includes(internal),false,'Public page must not reveal internal identifiers');
  await h.request('revoke',a.id,{},'a','https://motes.test',share.id);
  const revoked=await get(share.path),missing=await get('/share/'+'0'.repeat(64));assert.equal(revoked.status,404);assert.equal(missing.status,404);assert.equal(await revoked.text(),await missing.text());
});

test('runtime bridge metadata is present only for explicitly shared-owner apps',async t=>{
  const h=await harness();t.after(h.close);const legacy=await h.seed(),legacyShare=await h.create(legacy),legacyToken=legacyShare.data.share.path.split('/').at(-1),legacyVersion=await h.sharing.readSharedVersion(legacyToken);
  assert.deepEqual(Object.keys(legacyVersion).sort(),['html','title','versionNumber']);
  const legacyHtml=h.page.sharedPage(legacyVersion,undefined,'snapshot','https://motes.test');assert.doesNotMatch(legacyHtml,new RegExp(legacy.id+'|'+legacy.versionId));assert.doesNotMatch(legacyHtml,/motes\.runtime-data\.v1|\/api\/runtime-data/);assert.match(legacyHtml,/预览中的输入属于临时状态/);assert.match(legacyHtml,/分享只包含此版本标题和源码/);
  h.env.MOTES_WORKSPACE_VISIBILITY='shared';const shared=await h.seed('b');h.sqlite.prepare('UPDATE forma_projects SET owner=? WHERE id=?').run('motes-public-demo-v1',shared.id);const sharedShare=await h.create(shared,{},'a'),sharedToken=sharedShare.data.share.path.split('/').at(-1),sharedVersion=await h.sharing.readSharedVersion(sharedToken);
  assert.deepEqual({appId:sharedVersion.appId,versionId:sharedVersion.versionId,runtimeData:sharedVersion.runtimeData},{appId:shared.id,versionId:shared.versionId,runtimeData:true});
  const sharedHtml=h.page.sharedPage(sharedVersion,undefined,'snapshot','https://motes.test');assert.match(sharedHtml,new RegExp(shared.id));assert.match(sharedHtml,new RegExp(shared.versionId));assert.match(sharedHtml,/motes\.runtime-data\.v1|\/api\/runtime-data/);assert.match(sharedHtml,/公共工作空间/);assert.match(sharedHtml,/所有访客读写同一份数据/);assert.match(sharedHtml,/未接入 SDK 的输入仅在当前预览中有效/);assert.doesNotMatch(sharedHtml,/预览中的输入属于临时状态/);
  const publicResponse=await h.sharing.getSharedVersion(sharedToken),publicVersion=await publicResponse.json();assert.deepEqual(Object.keys(publicVersion).sort(),['html','title','versionNumber']);
});

test('0003 migration is schema-only and chains from the stable 0002 snapshot',async()=>{
  const sql=await readFile(new URL('../drizzle/0003_fixed_version_shares.sql',import.meta.url),'utf8');
  const statements=sql.replace(/--[^\r\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);assert.ok(statements.every(s=>/^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b/i.test(s)));
  const prior=JSON.parse(await readFile(new URL('../drizzle/meta/0002_snapshot.json',import.meta.url))),next=JSON.parse(await readFile(new URL('../drizzle/meta/0003_snapshot.json',import.meta.url)));
  assert.equal(next.prevId,prior.id);assert.deepEqual(Object.keys(next.tables).filter(t=>!(t in prior.tables)),['motes_shares']);
});
