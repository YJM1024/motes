import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(name){const source=await readFile(new URL('../lib/motes/'+name+'.ts',import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))}
const {composerDraftStore}=await load('composer-drafts'),{mergeDiscussion,discussionRecoveryDecision,DISCUSSION_RECOVERY}=await load('discussion-client');
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
test('late snapshots never erase completed discussion turns or cross workspace/thread contexts',()=>{
  const base={workspaceId:'w1',thread:{id:'t1'},threads:[],limits:{},turns:[{requestId:'r1',status:'done',reply:'saved',createdAt:'2026-10-30T01:00:00Z'},{requestId:'r2',status:'running',reply:null,createdAt:'2026-10-30T02:00:00Z'}]};
  const late={...base,turns:[{requestId:'r1',status:'running',reply:null,createdAt:'2026-10-30T01:00:00Z'}]};const merged=mergeDiscussion(base,late);assert.equal(merged.turns[0].reply,'saved');assert.equal(merged.turns.length,2);
  assert.equal(mergeDiscussion(base,{...late,workspaceId:'w2',turns:[]}).turns.length,0);assert.equal(mergeDiscussion(base,{...late,thread:{id:'other'},turns:[]}).turns.length,0);
});
test('discussion recovery has a finite GET-only boundary and distinct original/new ID decisions',()=>{
  assert.equal(discussionRecoveryDecision('done',0),'completed');assert.equal(discussionRecoveryDecision('failed',0),'new-id');assert.equal(discussionRecoveryDecision('expired',0),'new-id');assert.equal(discussionRecoveryDecision('missing',0),'same-id');assert.equal(discussionRecoveryDecision('running',1),'poll');assert.equal(discussionRecoveryDecision('running',DISCUSSION_RECOVERY.checks),'pause');
});
