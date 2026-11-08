import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(name){const source=await readFile(new URL('../lib/motes/'+name+'.ts',import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))}
const {composerDraftStore}=await load('composer-drafts');
test('build drafts are scoped by authenticated workspace and app/pre-app context, including reload and transfer',()=>{
  const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},store=composerDraftStore(storage);
  store.load('workspace:a');store.write('workspace:a','app:one','next draft A');store.write('workspace:a','app:two','draft B');store.write('workspace:a','pre:default|thread1','pre-app draft');
  assert.equal(store.read('app:one'),'next draft A');assert.equal(store.read('app:two'),'draft B');
  const reloaded=composerDraftStore(storage);reloaded.load('workspace:a');assert.equal(reloaded.read('pre:default|thread1'),'pre-app draft');
  reloaded.transfer('workspace:a','pre:default|thread1','app:new');assert.equal(reloaded.read('app:new'),'pre-app draft');assert.equal(reloaded.read('pre:default|thread1'),'');
  reloaded.write('workspace:a','pre:new','late next draft');reloaded.transfer('workspace:a','pre:new','app:one');assert.equal(reloaded.read('app:one'),'next draft A\n\nlate next draft');
});
test('a new anonymous workspace cannot see old drafts or accept a stale writer from the previous identity',()=>{
  const memory=new Map(),store=composerDraftStore({getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)});store.load('workspace:old');store.write('workspace:old','app:one','PRIVATE DRAFT');store.load('workspace:new');assert.equal(store.read('app:one'),'');assert.equal(store.write('workspace:old','app:one','STALE'),false);assert.equal(store.read('app:one'),'');store.load('workspace:old');assert.equal(store.read('app:one'),'PRIVATE DRAFT');
});
