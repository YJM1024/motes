import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let componentId = 0;
async function loadComponent(file, replacements, exports) {
  const id = `p0-component-${++componentId}`;
  const oldGlobals = Object.keys(exports).map(key => [key, globalThis[key]]);
  Object.assign(globalThis, exports);
  let source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  source = source.replaceAll("import { useHostLocale } from '@/app/components/HostLocaleProvider';", `const useHostLocale=globalThis[${JSON.stringify(id)}].useHostLocale;`);
  for (const [from, replacement] of Object.entries(replacements)) source = source.replace(from, replacement(id));
  globalThis[id] = exports;
  source = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const { default: component } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return { component, dispose() { delete globalThis[id]; for (const [key, value] of oldGlobals) value === undefined ? delete globalThis[key] : globalThis[key] = value; } };
}
const stylesReplacement = from => [`import styles from './${from}';`, id => `const styles=new Proxy({}, {get:(_,key)=>String(key)});`];
function collect(tree) { const nodes=[];function visit(value){if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;nodes.push(value);visit(value.children);}visit(tree);return nodes; }
const labels = node => (node.children ?? []).flatMap(child => typeof child === 'string' ? [child] : child?.children?.filter?.(value => typeof value === 'string') ?? []).join('');

test('artifact card sends each action to its matching saved-version callback and disables all actions', async () => {
  const calls=[];
  const useHostLocale=()=>({locale:'en'});
  const React={createElement:(type,props,...children)=>({type,props:props??{},children})};
  const p0ArtifactText=(locale,key,params={})=>locale==='en'?({ '已保存成果':'Saved artifact','版本 v{number}':`Version v${params.number}`,'未命名版本':'Untitled version','版本状态':'Version status','版本操作':'Version actions','创建于 {date}':`Created ${params.date}`,'模型生成':'Model generated','预览此版本':'Preview this version','正在查看此版本':'Previewing this version','查看源码':'View source','版本历史':'Version history','导出此版本 HTML':'Export this version HTML','导出版本 v{number} HTML':`Export version v${params.number} HTML`,'当前版本':'Current version','正在查看':'Currently previewing','历史版本':'Historical version','重要':'Important' })[key] ?? key : key;
  const {component:ArtifactCard,dispose}=await loadComponent('app/components/ArtifactCard.tsx',{
    "import { p0ArtifactText } from '@/lib/motes/locale/p0-artifacts';":id=>`const p0ArtifactText=globalThis[${JSON.stringify(id)}].p0ArtifactText;`,
    "import { Code2, Download, Eye, History, Star } from 'lucide-react';":()=>`const icon=()=>null;const Code2=icon,Download=icon,Eye=icon,History=icon,Star=icon;`,
    ...Object.fromEntries([stylesReplacement('ArtifactCard.module.css')]),
  },{React,useHostLocale,p0ArtifactText});
  try {
    const props={versionNumber:7,name:'Travel budget',important:true,current:false,viewing:true,historical:true,mode:'model',date:'2026-11-01T12:30:00.000Z',onPreview:()=>calls.push('preview'),onSource:()=>calls.push('source'),onHistory:()=>calls.push('history'),onExport:()=>calls.push('export')};
    const tree=ArtifactCard(props),buttons=collect(tree).filter(node=>node.type==='button');
    assert.equal(buttons.length,4);
    buttons.find(node=>node.props['aria-pressed']===true).props.onClick();
    buttons.find(node=>node.props['aria-label']==='View source · v7').props.onClick();
    buttons.find(node=>node.props['aria-label']==='Version history · v7').props.onClick();
    buttons.find(node=>node.props['aria-label']==='Export version v7 HTML').props.onClick();
    assert.deepEqual(calls,['preview','source','history','export']);
    const disabled=collect(ArtifactCard({...props,disabled:true})).filter(node=>node.type==='button');
    assert.ok(disabled.every(button=>button.props.disabled===true));
    assert.ok(disabled.every(button=>typeof button.props.onClick==='function'));
    assert.ok(buttons.some(button=>button.props['aria-label']==='Export version v7 HTML'));
  } finally { dispose(); }
});

