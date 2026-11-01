import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const componentSource=await readFile(new URL('../app/components/BuildAttemptFeedback.tsx',import.meta.url),'utf8');
const localeSource=await readFile(new URL('../lib/motes/locale/p0-activity.ts',import.meta.url),'utf8');
async function loadTs(source){const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));}
const {p0ActivityText}=await loadTs(localeSource);
const js=ts.transpileModule(componentSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/^import .*?;\r?\n/gm,'').replace('export default function BuildAttemptFeedback','function BuildAttemptFeedback');
const ComponentFactory=new Function('useState','useHostLocale','p0ActivityText','styles','LoaderCircle','ChevronDown','_jsx','_jsxs',`${js}; return BuildAttemptFeedback;`);

function harness(locale='zh-CN'){
  const state=[];let cursor=0;
  const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next;}];};
  const useHostLocale=()=>({locale,t:(key,params={})=>key.replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??`{${name}}`))});
  const styles=new Proxy({}, {get:(_target,key)=>String(key)});
  const icon=()=>null;
  const jsx=(type,props)=>({type,props:props||{}});
  const Component=ComponentFactory(useState,useHostLocale,p0ActivityText,styles,icon,icon,jsx,jsx);
  return {render:props=>{cursor=0;return Component(props);}};
}
function walk(node,visit){if(node===null||node===undefined||node===false)return; if(Array.isArray(node)){for(const child of node)walk(child,visit);return;}if(typeof node!=='object'||!('type'in node)){visit(node);return;}visit(node);walk(node.props?.children,visit);}
function elements(tree,type){const found=[];walk(tree,node=>{if(node&&typeof node==='object'&&node.type===type)found.push(node);});return found;}
function text(tree){const parts=[];const visit=node=>{if(node===null||node===undefined||node===false)return;if(Array.isArray(node)){for(const child of node)visit(child);return;}if(typeof node!=='object'||!('type'in node)){if(typeof node==='string'||typeof node==='number')parts.push(String(node));return;}if(node.props?.hidden)return;visit(node.props?.children);};visit(tree);return parts.join(' ');}
function base(overrides={}){return {phase:'failed',title:'原请求已确认失败',hint:'当前草稿保留，可重试。',details:'HTTP 503：暂时不可用',requestId:'req-a',primaryLabel:'重试这条消息',onPrimary(){},...overrides};}

test('work record expands on demand, survives elapsed updates for the same request, and scopes details to a new request',()=>{
  const h=harness(),actions={primary:0,edit:0};const first=base({details:'第一次请求的失败原因',onPrimary:()=>actions.primary++,onEdit:()=>actions.edit++});
  let tree=h.render(first);assert.match(text(tree),/第一次请求的失败原因/);assert.equal(text(tree).includes('req-a'),false);assert.equal(elements(tree,'div').find(node=>node.props?.id==='build-work-record-req-a')?.props.hidden,true);
  const toggle=elements(tree,'button').find(node=>text(node).includes('工作记录'));assert.ok(toggle);assert.equal(toggle.props['aria-expanded'],false);assert.equal(toggle.props.type,'button');
  elements(tree,'button').find(node=>text(node).includes('重试这条消息')).props.onClick();assert.equal(actions.primary,1);
  elements(tree,'button').find(node=>text(node).includes('编辑需求'))?.props.onClick?.();assert.equal(actions.edit,1);
  toggle.props.onClick();tree=h.render({...first,elapsed:7});assert.match(text(tree),/本页已发起此请求/);assert.match(text(tree),/第一次请求的失败原因/);assert.match(text(tree),/req-a/);assert.equal(elements(tree,'div').find(node=>node.props?.id==='build-work-record-req-a')?.props.hidden,false);
  elements(tree,'button').find(node=>text(node).includes('工作记录')).props.onClick();tree=h.render({...first,elapsed:8});assert.equal(text(tree).includes('req-a'),false);assert.equal(elements(tree,'button').find(node=>text(node).includes('工作记录')).props['aria-expanded'],false);
  elements(tree,'button').find(node=>text(node).includes('工作记录')).props.onClick();tree=h.render({...first,elapsed:9});assert.equal(text(tree).includes('req-a'),true);
  const next=base({phase:'waiting',title:'正在核对原请求',hint:'先核对同一编号，不重复生成。',details:'第二次请求的新详情',requestId:'req-b'});tree=h.render(next);
  assert.equal(elements(tree,'button').find(node=>text(node).includes('工作记录')).props['aria-expanded'],false);assert.equal(text(tree).includes('第一次请求的失败原因'),false);assert.equal(text(tree).includes('第二次请求的新详情'),false);
  elements(tree,'button').find(node=>text(node).includes('工作记录')).props.onClick();tree=h.render(next);assert.match(text(tree),/第二次请求的新详情/);assert.match(text(tree),/req-b/);assert.equal(text(tree).includes('req-a'),false);
});

test('record copy is translated and user-provided details remain inert text, with keyboard-native disclosure controls',()=>{
  const h=harness('en'),unsafe='<img src=x onerror=alert(1)>',props=base({details:unsafe,requestId:'req-unsafe'});let tree=h.render(props);
  elements(tree,'button').find(node=>text(node).includes('Work record')).props.onClick();tree=h.render(props);
  assert.match(text(tree),/Work record/);assert.match(text(tree),/Recorded reason/);assert.match(text(tree),/Current status/);assert.match(text(tree),/Request ID/);assert.match(text(tree),/Work record/);
  assert.equal(elements(tree,'img').length,0);assert.ok(text(tree).includes(unsafe));
  const toggle=elements(tree,'button').find(node=>text(node).includes('Work record'));assert.equal(toggle.props.type,'button');assert.equal(toggle.props['aria-expanded'],true);assert.match(toggle.props['aria-controls'],/req-unsafe/);
});

test('standalone activity catalog keeps the host language keys explicit',()=>{
  assert.equal(p0ActivityText('zh-CN','工作记录'),'工作记录');
  assert.equal(p0ActivityText('en','工作记录'),'Work record');
  assert.equal(p0ActivityText('en','本页已发起此请求；服务端是否已接收或完成，仍以核对结果为准。'),'This page started the request. Check its status to confirm whether the server received or completed it.');
});
