import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const cache=new Map();
async function load(name){
  if(cache.has(name))return cache.get(name);
  let source=await readFile(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');
  const imports=ts.createSourceFile(name+'.ts',source,ts.ScriptTarget.Latest,true).statements.filter(ts.isImportDeclaration);
  for(const node of imports.toReversed()){
    const spec=node.moduleSpecifier.text;
    const url=spec.startsWith('.')?await load(new URL(spec,new URL('file:///lib/'+name+'.ts')).pathname.slice(5)):import.meta.resolve(spec);
    source=source.slice(0,node.moduleSpecifier.getStart())+JSON.stringify(url)+source.slice(node.moduleSpecifier.end);
  }
  const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');cache.set(name,url);return url;
}
const project=await import(await load('motes/react-project')),patch=await import(await load('motes/react-patch')),render=await import(await load('motes/react-render'));
const {initialAppTitle}=await import(await load('forma/app-title'));
const files=()=>({'src/App.jsx':`import React,{useState} from 'react';\nexport default function App(){const [n,setN]=useState(0);return <button className="p-4 bg-violet-600 hover:bg-violet-700 md:grid w-[123px] bg-[rgb(1,2,3)]" onClick={()=>setN(n+1)}>Counter {n}</button>}`,'src/index.css':'@import "tailwindcss";\nbody { margin: 0; }'});
test('source envelope safely roundtrips script-breaking data and exposes a runnable fixed Vite scaffold',()=>{
  const f=files();f['src/App.jsx']+='\n// </script><script>alert(1)</script> & >';
  const html=project.createReactProject(f);
  assert.deepEqual(project.parseReactProject(html).files,f);assert.equal((html.match(/<script/g)||[]).length,1);
  const exported=project.projectFiles(html),map=Object.fromEntries(exported.map(f=>[f.path,f.content]));
  for(const path of ['package.json','vite.config.js','index.html','src/main.jsx','src/App.jsx','src/index.css'])assert.ok(map[path]);
  assert.equal(JSON.parse(map['package.json']).scripts.build,'vite build');
  assert.equal(JSON.parse(map['package.json']).devDependencies.vite,'7.3.7');
  assert.match(map['src/main.jsx'],/createRoot/);assert.match(map['vite.config.js'],/tailwindcss/);
  assert.throws(()=>project.createReactProject({...files(),'../secret':'x'}));
  assert.throws(()=>project.createReactProject({...files(),'src/index.css':'x'.repeat(180001)}));
});
test('React titles use static h1 display text, with safe prompt fallback for dynamic headings',()=>{
  const f=files();f['src/App.jsx']='export default ()=> <h1 className="text-xl">旅行 &amp; 预算</h1>';
  assert.equal(initialAppTitle(project.createReactProject(f),'后备名称'),'旅行 & 预算');
  f['src/App.jsx']='export default ()=> <h1>{dynamicName}</h1>';
  assert.equal(initialAppTitle(project.createReactProject(f),'后备名称'),'后备名称');
});
test('file patches are atomic, unique, nonoverlapping and cannot edit scaffold',()=>{
  const base=project.createReactProject(files()),edit=(search,replace,path='src/App.jsx')=>({path,search,replace});
  const apply=edits=>patch.applyReactPatch(base,{format:'motes.react.replace.v1',edits});
  assert.match(project.parseReactProject(apply([edit('Counter ','Total ')] )).files['src/App.jsx'],/Total /);
  for(const edits of [[edit('n','x')],[edit('missing','x')],[edit('Counter ','Counter ')],[edit('Counter ','X','package.json')],[edit('Counter {n}','X'),edit('{n}','Y')],[edit('Counter ','X'),edit('X','Y')],[edit(files()['src/App.jsx'],'export default ()=>null;')]])assert.throws(()=>apply(edits));
  assert.equal(base,project.createReactProject(files()));
});
test('real JSX and Tailwind compilation is inline, handles arbitrary utilities, and never executes source',async()=>{
  globalThis.reactSourceExecuted=false;const f=files();f['src/App.jsx']='globalThis.reactSourceExecuted=true;\n'+f['src/App.jsx'];
  const html=await render.renderApplicationHtml(project.createReactProject(f));
  assert.equal(globalThis.reactSourceExecuted,false);delete globalThis.reactSourceExecuted;
  assert.ok(html.length>180000);assert.match(html,/createElement/);assert.match(html,/123px/);assert.match(html,/rgb\(1,2,3\)/);assert.match(html,/\.p-4/);assert.match(html,/\.md\\:grid/);
  assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=|https:\/\/cdn/);
  assert.equal(await render.renderApplicationHtml('<html>legacy</html>'),'<html>legacy</html>');
});
test('compilation rejects malformed JSX, missing default export, forbidden modules, dynamic imports and external CSS',async()=>{
  for(const code of [`import x from 'evil';export default ()=>null;`,`import './evil';export default ()=>null;`,`export default ()=>import('react');`,`export default ()=>require('evil');`,`export default ()=> <div>;`,`const App=()=>null;`,`export default ()=>eval('1');`]){
    const f=files();f['src/App.jsx']=code;await assert.rejects(render.renderApplicationHtml(project.createReactProject(f)));
  }
  for(const css of ['@import "https://evil.example/x.css";','@plugin "evil";','body{background:url(https://evil.example)}','</style><script>evil()</script>']){
    const f=files();f['src/index.css']=css;await assert.rejects(render.renderApplicationHtml(project.createReactProject(f)));
  }
});

test('compilation rejects top-level bindings that conflict with the hosted runtime wrapper',async()=>{
  for(const binding of ['const exports={};','let require;','var exports;','function require(){}']){
    const f=files();f['src/App.jsx']=binding+'\nexport default ()=> <div>Application</div>;';
    await assert.rejects(render.renderApplicationHtml(project.createReactProject(f)),/编译检查/);
  }
  // Nested component bindings have their own scope and remain valid.
  const f=files();f['src/App.jsx']='export default function App(){const exports="ok";const require="local";return <div>{exports}{require}</div>}';
  await assert.doesNotReject(render.renderApplicationHtml(project.createReactProject(f)));
});
