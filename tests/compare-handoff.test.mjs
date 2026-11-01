import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadTs(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const api = await loadTs('../lib/motes/compare-handoff.ts');
const now = 1_800_000_000_000;
function storage() {
  const values = new Map();
  return { values, getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value)), removeItem:key=>values.delete(key) };
}
const handoff = overrides => ({ version:1, workspaceId:'workspace-a', createdAt:now, prompt:'Build a timer', managedProjectId:'project-a', count:3, ...overrides });

test('handoff is validated, scoped, and consumed once before use', () => {
  const store=storage(),item=handoff();
  assert.equal(api.writeCompareHandoff(store,item),true);
  const first=api.takeCompareHandoff(store,'workspace-a',now);
  assert.equal(first.status,'ready');assert.equal(first.value.count,3);
  assert.equal(api.takeCompareHandoff(store,'workspace-a',now).status,'none');
  api.writeCompareHandoff(store,item);
  assert.equal(api.takeCompareHandoff(store,'workspace-b',now).status,'workspace-mismatch');
  assert.equal(api.takeCompareHandoff(store,'workspace-a',now).status,'none');
});

test('handoff expires and rejects malformed context, overlong prompts, or invalid candidate counts', () => {
  const store=storage();
  api.writeCompareHandoff(store,handoff());
  assert.equal(api.takeCompareHandoff(store,'workspace-a',now+api.COMPARE_HANDOFF_TTL_MS+1).status,'expired');
  assert.equal(api.writeCompareHandoff(store,handoff({count:5})),false);
  assert.equal(api.writeCompareHandoff(store,handoff({prompt:'x'.repeat(4001)})),false);
  assert.equal(api.writeCompareHandoff(store,handoff({appId:'app-a',managedProjectId:undefined})),false);
  assert.equal(api.validateCompareHandoff(handoff({managedProjectId:undefined})),true);
  assert.equal(api.validateCompareHandoff(handoff({appId:'app-a',baseVersionId:'v1',managedProjectId:undefined})),true);
  assert.equal(api.validateCompareHandoff(handoff({appId:'app-a',baseVersionId:'v1',managedProjectId:'project-a'})),false);
});

test('compare target resolution identifies a stale base without substituting it', () => {
  const item=handoff({appId:'app-a',baseVersionId:'v1',managedProjectId:undefined});
  assert.deepEqual(api.resolveCompareHandoff(item,{apps:[{id:'app-a',currentVersionId:'v2'}],projects:[]}),{status:'stale-base',value:item,currentVersionId:'v2'});
  assert.equal(api.resolveCompareHandoff(item,{apps:[],projects:[]}).status,'stale-target');
  assert.equal(api.resolveCompareHandoff(handoff({managedProjectId:undefined}),{apps:[],projects:[]}).status,'target-required');
  assert.equal(api.resolveCompareHandoff(handoff(),{apps:[],projects:[{id:'project-a',archived:false}]}).status,'ready');
  assert.equal(api.resolveCompareHandoff(handoff(),{apps:[],projects:[{id:'project-a',archived:true}]}).status,'stale-target');
});

function elementTree(node) {
  if(node===null||node===undefined||node===false)return [];
  if(Array.isArray(node))return node.flatMap(elementTree);
  if(typeof node!=='object'||!('type'in node))return [];
  return [node,...elementTree(node.props?.children)];
}
function text(node){if(Array.isArray(node))return node.map(text).join(' ');if(node&&typeof node==='object'&&'type'in node)return text(node.props?.children);return node==null?'':String(node)}

test('race entry only stores and navigates after explicit click; failed storage does not navigate', async()=>{
  const componentSource=await readFile(new URL('../app/components/CandidateModeEntry.tsx',import.meta.url),'utf8');
  const compiled=ts.transpileModule(componentSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/^import .*?;\r?\n/gm,'').replace('export default function CandidateModeEntry','function CandidateModeEntry');
  const factory=new Function('useState','useHostLocale','p0EntryText','writeCompareHandoff','styles','_jsx','_jsxs',`${compiled};return CandidateModeEntry;`);
  const {p0EntryText}=await loadTs('../lib/motes/locale/p0-entry.ts');
  let cursor=0,state=[];const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next}];};
  const useHostLocale=()=>({locale:'zh-CN'}),styles=new Proxy({}, {get:(_,key)=>String(key)}),jsx=(type,props)=>({type,props});
  const store=storage(),navigated=[],changes={mode:[],count:[]};const Component=factory(useState,useHostLocale,p0EntryText,api.writeCompareHandoff,styles,jsx,jsx);
  const props={workspaceId:'workspace-a',prompt:'Need a timer',managedProjectId:'project-a',mode:'race',count:4,onModeChange:value=>changes.mode.push(value),onCountChange:value=>changes.count.push(value),storage:store,navigate:path=>navigated.push(path)};
  cursor=0;let tree=Component(props);assert.deepEqual(navigated,[]);assert.equal(elementTree(tree).find(n=>n.type==='select')?.props.value,4);
  elementTree(tree).find(n=>n.type==='select').props.onChange({target:{value:'2'}});assert.deepEqual(changes.count,[2]);
  elementTree(tree).find(n=>n.type==='button'&&text(n).includes('单次创作')).props.onClick();assert.deepEqual(changes.mode,['single']);
  elementTree(tree).find(n=>n.type==='button'&&text(n).includes('查看比较设置')).props.onClick();
  assert.deepEqual(navigated,['/compare']);assert.equal(JSON.parse(store.values.get(api.COMPARE_HANDOFF_KEY)).count,4);
  const noTargetStore=storage();cursor=0;tree=Component({...props,managedProjectId:undefined,storage:noTargetStore});
  const handoffButton=elementTree(tree).find(n=>n.type==='button'&&text(n).includes('查看比较设置'));
  assert.equal(handoffButton.props.disabled,false);handoffButton.props.onClick();
  const noTargetValue=JSON.parse(noTargetStore.values.get(api.COMPARE_HANDOFF_KEY));
  assert.equal(noTargetValue.prompt,'Need a timer');assert.equal(noTargetValue.count,4);assert.equal(noTargetValue.appId,undefined);assert.equal(noTargetValue.managedProjectId,undefined);
  assert.deepEqual(navigated,['/compare','/compare']);
  const badStorage={getItem(){return null},removeItem(){},setItem(){throw new Error('blocked')}};
  cursor=0;tree=Component({...props,managedProjectId:undefined,storage:badStorage,navigate:path=>navigated.push(path)});
  elementTree(tree).find(n=>n.type==='button'&&text(n).includes('查看比较设置')).props.onClick();
  cursor=0;tree=Component({...props,managedProjectId:undefined,storage:badStorage});
  assert.deepEqual(navigated,['/compare','/compare']);assert.match(text(tree),/无法安全保存/);
});
