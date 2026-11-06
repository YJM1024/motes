import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const cache=new Map();
const rootUrl=new URL('../',import.meta.url);
async function load(file){
 const fileUrl=file instanceof URL?file:new URL(file,rootUrl);
 if(cache.has(fileUrl.href))return cache.get(fileUrl.href);
 let source=await readFile(fileUrl,'utf8');
 source=source.replace(/import\s+['"][^'"]+\.css['"];?/g,'');
 const imports=ts.createSourceFile(fileUrl.pathname,source,ts.ScriptTarget.Latest,true,fileUrl.pathname.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS).statements.filter(ts.isImportDeclaration);
 for(const statement of imports){
  const name=statement.moduleSpecifier.text;let url;
  if(name.startsWith('@/'))url=await load(name.slice(2)+'.ts');
  else if(name.startsWith('.'))url=await load(new URL(name+'.ts',fileUrl));
  else url=import.meta.resolve(name);
  source=source.replace(statement.moduleSpecifier.getText(),JSON.stringify(url));
 }
 let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 js=js.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')));
 const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(fileUrl.href,url);return url;
}
const {createReactProject}=await import(await load('lib/motes/react-project.ts'));
const {default:SourceViewer}=await import(await load('app/lite/LiteSourceViewer.tsx'));
const {default:VersionDiff}=await import(await load('app/lite/LiteVersionDiff.tsx'));
const project=label=>createReactProject({'src/App.jsx':`export default function App(){return <p>${label}</p>}`,'src/index.css':'@import "tailwindcss";'});
test('React source viewer offers real editable source and fixed runnable scaffold files',()=>{
 const html=renderToStaticMarkup(React.createElement(SourceViewer,{html:project('hello'),number:1,onClose(){}}));
 for(const path of ['src/App.jsx','src/index.css','src/main.jsx','package.json','vite.config.js'])assert.ok(html.includes(path),path);
 assert.match(html,/export default function App/);assert.doesNotMatch(html,/data-motes-project=/);
});
test('React diff compares App source lines and retains selectors for all files',()=>{
 const html=renderToStaticMarkup(React.createElement(VersionDiff,{versions:[{id:'a',number:1,html:project('before')},{id:'b',number:2,html:project('after')}],currentVersionId:'b',onClose(){}}));
 assert.match(html,/新增 1 行/);assert.match(html,/删除 1 行/);assert.match(html,/src\/index.css/);assert.match(html,/lite-diff-added/);assert.match(html,/before/);assert.match(html,/after/);assert.doesNotMatch(html,/motes.react.v1/);
});
test('legacy HTML source remains a full HTML file',()=>{
 const source='<!doctype html><html><body><p>legacy</p></body></html>';
 const html=renderToStaticMarkup(React.createElement(SourceViewer,{html:source,number:1,onClose(){}}));
 assert.match(html,/index.html/);assert.match(html,/&lt;!doctype html&gt;/);assert.doesNotMatch(html,/src\/App.jsx/);
});

test('standalone React exports disclose temporary SDK state while legacy exports retain exact bytes',async()=>{
 const {exportApplicationHtml}=await import(await load('lib/motes/application-export.ts'));
 const rendered='<html><body><div id="root"></div></body></html>';
 const result=exportApplicationHtml(project('offline'),rendered);
 assert.match(result,/SDK 数据桥不可用/);assert.match(result,/仅作临时使用/);assert.match(result,/<aside role="status"/);
 assert.equal(exportApplicationHtml(rendered,rendered),rendered);
});
