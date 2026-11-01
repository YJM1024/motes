import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadComponent() {
  const id=`workspace-status-${Date.now()}-${Math.random()}`;
  const helperSource=await readFile(new URL('../app/hooks/workspace-status.ts',import.meta.url),'utf8');
  const helperModule=await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(helperSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64')}`);
  globalThis[id]={useHostLocale:()=>({t:(key,params={})=>String(key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??`{${name}}`)})};
  globalThis.workspaceStatusView=helperModule.workspaceStatusView;
  const previousReact=globalThis.React;
  globalThis.React={createElement:(type,props,...children)=>({type,props:props??{},children}),useEffect:()=>{},useRef:()=>({current:null})};
  let source=await readFile(new URL('../app/components/WorkspaceStatus.tsx',import.meta.url),'utf8');
  source=source.replace("import {workspaceStatusView} from '../hooks/workspace-status';",'const workspaceStatusView=globalThis.workspaceStatusView;');
  source=source.replace("import {useEffect,useRef} from 'react';",`const {useEffect,useRef}=globalThis.React;`);
  source=source.replace("import { useHostLocale } from './HostLocaleProvider';",`const useHostLocale=globalThis[${JSON.stringify(id)}].useHostLocale;`);
  source=source.replace("import styles from './WorkspaceStatus.module.css';",'const styles=new Proxy({}, {get:(_,key)=>String(key)});');
  source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React}}).outputText;
  const {default:component}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return {component,dispose(){delete globalThis[id];if(previousReact===undefined)delete globalThis.React;else globalThis.React=previousReact;delete globalThis.workspaceStatusView;}};
}
function collect(tree){const nodes=[];function visit(value){if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;nodes.push(value);visit(value.children);}visit(tree);return nodes;}
function textContent(tree){if(typeof tree==='string')return tree;if(Array.isArray(tree))return tree.map(textContent).join(' ');return tree?.children?textContent(tree.children):'';}

test('disconnected build retains an actionable demo path and states that work is preserved',async()=>{
  const {component:WorkspaceStatus,dispose}=await loadComponent();
  try{
    let toggles=0;
    const props={visibility:'private',ready:true,intent:'build',mode:'model',model:null,connected:false,busy:false,remaining:null,limit:null,warning:false,onToggleMode:()=>toggles++,onAlertPreferences:()=>{}};
    const tree=WorkspaceStatus(props),nodes=collect(tree),texts=textContent(tree);
    assert.match(texts,/模型未连接/);
    assert.match(texts,/已保存成果会保留/);
    const demo=nodes.find(node=>node.type==='button'&&(node.children??[]).includes('体验示例'));
    assert.equal(demo.props.disabled,false);demo.props.onClick();assert.equal(toggles,1);
    const quota=WorkspaceStatus({...props,connected:true,remaining:0});
    const quotaText=textContent(quota);
    assert.match(quotaText,/今日模型额度已用完/);
    assert.match(quotaText,/已保存成果不会被覆盖/);
  }finally{dispose();}
});

 test('testing mode displays actual calls without stale quota, exhaustion or low-quota preferences',async()=>{
  const {component:WorkspaceStatus,dispose}=await loadComponent();try{
   const layer={model:{used:63,remaining:0,limit:10},demo:{used:101,remaining:0,limit:100}};
   for(const visibility of ['shared','private']){
    const text=textContent(WorkspaceStatus({visibility,limitsEnforced:false,todayModelAttempts:63,limits:{visitor:layer,shared:layer,global:layer},ready:true,intent:'build',mode:'model',model:'test-model',connected:true,busy:false,remaining:0,limit:10,warning:true,onToggleMode:()=>{},onAlertPreferences:()=>{}}));
    assert.match(text,/测试期间不限每日请求次数/);assert.match(text,/今日 AI 请求：63 次/);
    assert.doesNotMatch(text,/三层|剩余|额度已用完|额度未读取|额度日|额度提醒偏好|63\/10/);
   }
  }finally{dispose();}
 });
