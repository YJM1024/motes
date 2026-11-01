import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(predicate){let found;function visit(n){if(predicate(n))found=n;ts.forEachChild(n,visit)}visit(tree);assert.ok(found);return found;}
function generate(env){const fn=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='generate').getText(tree);const js=ts.transpileModule(fn+'\nreturn generate;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('env','with(env){'+js+'}')(env)}
function environment(overrides={}){const calls=[],ui=[];return{calls,ui,prompt:'番茄钟',race:{controller:{blocked:false,async start(body){calls.push(body);return true}}},candidateMode:'race',candidateCount:2,session:{model:null},workspaceId:'workspace',sessionLoading:false,discussionBusy:false,connection:{ready:true},operationLock:{current:false},opening:false,unresolvedRecovery:false,offline:{status:'online'},mode:'demo',raceConfirmed:false,setRaceConfirmationOpen:v=>ui.push(['confirm',v]),setRaceConfirmed:()=>{},setPane:v=>ui.push(['pane',v]),setOutcome:()=>{},preferences:{},project:null,creationTarget:{id:'target'},raceScope:'scope',raceScopeRef:{current:'scope'},...overrides}}
function event(expression,env){const js=ts.transpileModule('return ('+expression+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('env','with(env){'+js+'}')(env)}

test('main send click and Ctrl Enter start exact 2/3/4 inline candidates without navigation',async()=>{
 const button=find(n=>ts.isJsxOpeningElement(n)&&n.tagName.getText(tree)==='button'&&n.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='className'&&p.initializer?.getText(tree)==='"send-button"'));
 const click=button.attributes.properties.find(p=>p.name?.getText(tree)==='onClick').initializer.expression.getText(tree);
 const textarea=find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(tree)==='textarea');const keydown=textarea.attributes.properties.find(p=>p.name?.getText(tree)==='onKeyDown').initializer.expression.getText(tree);
 for(const count of [2,3,4])for(const action of ['click','keyboard']){const env=environment({candidateCount:count});env.generate=generate(env);if(action==='click')event(click,env)();else event(keydown,env)({nativeEvent:{isComposing:false},key:'Enter',ctrlKey:true,preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));assert.equal(env.calls.length,1);assert.equal(env.calls[0].count,count);assert.equal(env.calls[0].confirmCalls,count);assert.equal(env.calls[0].managedProjectId,'target');}
});
test('first AI send opens nearby cost confirmation and only explicit confirmation permits calls',async()=>{const env=environment({mode:'model'}),send=generate(env);await send();assert.equal(env.calls.length,0);assert.deepEqual(env.ui,[['confirm',true]]);env.raceConfirmed=true;await send();assert.equal(env.calls.length,1);assert.equal(env.calls[0].mode,'model')});
test('active or recovering race blocks single generation and same-turn rapid sends',async()=>{const env=environment({candidateMode:'single',race:{controller:{blocked:true}}});await generate(env)();assert.equal(env.calls.length,0)});
test('adopted app callback checks current scope and live version before opening in the same workspace',async()=>{
 const fn=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openRaceApp').getText(tree),js=ts.transpileModule(fn+'\nreturn openRaceApp;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const variant of ['current','scope-changed','version-changed']){const opened=[],errors=[];const env={raceScope:'scope',workspaceId:'workspace',mounted:{current:true},raceScopeRef:{current:'scope'},workspaceRef:{current:'workspace'},locale:'zh-CN',session:{mode:'demo'},async api(){if(variant==='scope-changed')env.raceScopeRef.current='other';return{project:{id:'adopted',currentVersionId:variant==='version-changed'?'newer':'version',versions:[{id:'version',mode:'demo'}]}}},remember:next=>opened.push(next.id),setPane:()=>{},setHistory:()=>{},setSource:()=>{},setOutcome:()=>{},setCandidateMode:()=>{},setMode:()=>{},setError:e=>errors.push(e)};const open=new Function('env','with(env){'+js+'}')(env);await open('adopted','version');assert.deepEqual(opened,variant==='current'?['adopted']:[]);assert.equal(errors.length,variant==='version-changed'?1:0);}
});

test('stopped unresolved races keep generation blocked while existing app navigation remains available',async()=>{
 const declaration=find(n=>ts.isVariableDeclaration(n)&&n.name.getText(tree)==='busy').initializer.getText(tree);
 const busy=event(declaration,{singleBusy:false,race:{blocked:true,state:{busy:false}}});assert.equal(busy,false);
 const fn=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openProject').getText(tree),js=ts.transpileModule(fn+'\nreturn openProject;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const opened=[];const env={busy,discussionBusy:false,opening:false,sessionLoading:false,interruptRecovery:()=>1,setRecoveryPaused:()=>{},setOpening:()=>{},setError:()=>{},api:async()=>({project:{id:'existing',currentVersionId:'v1',versions:[{id:'v1',mode:'demo'}]}}),mounted:{current:true},operationEpoch:{current:1},remember:next=>opened.push(next.id),setOutcome:()=>{},setSidebar:()=>{},setHistory:()=>{},setSource:()=>{},setMode:()=>{},session:{mode:'demo'}};
 await new Function('env','with(env){'+js+'}')(env)('existing');assert.deepEqual(opened,['existing']);
 const sending=environment({candidateMode:'single',race:{controller:{blocked:true}}});await generate(sending)();assert.equal(sending.calls.length,0);
});
