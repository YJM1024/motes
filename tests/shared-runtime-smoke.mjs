#!/usr/bin/env node
// Zero-model HTTP acceptance. Creates one clearly named QA app; never deletes existing data.
// node tests/shared-runtime-smoke.mjs --base http://127.0.0.1:5173 --output D:/gpt/output/motes/shared-runtime-local.json
// After restarting that same server/database:
// node tests/shared-runtime-smoke.mjs --base http://127.0.0.1:5173 --verify-existing D:/gpt/output/motes/shared-runtime-local.json --output D:/gpt/output/motes/shared-runtime-restart.json
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const args=process.argv.slice(2),options={base:'http://127.0.0.1:5173',output:'D:/gpt/output/motes/shared-runtime-smoke.json',samples:10};
for(let i=0;i<args.length;i++){
 const [name,inline]=args[i].split('=',2);if(!['--base','--output','--verify-existing','--samples'].includes(name))throw Error('Unsupported option: '+name);
 const value=inline??args[++i];if(!value||value.startsWith('--'))throw Error('Missing option value: '+name);
 options[name.slice(2)]=name==='--samples'?Number(value):value;
}
const base=new URL(options.base);assert(['http:','https:'].includes(base.protocol)&&base.pathname==='/'&&!base.username&&!base.password&&!base.search&&!base.hash,'Use a plain HTTP(S) origin');
assert(Number.isInteger(options.samples)&&options.samples>=0&&options.samples<=10,'Samples must be 0..10');
const output=resolve(options.output),checks=[],clients=new Map();
const report={schemaVersion:1,mode:options['verify-existing']?'verify-existing':'create',baseOrigin:base.origin,startedAt:new Date().toISOString(),modelCalls:0,status:'running',checks};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ensure=(condition,name)=>assert(condition,name);
async function call(client,path,{method='GET',body,origin=base.origin,raw}={}){
 const headers={};if(clients.get(client))headers.cookie=clients.get(client);if(method!=='GET'){headers.origin=origin;headers['content-type']='application/json'}
 const start=performance.now(),response=await fetch(new URL(path,base),{method,headers,...method==='GET'?{}:{body:raw??JSON.stringify(body)},redirect:'error',signal:AbortSignal.timeout(20000)});
 const elapsedMs=Number((performance.now()-start).toFixed(2)),cookie=response.headers.get('set-cookie');
 if(cookie){const match=/(?:^|,\s*)forma_session=([a-f0-9]{64})(?:;|$)/.exec(cookie);ensure(match,'Valid anonymous cookie issued');clients.set(client,'forma_session='+match[1])}
 const text=await response.text();let data=null;try{data=JSON.parse(text)}catch{}return{status:response.status,data,elapsedMs,serverTiming:response.headers.get('server-timing'),requestId:response.headers.get('x-request-id')};
}
async function step(name,run){const started=performance.now();const details=await run();checks.push({name,status:'passed',elapsedMs:Number((performance.now()-started).toFixed(2)),...details});}
async function session(name){const result=await call(name,'/api/session');ensure(result.status===200,'Session HTTP 200');ensure(result.data.visibility==='shared','Deployment must explicitly enable shared workspace');ensure(typeof result.data.workspaceId==='string','Workspace ID present');ensure(clients.has(name),'Anonymous cookie initialized');return result.data.workspaceId;}
let target;
try{
 const a=await session('A'),b=await session('B');ensure(a===b,'A and B share a workspace');ensure(clients.get('A')!==clients.get('B'),'A and B have separate anonymous cookies');checks.push({name:'separate sessions share workspace',status:'passed'});
 if(options['verify-existing']){
  const saved=JSON.parse(await readFile(resolve(options['verify-existing']),'utf8'));
  ensure(saved.schemaVersion===1&&saved.status==='passed'&&saved.baseOrigin===base.origin,'Prior passed report belongs to this origin');
  const uuid=/^[a-f0-9-]{36}$/i;ensure(uuid.test(saved.appId)&&uuid.test(saved.versionId)&&/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(saved.key)&&/^[a-f0-9]{64}$/.test(saved.valueSha256)&&Number.isSafeInteger(saved.revision),'Prior report target is valid');
  target={appId:saved.appId,versionId:saved.versionId,key:saved.key};Object.assign(report,target,{revision:saved.revision,valueSha256:saved.valueSha256,valueBytes:saved.valueBytes});
  await step('persisted data survives server restart',async()=>{const r=await call('B','/api/runtime-data',{method:'POST',body:{action:'get',...target}});ensure(r.status===200,'Existing runtime data HTTP 200');ensure(r.data.revision===saved.revision&&hash(r.data.value)===saved.valueSha256,'Existing revision and data hash match prior report');return{httpStatus:r.status}});
 }else{
  await step('create QA kanban app without a model',async()=>{const r=await call('A','/api/apps/seed',{method:'POST',body:{kind:'kanban',requestId:randomUUID(),title:'QA shared-runtime smoke '+new Date().toISOString()}});ensure(r.status===201,'QA app creation HTTP 201');const p=r.data.project;ensure(p&&p.versions?.length===1,'QA app has one saved version');ensure(p.versions[0].mode==='demo','QA creation is a built-in demo');target={appId:p.id,versionId:p.currentVersionId,key:'qa.'+randomUUID()};Object.assign(report,target);return{httpStatus:r.status}});
  await step('B reads A saved app',async()=>{const r=await call('B','/api/projects/'+target.appId);ensure(r.status===200&&r.data.project?.currentVersionId===target.versionId,'B reads same app and version');return{httpStatus:r.status}});
  const runtime=(client,action,extra={},origin)=>call(client,'/api/runtime-data',{method:'POST',origin,body:{action,...target,...extra}});
  await step('missing key starts at revision zero',async()=>{const r=await runtime('A','get');ensure(r.status===200&&r.data.revision===0&&r.data.value===null,'Missing key is null revision zero');return{httpStatus:r.status}});
  const initial={qaMarker:randomUUID(),phase:'initial'};
  await step('A saves revision one',async()=>{const r=await runtime('A','set',{value:initial,expectedRevision:0});ensure(r.status===200&&r.data.revision===1,'First write revision one');return{httpStatus:r.status}});
  await step('B reads A shared value',async()=>{const r=await runtime('B','get');ensure(r.status===200&&r.data.revision===1&&hash(r.data.value)===hash(initial),'B reads exact shared value');return{httpStatus:r.status}});
  const competing=[{qaMarker:randomUUID(),phase:'race-left'},{qaMarker:randomUUID(),phase:'race-right'}];
  await step('concurrent same-revision writes have one winner',async()=>{const responses=await Promise.all(competing.map((value,i)=>runtime(i?'B':'A','set',{value,expectedRevision:1})));ensure(responses.map(r=>r.status).sort().join(',')==='200,409','One write succeeds and one conflicts');ensure(responses.find(r=>r.status===200).data.revision===2,'Winning revision is two');const r=await runtime('B','get');ensure(r.status===200&&r.data.revision===2&&competing.some(v=>hash(v)===hash(r.data.value)),'Read committed winner');Object.assign(report,{revision:r.data.revision,valueSha256:hash(r.data.value),valueBytes:Buffer.byteLength(JSON.stringify(r.data.value))});return{httpStatuses:responses.map(r=>r.status).sort()}});
  await step('foreign Origin is rejected',async()=>{const r=await runtime('A','get',{},'https://foreign.invalid');ensure(r.status===403,'Foreign Origin HTTP 403');return{httpStatus:r.status}});
  await step('unknown version is rejected',async()=>{const r=await runtime('A','get',{versionId:randomUUID()});ensure(r.status===404,'Unknown version HTTP 404');return{httpStatus:r.status}});
  await step('oversized request is rejected',async()=>{const r=await runtime('A','set',{value:'x'.repeat(17000),expectedRevision:2});ensure(r.status===413,'Oversized body HTTP 413');return{httpStatus:r.status}});
 }
 const c=await session('C');ensure(c===a,'New cookie C keeps same workspace');
 await step('new cookie C reads persisted winner',async()=>{const r=await call('C','/api/runtime-data',{method:'POST',body:{action:'get',...target}});ensure(r.status===200&&r.data.revision===report.revision&&hash(r.data.value)===report.valueSha256,'C reads same committed revision and data hash');return{httpStatus:r.status}});
 const samples=[];
 for(let i=0;i<options.samples;i++){const r=await call('C','/api/session');ensure(r.status===200&&r.data.visibility==='shared','Bounded GET succeeds');ensure(/^app;dur=\d+(?:\.\d+)?$/.test(r.serverTiming??'')&&/^[a-f0-9-]{36}$/i.test(r.requestId??''),'Diagnostics headers present');samples.push({elapsedMs:r.elapsedMs,serverTiming:r.serverTiming,requestId:r.requestId})}
 const sorted=samples.map(r=>r.elapsedMs).sort((x,y)=>x-y);report.latency={sampleCount:samples.length,medianMs:sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2:null,p95Ms:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null,samples,note:'Bounded GET observations only; not a load, capacity or latency guarantee.'};report.status='passed';
}catch(error){report.status='failed';report.failure={name:error instanceof assert.AssertionError?'assertion_failed':'request_or_input_failed',message:error instanceof assert.AssertionError?error.message.split('\n')[0]:'HTTP request or report input failed; inspect locally without recording sensitive bodies.'};process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,modelCalls:0,output}));}
