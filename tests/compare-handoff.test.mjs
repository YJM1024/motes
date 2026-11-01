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

test('inline entry changes only mode/count and does not navigate or call a model',async()=>{
  const source=await readFile(new URL('../app/components/CandidateModeEntry.tsx',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/^import .*?;\r?\n/gm,'').replace('export default function CandidateModeEntry','function CandidateModeEntry');
  const jsx=(type,props)=>({type,props}),styles=new Proxy({}, {get:(_,key)=>String(key)});
  const Component=new Function('useHostLocale','styles','_jsx','_jsxs',compiled+';return CandidateModeEntry;')(()=>({locale:'zh-CN'}),styles,jsx,jsx);
  const changes=[];const props={workspaceId:'space',prompt:'番茄钟',mode:'single',count:2,creationMode:'demo',confirmed:false,confirmationOpen:false,onModeChange:mode=>changes.push(['mode',mode]),onCountChange:count=>changes.push(['count',count]),onConfirmedChange:()=>{}};
  for(const count of [2,3,4]){const tree=Component(props);elementTree(tree).find(n=>n.type==='button'&&text(n)===count+' 路赛马').props.onClick();assert.deepEqual(changes.splice(0),[['count',count],['mode','race']]);}
  const demo=Component({...props,mode:'race'});assert.match(text(demo),/0 次真实模型调用/);assert.equal(elementTree(demo).some(n=>n.type==='a'),false);
  const ai=Component({...props,mode:'race',creationMode:'model',confirmationOpen:true});assert.match(text(ai),/真实模型调用并产生相应费用/);assert.ok(elementTree(ai).some(n=>n.type==='input'&&n.props.type==='checkbox'));
});
