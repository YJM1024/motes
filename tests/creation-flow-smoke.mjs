import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { requirePrivateWorkspace } from './http-smoke-helpers.mjs';

const origin=(process.argv[2]||'http://127.0.0.1:5173').replace(/\/$/,'');
const output=process.argv[3];
const result={passed:false,origin,testedAt:new Date().toISOString(),modelCalls:0,checks:[]};
async function visitor(){
  const response=await fetch(origin+'/api/session',{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  await response.text();return cookie;
}
async function call(cookie,path,body,expected=200,source=origin){
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(15000),headers:{Cookie:cookie,...body?{Origin:source,'Content-Type':'application/json'}:{}},...body?{method:'POST',body:JSON.stringify(body)}:{}});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data={error:text}}
  assert.equal(response.status,expected,`${path}: ${data.error||'unexpected status'}`);return data;
}
try{
  await requirePrivateWorkspace(origin);
  const own=await visitor(),other=await visitor();
  await call(own,'/api/workspace');await call(other,'/api/workspace');
  const created=await call(own,'/api/workspace',{action:'project.create',name:'指定项目创作验收'});
  const group=created.projects.find(p=>!p.isDefault);assert.ok(group);
  const settings=await call(own,'/api/settings',{scope:'project',projectId:group.id,patch:{previewDevice:'mobile',language:'en'}});
  assert.equal(settings.effective.previewDevice,'mobile');assert.equal(settings.sources.language,'project');
  const targetSettings=await call(own,'/api/settings?projectId='+encodeURIComponent(group.id));
  assert.equal(targetSettings.effective.language,'en');result.checks.push('new visitor project and inherited creation preferences');
  const body={mode:'demo',prompt:'旅行预算计算器',managedProjectId:group.id,requestId:crypto.randomUUID()};
  const generated=(await call(own,'/api/generate',body)).project;
  assert.equal(generated.versions.length,1);assert.equal(generated.versions[0].mode,'demo');
  const snapshot=await call(own,'/api/workspace'),app=snapshot.apps.find(a=>a.id===generated.id);
  assert.ok(app);assert.equal(app.projectId,group.id);assert.equal(app.currentVersionId,generated.currentVersionId);
  const inherited=await call(own,'/api/settings?appId='+encodeURIComponent(generated.id));
  assert.equal(inherited.effective.previewDevice,'mobile');assert.equal(inherited.effective.language,'en');assert.equal(inherited.sources.language,'project');
  result.checks.push('application committed directly to target with matching current pointer and inherited settings');
  const retry=(await call(own,'/api/generate',body)).project;
  assert.equal(retry.id,generated.id);assert.equal(retry.versions.length,1);assert.equal(retry.currentVersionId,generated.currentVersionId);
  result.checks.push('same request retry returns one unchanged saved version');
  await call(other,'/api/generate',{...body,requestId:crypto.randomUUID()},404);
  await call(own,'/api/workspace',{action:'project.update',projectId:group.id,archived:true});
  await call(own,'/api/generate',{...body,requestId:crypto.randomUUID()},409);
  const completedAfterArchive=(await call(own,'/api/generate',body)).project;assert.equal(completedAfterArchive.id,generated.id);assert.equal(completedAfterArchive.versions.length,1);
  await call(own,'/api/workspace',{action:'project.update',projectId:group.id,archived:false});
  const final=await call(own,'/api/workspace');assert.equal(final.apps.length,1);assert.equal(final.apps[0].projectId,group.id);
  result.checks.push('foreign owner and archived target rejected while completed retry remains valid');
  await call(own,'/api/generate',{...body,requestId:crypto.randomUUID()},403,'https://invalid.example');
  const started=Date.now(),afterOrigin=await call(own,'/api/workspace');
  assert.equal(afterOrigin.apps[0].currentVersionId,generated.currentVersionId);
  result.originProtection={status:403,nextGetStatus:200,nextGetMs:Date.now()-started};result.checks.push('foreign origin rejected and next GET succeeds');
  Object.assign(result,{passed:true,projectId:group.id,appId:generated.id,currentVersionId:generated.currentVersionId,versionCount:1});
}catch(error){result.error=error instanceof Error?error.message:String(error);process.exitCode=1}
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
