import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadComponent(file,replacements,exports) {
  const id=`preview-controls-${Date.now()}-${Math.random()}`;
  globalThis[id]=exports;
  let source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  source=source.replace("import { useHostLocale } from '@/app/components/HostLocaleProvider';",`const useHostLocale=globalThis[${JSON.stringify(id)}].useHostLocale;`);
  for(const [from,replacement] of Object.entries(replacements))source=source.replace(from,replacement(id));
  source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React}}).outputText;
  const {default:component}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return {component,dispose(){delete globalThis[id];}};
}
function collect(tree){const nodes=[];function visit(value){if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;nodes.push(value);visit(value.children);}visit(tree);return nodes;}

test('preview controls preserve device/width callbacks, refresh confirmation, and Escape behavior',async()=>{
  const calls=[],state=[];let stateCursor=0;
  const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useRef:initial=>({current:initial}),useState(initial){const index=stateCursor++;if(!(index in state))state[index]=initial;return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];}};
  const previousReact=globalThis.React;globalThis.React=React;
  const useHostLocale=()=>({t:(key,params={})=>String(key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??`{${name}}`)});
  const {component:PreviewControls,dispose}=await loadComponent('app/components/PreviewControls.tsx',{
    "import { useRef, useState } from 'react';":id=>`const {useRef,useState}=globalThis[${JSON.stringify(id)}].React;`,
    "import { Maximize2, RotateCcw } from 'lucide-react';":()=>`const Maximize2=()=>null,RotateCcw=()=>null;`,
    "import styles from './PreviewControls.module.css';":()=>`const styles=new Proxy({}, {get:(_,key)=>String(key)});`,
  },{React,useHostLocale,document:{getElementById(){return {focus(){}};}}});
  try {
    const props={device:'desktop',onDeviceChange:value=>calls.push(['device',value]),width:1100,onWidthChange:value=>calls.push(['width',value]),scale:1,onScaleChange:value=>calls.push(['scale',value]),fullscreenAvailable:true,onFullscreen:()=>calls.push(['fullscreen']),onRefresh:()=>calls.push(['refresh'])};
    const render=()=>{stateCursor=0;return PreviewControls(props);};
    let tree=render(),nodes=collect(tree);nodes.find(node=>node.type==='button'&&(node.children??[]).includes('手机')).props.onClick();assert.deepEqual(calls.splice(0),[['device','mobile'],['width',390]]);
    tree=render();collect(tree).find(node=>node.type==='button'&&node.props['aria-label']==='刷新预览').props.onClick();assert.deepEqual(calls,[]);
    tree=render();collect(tree).filter(node=>node.type==='button').find(node=>(node.children??[]).includes('取消')).props.onClick();assert.deepEqual(calls,[]);
    tree=render();collect(tree).find(node=>node.type==='button'&&node.props['aria-label']==='刷新预览').props.onClick();tree=render();collect(tree).filter(node=>node.type==='button').find(node=>(node.children??[]).includes('刷新')).props.onClick();assert.deepEqual(calls,[['refresh']]);
    const details=collect(tree).find(node=>node.type==='details');details.props.onKeyDown({key:'Escape',currentTarget:{open:true,querySelector:()=>({focus(){calls.push(['focus-summary']);}})},preventDefault(){calls.push(['prevent']);},stopPropagation(){calls.push(['stop']);}});assert.deepEqual(calls.slice(-3),[['prevent'],['stop'],['focus-summary']]);
  }finally{dispose();if(previousReact===undefined)delete globalThis.React;else globalThis.React=previousReact;}
});
