import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const origin=(process.argv[2]||'http://127.0.0.1:5173').replace(/\/$/,'');
const output=process.argv[3];
const result={passed:false,origin,testedAt:new Date().toISOString(),modelCalls:0,demoRequests:0,checks:[],headers:{}};
let ownerCookie,appId,shareId,revoked=false;
async function json(path,{cookie,body,method=body?'POST':'GET',status=200,source=origin}={}) {
  if(path==='/api/generate'){assert.equal(body?.mode,'demo','Smoke must never invoke a model');result.demoRequests++;}
  const response=await fetch(origin+path,{method,cache:'no-store',headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:source}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const text=await response.text();let value;try{value=JSON.parse(text);}catch{
    // Vinext may reject an external Origin before the JSON route executes.
    if(status>=400&&response.status===status)value={error:'Expected non-JSON error response'};
    else throw new Error(`${path.split('/').slice(0,3).join('/')}: non-JSON response (${response.status})`);
  }
  assert.equal(response.status,status,`HTTP ${response.status}: ${value.error||'unexpected status'}`);
  return {value,response};
}
async function visitor(){
  const response=await fetch(origin+'/api/session',{cache:'no-store',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'Session initialization');
  const cookie=response.headers.get('Set-Cookie')?.split(';')[0];assert.ok(cookie,'New anonymous visitor cookie');await response.text();return cookie;
}
const page=async path=>fetch(origin+path,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)});
try {
  for(const [key,path] of [['workbench','/'],['management','/manage']]){
    const response=await page(path);result.headers[key]={status:response.status,csp:response.headers.get('Content-Security-Policy')};await response.text();
  }
  result.needsDevRestart=Object.values(result.headers).some(header=>header.status!==200||!header.csp?.includes("frame-src 'self'"));
  ownerCookie=await visitor();const otherCookie=await visitor();assert.notEqual(ownerCookie,otherCookie);
  const marker='PRIVATE_SHARING_SMOKE_'+crypto.randomUUID().replaceAll('-','');
  const first=(await json('/api/generate',{cookie:ownerCookie,body:{mode:'demo',prompt:'旅行预算计算器，'+marker,requestId:crypto.randomUUID()}})).value.project;
  appId=first.id;const selected=first.versions[0];assert.equal(first.versions.length,1);assert.equal(selected.mode,'demo');
  const second=(await json('/api/generate',{cookie:ownerCookie,body:{mode:'demo',prompt:'改成深色主题，'+marker,projectId:appId,baseVersionId:selected.id,requestId:crypto.randomUUID()}})).value.project;
  assert.equal(second.versions.length,2);assert.notEqual(second.currentVersionId,selected.id);
  result.checks.push('two new isolated visitors; demo application created and changed to v2');
  assert.deepEqual((await json(`/api/projects/${appId}/shares`,{cookie:ownerCookie})).value.shares,[]);
  const requestId=crypto.randomUUID(),share=(await json(`/api/projects/${appId}/shares`,{cookie:ownerCookie,body:{versionId:selected.id,requestId},status:201})).value.share;
  shareId=share.id;assert.equal(share.versionId,selected.id);assert.equal(share.versionNumber,1);assert.match(share.path,/^\/share\/[a-f0-9]{64}$/);
  const duplicate=(await json(`/api/projects/${appId}/shares`,{cookie:ownerCookie,body:{versionId:selected.id,requestId}})).value.share;
  assert.equal(duplicate.id,shareId);assert.equal((await json(`/api/projects/${appId}/shares`,{cookie:ownerCookie})).value.shares.length,1);
  result.checks.push('explicit fixed-v1 share and same-request idempotent retry');
  const publicPath='/api/shares/'+share.path.split('/').at(-1);
  const publicResponse=await json(publicPath),publicVersion=publicResponse.value;
  assert.deepEqual(Object.keys(publicVersion).sort(),['html','title','versionNumber']);assert.equal(publicVersion.html,selected.html);assert.equal(publicVersion.versionNumber,1);
  assert.equal(publicResponse.response.headers.get('Set-Cookie'),null);assert.match(publicResponse.response.headers.get('Cache-Control'),/no-store/);
  const sharedPage=await page(share.path),markup=await sharedPage.text();assert.equal(sharedPage.status,200);assert.equal(sharedPage.headers.get('Set-Cookie'),null);
  assert.match(markup,/sandbox="allow-scripts"/);assert.doesNotMatch(markup,/allow-same-origin|allow-top-navigation|allow-popups/);assert.match(sharedPage.headers.get('Content-Security-Policy'),/frame-src 'self'/);
  assert.match(sharedPage.headers.get('Cache-Control'),/no-store/);assert.equal(sharedPage.headers.get('Referrer-Policy'),'no-referrer');
  for(const privateValue of [marker,appId,selected.id,second.currentVersionId,ownerCookie])assert.equal(markup.includes(privateValue),false,'Anonymous page must not include private conversation, internal IDs or cookies');
  assert.equal(JSON.stringify(publicVersion).includes(marker),false);assert.equal(JSON.stringify(publicVersion).includes('owner'),false);
  result.checks.push('real anonymous share page HTTP 200 and minimal API reveal only selected title, version number and HTML');
  const third=(await json('/api/generate',{cookie:ownerCookie,body:{mode:'demo',prompt:'改成蓝色主题，'+marker,projectId:appId,baseVersionId:second.currentVersionId,requestId:crypto.randomUUID()}})).value.project;
  assert.equal(third.versions.length,3);assert.ok(third.versions.every(v=>v.mode==='demo'));
  assert.deepEqual((await json(publicPath)).value,publicVersion);
  await json(`/api/projects/${appId}/restore`,{cookie:ownerCookie,body:{versionId:second.currentVersionId}});assert.deepEqual((await json(publicPath)).value,publicVersion);
  result.checks.push('v3 generation and restore leave shared v1 unchanged');
  for(const action of [
    ()=>json(`/api/projects/${appId}/shares`,{cookie:otherCookie,status:404}),
    ()=>json(`/api/projects/${appId}/shares`,{cookie:otherCookie,body:{versionId:selected.id,requestId:crypto.randomUUID()},status:404}),
    ()=>json(`/api/projects/${appId}/shares/${shareId}`,{cookie:otherCookie,method:'DELETE',status:404}),
    ()=>json(`/api/projects/${appId}/shares`,{cookie:ownerCookie,body:{versionId:selected.id,requestId:crypto.randomUUID()},source:'https://example.invalid',status:403}),
    ()=>json(`/api/projects/${appId}/shares/${shareId}`,{cookie:ownerCookie,method:'DELETE',source:'https://example.invalid',status:403}),
  ])await action();
  assert.deepEqual((await json(publicPath)).value,publicVersion);
  result.checks.push('cross-owner list/create/revoke and foreign-origin writes rejected without revoking owner link');
  await json(`/api/projects/${appId}/shares/${shareId}`,{cookie:ownerCookie,method:'DELETE'});revoked=true;
  await json(`/api/projects/${appId}/shares/${shareId}`,{cookie:ownerCookie,method:'DELETE'});
  const unavailable=(await json(publicPath,{status:404})).value,unknown=(await json('/api/shares/'+'0'.repeat(64),{status:404})).value;assert.deepEqual(unavailable,unknown);
  const revokedPage=await page(share.path),missingPage=await page('/share/'+'0'.repeat(64));assert.equal(revokedPage.status,404);assert.equal(missingPage.status,404);assert.equal(await revokedPage.text(),await missingPage.text());
  const retry=(await json(`/api/projects/${appId}/shares`,{cookie:ownerCookie,body:{versionId:selected.id,requestId}})).value.share;assert.ok(retry.revokedAt);assert.equal(retry.id,shareId);await json(publicPath,{status:404});
  result.checks.push('revocation immediately returns uniform HTTP 404; repeated revoke and creation retry never revive link');
  const final=(await json(`/api/projects/${appId}`,{cookie:ownerCookie})).value.project;assert.equal(final.versions.length,3);assert.equal(final.currentVersionId,second.currentVersionId);assert.equal(final.versions[0].html,selected.html);
  result.checks.push('original application history and selected current pointer preserved');
  result.needsDevRestart=Object.values(result.headers).some(header=>header.status!==200||!header.csp?.includes("frame-src 'self'"));
  assert.equal(result.needsDevRestart,false,'Actual workbench and management HTTP responses need frame-src self; restart dev if config is stale');
  result.checks.push('actual workbench and management HTTP responses contain frame-src self');
  result.passed=true;
}catch(error){
  // Assertion diffs can contain complete HTML or a capability URL. Persist only
  // the short diagnostic, and redact opaque tokens even in that first line.
  const message=error instanceof Error?error.message:String(error);
  result.error=message.split(/\r?\n/)[0].slice(0,240).replace(/[a-f0-9]{64}/gi,'[redacted]');process.exitCode=1;
}
finally{
  if(ownerCookie&&appId&&shareId&&!revoked)try{await json(`/api/projects/${appId}/shares/${shareId}`,{cookie:ownerCookie,method:'DELETE'});result.cleanupRevoked=true;}catch{result.cleanupRevoked=false;}
}
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');
// Never print or persist cookies, capability tokens, source HTML or prompts.
console.log(JSON.stringify(result));
