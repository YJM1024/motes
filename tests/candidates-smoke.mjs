import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin=(process.argv[2]||'http://127.0.0.1:5173').replace(/\/$/,''),output=process.argv[3];
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Candidate mutation smoke is local-only.');
const result={passed:false,origin,testedAt:new Date().toISOString(),modelCalls:0,checks:[]};
async function visitor(){const r=await fetch(origin+'/api/session',{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);const session=await r.json();return{cookie,session}}
async function call(cookie,path,body,status=200,source=origin){const r=await fetch(origin+path,{signal:AbortSignal.timeout(15000),headers:{Cookie:cookie,...body?{Origin:source,'Content-Type':'application/json'}:{}},...body?{method:'POST',body:JSON.stringify(body)}:{}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={error:text}}assert.equal(r.status,status,`${path}: ${data.error||'unexpected status'}`);return data}
try{
  const first=await visitor(),second=await visitor(),a=first.cookie,b=second.cookie;const initialWorkspace=await call(a,'/api/workspace');await call(b,'/api/workspace');
  const before=await call(a,'/api/usage');
  const input={requestId:crypto.randomUUID(),mode:'demo',prompt:'番茄钟',count:2,confirmCalls:2};
  const group=(await call(a,'/api/candidates',input,201)).group;
  assert.equal(group.mode,'demo');assert.equal(group.reservedModelCalls,0);assert.equal(group.candidates.length,2);assert.ok(group.candidates.every(c=>c.status==='ready'));assert.notEqual(group.candidates[0].html,group.candidates[1].html);
  assert.equal((await call(a,'/api/workspace')).apps.length,initialWorkspace.apps.length,'Candidates do not create applications before adoption');
  result.checks.push('two honest demo candidates saved independently before any adoption');
  const retry=(await call(a,'/api/candidates',input)).group;assert.equal(retry.id,group.id);assert.deepEqual(retry.candidates.map(c=>c.id),group.candidates.map(c=>c.id));
  assert.equal((await call(a,'/api/candidates/'+group.id)).group.candidates[0].html,group.candidates[0].html);assert.equal((await call(a,'/api/usage')).quota.demo.used,before.quota.demo.used+2);
  for(const count of [3,4]){const extra=(await call(a,'/api/candidates',{...input,requestId:crypto.randomUUID(),count,confirmCalls:count},201)).group;assert.equal(extra.candidates.length,count);assert.equal(extra.reservedModelCalls,0);assert.ok(extra.candidates.every(c=>c.status==='ready'));}
  result.checks.push('explicit 2/3/4 counts produce honest persisted demos with zero real model calls');
  result.checks.push('same request and refresh read the same persisted group without extra generation');
  const adopted=await call(a,'/api/candidates/'+group.id+'/adopt',{candidateId:group.candidates[0].id},201);
  const app=(await call(a,'/api/projects/'+adopted.appId)).project;assert.equal(app.currentVersionId,adopted.versionId);assert.equal(app.versions.length,1);assert.equal(app.versions[0].html,group.candidates[0].html);
  const adoptedRetry=await call(a,'/api/candidates/'+group.id+'/adopt',{candidateId:group.candidates[0].id});assert.deepEqual(adoptedRetry,adopted);assert.equal((await call(a,'/api/projects/'+app.id)).project.versions.length,1);
  result.checks.push('new application adoption persists once with matching HTML and pointer');
  const editing={requestId:crypto.randomUUID(),mode:'demo',prompt:'改成深色主题',appId:app.id,baseVersionId:app.currentVersionId,count:2,confirmCalls:2};
  const editGroup=(await call(a,'/api/candidates',editing,201)).group;assert.equal((await call(a,'/api/projects/'+app.id)).project.currentVersionId,app.currentVersionId);
  const updated=(await call(a,'/api/generate',{mode:'demo',prompt:'改成紫色主题',projectId:app.id,baseVersionId:app.currentVersionId,requestId:crypto.randomUUID()})).project;
  await call(a,'/api/candidates/'+editGroup.id+'/adopt',{candidateId:editGroup.candidates[1].id},409);
  assert.equal((await call(a,'/api/projects/'+app.id)).project.currentVersionId,updated.currentVersionId);assert.equal((await call(a,'/api/candidates/'+editGroup.id)).group.candidates[1].html,editGroup.candidates[1].html);
  result.checks.push('changed source pointer blocks adoption and preserves the candidate and new source version');
  const copy=await call(a,'/api/candidates/'+editGroup.id+'/adopt',{candidateId:editGroup.candidates[1].id,asNew:true},201);assert.notEqual(copy.appId,app.id);
  const copied=(await call(a,'/api/projects/'+copy.appId)).project;assert.equal(copied.versions.length,1);assert.equal(copied.versions[0].html,editGroup.candidates[1].html);assert.equal((await call(a,'/api/projects/'+app.id)).project.currentVersionId,updated.currentVersionId);
  result.checks.push('explicit private copy resolves conflict without overwriting the source');
  if(first.session.visibility!=='shared'){await call(b,'/api/candidates/'+group.id,undefined,404);await call(b,'/api/candidates/'+group.id+'/adopt',{candidateId:group.candidates[0].id},404);}else{assert.equal((await call(b,'/api/candidates/'+group.id)).group.id,group.id);}
  await call(a,'/api/candidates',{...input,requestId:crypto.randomUUID(),count:5,confirmCalls:5},400);await call(a,'/api/candidates',{...input,requestId:crypto.randomUUID(),confirmCalls:undefined},400);
  result.checks.push('workspace visibility respected; unconfirmed creation and unsupported counts rejected');
  await call(a,'/api/candidates',{...input,requestId:crypto.randomUUID()},403,'https://invalid.example');const started=Date.now();await call(a,'/api/candidates/'+group.id);result.originProtection={status:403,nextGetStatus:200,nextGetMs:Date.now()-started};
  const usage=await call(a,'/api/usage');assert.equal(usage.quota.model.used,before.quota.model.used);assert.equal(usage.items.length,before.items.length);assert.equal(usage.quota.demo.used,before.quota.demo.used+12);
  result.checks.push('origin rejection followed by a healthy GET; zero model records and correct demo budget');
  Object.assign(result,{passed:true,groupId:group.id,editGroupId:editGroup.id,adoptedAppId:app.id,copyAppId:copy.appId,demoRequests:usage.quota.demo.used});
}catch(error){result.error=error instanceof Error?error.message:String(error);process.exitCode=1}
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
