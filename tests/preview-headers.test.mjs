import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const compiled=ts.transpileModule(await readFile(new URL('../next.config.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {default:config}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
// Test the pinned installed framework's real response pipeline, not a local
// reimplementation of its header-matching rules.
const {finalizeAppRscResponse}=await import(new URL('./server/app-rsc-response-finalizer.js',import.meta.resolve('vinext')));
const {requestContextFromRequest}=await import(new URL('./config/request-context.js',import.meta.resolve('vinext')));
async function finalize(path,headers={}) {
  const request=new Request('https://motes.test'+path);
  return finalizeAppRscResponse(new Response('<!doctype html><iframe sandbox="allow-scripts allow-forms" srcdoc="&lt;button&gt;preview&lt;/button&gt;"></iframe>',{status:200,headers:{'Content-Type':'text/html',...headers}}),request,{basePath:'',configHeaders:await config.headers(),i18nConfig:null,requestContext:requestContextFromRequest(request)});
}

test('installed Vinext applies the HTTP preview-host CSP to workbench, management, editor and comparison responses',async()=>{
  for(const path of ['/','/?app=any','/manage','/manage/','/manage/settings','/compare','/compare?groupId=any']){
    const response=await finalize(path);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Security-Policy'),"frame-src 'self'",path);
    assert.match(await response.text(),/sandbox="allow-scripts allow-forms"/);
    assert.doesNotMatch(response.headers.get('Content-Security-Policy'),/script-src|style-src|connect-src|default-src/,'Do not restrict the platform runtime or auth integrations');
  }
});

test('auth, API and public-share routes keep their existing policy and custom headers are preserved',async()=>{
  for(const path of ['/signin-with-chatgpt','/callback','/api/session','/share/'+'a'.repeat(64)])assert.equal((await finalize(path)).headers.get('Content-Security-Policy'),null);
  const stronger="default-src 'none'; frame-src 'self'";
  assert.equal((await finalize('/share/token',{'Content-Security-Policy':stronger,'X-Test':'preserved'})).headers.get('Content-Security-Policy'),stronger);
  assert.equal((await finalize('/',{'X-Test':'preserved'})).headers.get('X-Test'),'preserved');
});

test('all existing preview surfaces allow JS form handlers while CSP still prohibits actual submissions', async()=>{
  for(const file of ['../app/page.tsx','../app/components/SourceEditor.tsx','../lib/motes/shared-page.ts','../app/compare/page.tsx']) {
    const source=await readFile(new URL(file,import.meta.url),'utf8');
    const sandboxes=[...source.matchAll(/sandbox="([^"]+)"/g)].map(match=>match[1]);
    assert.ok(sandboxes.length>0,file);
    for(const sandbox of sandboxes) assert.deepEqual(sandbox.split(/\s+/).sort(),['allow-forms','allow-scripts'],file);
  }
  const preview=await readFile(new URL('../lib/motes/preview-document.ts',import.meta.url),'utf8');
  assert.match(preview,/form-action 'none'/);assert.match(preview,/connect-src 'none'/);assert.match(preview,/frame-src 'none'/);assert.match(preview,/default-src 'none'/);
  const share=await readFile(new URL('../lib/motes/shared-page.ts',import.meta.url),'utf8');
  assert.match(share,/form-action 'none'/);assert.match(share,/frame-src 'self'/);
});
