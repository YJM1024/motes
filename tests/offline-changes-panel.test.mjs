import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadComponent() {
  const id=`offline-changes-${Date.now()}-${Math.random()}`;
  const globals={useHostLocale:()=>({locale:'en',t:(key,params={})=>String(key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??`{${name}}`)})};
  globalThis[id]=globals;
  const oldReact=globalThis.React,oldDocument=globalThis.document,oldWindow=globalThis.window;
  let state=[],cursor=0;
  const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useRef:initial=>({current:initial}),useEffect:()=>{},useMemo:fn=>fn(),useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];}};
  globalThis.React=React;
  let source=await readFile(new URL('../app/components/OfflineChangesPanel.tsx',import.meta.url),'utf8');
  source=source.replace("import { useEffect, useMemo, useRef, useState } from 'react';",`const {useEffect,useMemo,useRef,useState}=globalThis.React;`);
  source=source.replace("import { useHostLocale } from './HostLocaleProvider';",`const useHostLocale=globalThis[${JSON.stringify(id)}].useHostLocale;`);
  source=source.replace("import styles from './OfflineChangesPanel.module.css';",'const styles=new Proxy({}, {get:(_,key)=>String(key)});');
  source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React}}).outputText;
  const {default:component}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return {component,render(props){cursor=0;return component(props);},dispose(){delete globalThis[id];if(oldReact===undefined)delete globalThis.React;else globalThis.React=oldReact;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}};
}
function collect(tree){const nodes=[];function visit(value){if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;nodes.push(value);visit(value.children);}visit(tree);return nodes;}
function findButton(tree,label){return collect(tree).find(node=>node.type==='button'&&(node.children??[]).some(child=>child===label));}
function textContent(tree){if(typeof tree==='string')return tree;if(Array.isArray(tree))return tree.map(textContent).join(' ');return tree?.children?textContent(tree.children):'';}

test('offline changes require explicit discard confirmation and preserve the local copy',async()=>{
  const {component,render,dispose}=await loadComponent();
  try{
    const calls=[];
    const props={items:[{id:'source-1',kind:'source',state:'conflict',appId:'app-1',createdAt:'2026-10-31T10:00:00Z',html:'<!doctype html><title>local</title>'}],busy:false,onDiscard:id=>calls.push(id),onClose:()=>{}};
    let tree=render(props);
    findButton(tree,'放弃此更改').props.onClick();
    tree=render(props);
    assert.equal(calls.length,0);
    assert.match(textContent(tree),/本地副本仍保留/);
    assert.match(textContent(tree),/不会删除公共数据/);
    findButton(tree,'确认移出队列').props.onClick();
    assert.deepEqual(calls,['source-1']);
  }finally{dispose();}
});

test('runtime export is a user-triggered local JSON download with no platform session fields',async()=>{
  const {component,render,dispose}=await loadComponent();
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  let capturedBlob,anchor;
  URL.createObjectURL=blob=>{capturedBlob=blob;return 'blob:test';};URL.revokeObjectURL=()=>{};
  globalThis.document={activeElement:null,createElement(tag){assert.equal(tag,'a');anchor={click(){anchor.clicked=true;}};return anchor;}};
  globalThis.window={setTimeout};
  try{
    const item={id:'runtime-2',kind:'runtime',state:'pending',appId:'app-2',createdAt:'2026-10-31T10:00:00Z',key:'demo.budget.v1',value:{limit:5000,expenses:[100,200]}};
    const tree=render({items:[item],onDiscard:()=>{},onClose:()=>{}});
    findButton(tree,'导出 JSON').props.onClick();
    assert.equal(anchor.clicked,true);
    assert.match(anchor.download,/\.json$/);
    const payload=JSON.parse(await capturedBlob.text());
    assert.equal(payload.value.limit,5000);
    assert.equal(payload.key,'demo.budget.v1');
    assert.equal('credentials' in payload,false);
    assert.equal('token' in payload,false);
  }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dispose();}
});
