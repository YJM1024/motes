import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
const cache=new Map();async function moduleUrl(name){if(cache.has(name))return cache.get(name);let s=await readFile(new URL('../lib/motes/'+name+'.ts',import.meta.url),'utf8');for(const m of [...s.matchAll(/from\s+(['"])\.\/([^'"]+)\1/g)])s=s.replaceAll(m[1]+'./'+m[2]+m[1],JSON.stringify(await moduleUrl(m[2])));const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');cache.set(name,url);return url;}
const {ELEMENT_PROTOCOL,elementCollector,validElementContext,elementReportFromEvent,elementGenerationInstructions}=await import(await moduleUrl('element-selection'));
const {elementBridgeScript}=await import(await moduleUrl('element-preview'));
const channel='a'.repeat(32),frame={};
test('selection accepts only current opaque iframe and bounded structural data without user text',()=>{
 const context={baseVersionId:'version',selector:'body > button:nth-of-type(1)',tag:'button'};assert.ok(validElementContext(context));for(const patch of [{tag:'input'},{selector:'body; fetch(secret)'},{selector:'body > div:nth-of-type(0)'},{selector:'x'.repeat(900)},{value:'private user input'}])assert.equal(validElementContext({...context,...patch}),false);
 const event={source:frame,origin:'null',data:{protocol:ELEMENT_PROTOCOL,channel,kind:'selected',selector:context.selector,tag:context.tag}};assert.deepEqual(elementReportFromEvent(event,frame,channel),{kind:'selected',selector:context.selector,tag:context.tag});for(const changed of [{source:{}},{origin:'https://evil.test'},{data:{...event.data,channel:'b'.repeat(32)}},{data:{...event.data,text:'private'}}])assert.equal(elementReportFromEvent({...event,...changed},frame,channel),null);assert.match(elementGenerationInstructions(context),/exact replacement patch/);
});
test('preview bridge authenticates controls, intercepts selected actions and invalidates detached elements',()=>{
 const docEvents={},winEvents={},sent=[],parent={},body={tagName:'BODY',parentElement:null,previousElementSibling:null};let mutation;
 class Element{constructor(tag='BUTTON'){this.tagName=tag;this.parentElement=body;this.previousElementSibling=null;this.isConnected=true;this.style={};}hasAttribute(){return false}setAttribute(){}getBoundingClientRect(){return {left:1,top:2,width:30,height:20}}}
 const button=new Element(),overlay=new Element('DIV');const document={body,documentElement:{appendChild(){}},createElement:()=>overlay,querySelector:()=>button,addEventListener:(type,fn)=>{docEvents[type]=fn}};
 const window={parent,addEventListener:(type,fn)=>{winEvents[type]=fn}};parent.postMessage=(value,origin)=>sent.push({value,origin});vm.runInNewContext(elementBridgeScript(channel,'https://motes.test'),{document,window,HTMLElement:Element,MutationObserver:class{constructor(fn){mutation=fn}observe(){}},Date});
 const control={source:parent,origin:'https://motes.test',data:{protocol:ELEMENT_PROTOCOL,channel,kind:'control',enabled:true}};let prevented=0;const click={target:button,preventDefault(){prevented++},stopImmediatePropagation(){}};
 winEvents.message({...control,origin:'https://evil.test'});docEvents.click(click);assert.equal(sent.length,0);winEvents.message(control);docEvents.click(click);assert.equal(prevented,1);assert.equal(sent[0].value.selector,'body > button:nth-of-type(1)');assert.deepEqual(Object.keys(sent[0].value).sort(),['channel','kind','protocol','selector','tag']);assert.equal(sent[0].origin,'https://motes.test');button.isConnected=false;mutation();assert.equal(sent[1].value.kind,'invalidated');
});

test('selection messages remain bounded even when a generated app sends repeated valid payloads',()=>{const collector=elementCollector(channel),event={source:frame,origin:'null',data:{protocol:ELEMENT_PROTOCOL,channel,kind:'cleared'}};for(let n=0;n<4;n++)assert.ok(collector.accept(event,frame,1000));assert.equal(collector.accept(event,frame,1000),null);assert.ok(collector.accept(event,frame,2000));for(let n=0;n<200;n++)collector.accept(event,frame,3000+n*1000);assert.equal(collector.accept(event,frame,999999),null);});
