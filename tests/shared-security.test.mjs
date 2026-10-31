import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/forma/security.ts',import.meta.url),'utf8');
const security=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const request=token=>new Request('https://motes.test/api/projects',{headers:token?{cookie:'forma_session='+token}:{}});
test('anonymous sessions share business namespace while retaining distinct spend actors',async()=>{
 const a=request('a'.repeat(64)),b=request('b'.repeat(64));
 assert.equal(await security.owner(a),security.sharedWorkspaceOwner());
 assert.equal(await security.owner(b),security.sharedWorkspaceOwner());
 assert.notEqual(await security.visitor(a),await security.visitor(b));
 assert.notEqual(await security.visitor(a),security.sharedWorkspaceOwner());
 assert.equal(security.isSharedOwner(await security.digest('a'.repeat(64))),false);
 assert.equal(security.isSharedOwner(security.SHARED_OWNER),true);
});
test('shared namespace still requires valid cookie and same-origin mutations',async()=>{
 for(const token of [undefined,'invalid','a'.repeat(63)])await assert.rejects(security.owner(request(token)),{status:401});
 assert.throws(()=>security.assertOrigin(new Request('https://motes.test/api/projects',{headers:{origin:'https://evil.test'}})),{status:403});
 assert.doesNotThrow(()=>security.assertOrigin(new Request('https://motes.test/api/projects',{headers:{origin:'https://motes.test'}})));
});
