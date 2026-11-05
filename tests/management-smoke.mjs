import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { requirePrivateWorkspace } from './http-smoke-helpers.mjs';

const origin=(process.argv[2]||'http://127.0.0.1:5173').replace(/\/$/,'');
const output=process.argv[3];
const result={passed:false,origin,testedAt:new Date().toISOString(),modelCalls:0,checks:[]};
async function visitor(){
  const response=await fetch(origin+'/api/session');assert.equal(response.status,200,'Session initialization');
  const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'New visitor cookie');
  // Consume but never log or persist session data/cookies.
  await response.json();return cookie;
}
async function request(cookie,path,body,status=200,source=origin){
  const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...body?{'Content-Type':'application/json',Origin:source}:{}},...body?{body:JSON.stringify(body)}:{}});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data={error:text}}
  assert.equal(response.status,status,`${path}: ${data.error||'unexpected status'}`);return data;
}
try{
  await requirePrivateWorkspace(origin);
  const a=await visitor(),b=await visitor();
  const initial=await request(a,'/api/workspace'),other=await request(b,'/api/workspace');
  assert.equal(initial.profile.kind,'test');assert.notEqual(initial.workspace.id,other.workspace.id);
  assert.equal(initial.apps.length,0);result.checks.push('independent test profiles and workspaces');
  const created=await request(a,'/api/workspace',{action:'project.create',name:'本地验收项目',description:'管理功能联合验收'});
  const group=created.projects.find(p=>!p.isDefault);assert.ok(group);
  const tagged=await request(a,'/api/workspace',{action:'tag.create',name:'验收标签',color:'#123456'});const tag=tagged.tags[0];
  const first=await request(a,'/api/generate',{mode:'demo',prompt:'旅行预算计算器',requestId:crypto.randomUUID()});
  const next=await request(a,'/api/generate',{mode:'demo',prompt:'改成深色主题',projectId:first.project.id,baseVersionId:first.project.currentVersionId,requestId:crypto.randomUUID()});
  const appId=next.project.id,currentVersionId=next.project.currentVersionId,versions=structuredClone(next.project.versions);
  assert.equal(versions.length,2);assert.ok(versions.every(v=>v.mode==='demo'));
  const mapped=await request(a,'/api/workspace');assert.equal(mapped.apps.find(app=>app.id===appId).projectId,mapped.workspace.defaultProjectId);
  result.checks.push('demo application generation and idempotent metadata initialization');
  const changed=await request(a,'/api/workspace',{action:'app.update',appId,projectId:group.id,name:'验收预算应用',description:'旅行费用管理',starred:true,tagIds:[tag.id]});
  const app=changed.apps.find(app=>app.id===appId);
  assert.equal(app.projectId,group.id);assert.equal(app.name,'验收预算应用');assert.equal(app.starred,true);assert.deepEqual(app.tagIds,[tag.id]);
  await request(a,'/api/workspace',{action:'project.update',projectId:group.id,name:'验收工具集',starred:true});
  result.checks.push('project and app rename, move, descriptions, stars and tag assignment');
  for(const q of ['验收预算','旅行费用','验收标签']){
    const search=await request(a,'/api/workspace?q='+encodeURIComponent(q));assert.deepEqual(search.apps.map(app=>app.id),[appId]);
  }
  const filtered=await request(a,`/api/workspace?projectId=${group.id}&tagId=${tag.id}&starred=true&sort=name`);assert.equal(filtered.apps[0].id,appId);
  result.checks.push('name, description and tag search with combined filters');
  await request(a,'/api/workspace',{action:'app.update',appId,archived:true});
  assert.equal((await request(a,'/api/workspace')).apps.length,0);
  assert.equal((await request(a,'/api/workspace?archived=archived')).apps[0].id,appId);
  await request(a,'/api/workspace',{action:'app.update',appId,archived:false});
  await request(a,'/api/workspace',{action:'project.update',projectId:group.id,archived:true});
  assert.equal((await request(a,'/api/workspace')).apps.length,0);
  assert.equal((await request(a,'/api/workspace?archived=archived')).apps[0].id,appId);
  await request(a,'/api/workspace',{action:'project.update',projectId:group.id,archived:false});
  assert.equal((await request(a,'/api/workspace')).apps[0].id,appId);
  result.checks.push('application and project archive and restore without data loss');
  const profile=await request(a,'/api/workspace',{action:'profile.update',displayName:'本地验收用户'});assert.equal(profile.profile.displayName,'本地验收用户');
  assert.equal((await request(a,'/api/workspace')).profile.displayName,'本地验收用户');result.checks.push('test profile persistence');
  await request(a,'/api/workspace',{action:'tag.update',tagId:tag.id,name:'已更新标签',color:'#ABCDEF'});
  await request(a,'/api/workspace',{action:'app.update',appId,tagIds:[]});
  const deleted=await request(a,'/api/workspace',{action:'tag.delete',tagId:tag.id});assert.equal(deleted.tags.length,0);assert.deepEqual(deleted.apps[0].tagIds,[]);
  result.checks.push('tag update, unassignment and deletion preserve application');
  await request(b,`/api/projects/${appId}`,undefined,404);
  await request(b,'/api/workspace',{action:'app.update',appId,name:'越权'},404);
  await request(a,'/api/workspace',{action:'app.update',appId,projectId:other.workspace.defaultProjectId},404);
  await request(a,'/api/workspace?workspaceId='+other.workspace.id,undefined,404);
  await request(a,'/api/workspace',{action:'project.create',name:'外部来源'},403,'https://example.invalid');
  result.checks.push('foreign-owner and foreign-workspace references and foreign origin rejected');
  const final=await request(a,`/api/projects/${appId}`);assert.equal(final.project.title,'验收预算应用');assert.equal(final.project.currentVersionId,currentVersionId);assert.deepEqual(final.project.versions,versions);
  const refreshed=await request(a,'/api/workspace');assert.equal(refreshed.apps[0].id,appId);assert.equal(refreshed.apps[0].currentVersionId,currentVersionId);
  result.checks.push('refresh persistence and unchanged version history and current pointer');
  Object.assign(result,{passed:true,workspaceId:initial.workspace.id,projectId:group.id,appId,versionCount:versions.length});
}catch(error){result.error=error instanceof Error?error.message:String(error);process.exitCode=1}
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
