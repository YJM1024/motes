export const REACT_FORMAT = 'motes.react.v1' as const;
export const REACT_PATHS = ['src/App.jsx','src/index.css'] as const;
export type ReactProject = {format:typeof REACT_FORMAT;files:Record<typeof REACT_PATHS[number],string>};
const marker='data-motes-project="motes.react.v1"';
function validate(value:unknown):ReactProject {
  const p=value as ReactProject;
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!=='files,format'||p.format!==REACT_FORMAT||!p.files||typeof p.files!=='object'||Array.isArray(p.files)||Object.keys(p.files).sort().join(',')!=='src/App.jsx,src/index.css'||REACT_PATHS.some(path=>typeof p.files[path]!=='string')||!p.files['src/App.jsx'].trim())throw new Error('模型 React 工程格式无效；原版本仍保留。');
  return p;
}
export function createReactProject(files:ReactProject['files']):string {
  const project=validate({format:REACT_FORMAT,files});
  const json=JSON.stringify(project).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>新建应用</title></head><body><script type="application/json" ${marker}>${json}</script></body></html>`;
  if(html.length>180000)throw new Error('模型 React 工程超出源码上限；原版本仍保留。');
  return html;
}
export function parseReactProject(html:string):ReactProject|null {
  if(!html.includes(marker))return null;
  const match=html.match(/<script type="application\/json" data-motes-project="motes\.react\.v1">([\s\S]*?)<\/script>/);
  if(!match||html.length>180000)throw new Error('模型 React 工程封装损坏；原版本仍保留。');
  try{return validate(JSON.parse(match[1]));}catch{throw new Error('模型 React 工程源码无效；原版本仍保留。');}
}
const scaffold:Record<string,string>={
  'package.json':JSON.stringify({name:'motes-react-app',version:'1.0.0',private:true,type:'module',scripts:{dev:'vite',build:'vite build',preview:'vite preview'},dependencies:{react:'19.2.6','react-dom':'19.2.6',tailwindcss:'4.2.1'},devDependencies:{vite:'7.3.7','@tailwindcss/vite':'4.2.1'}},null,2)+'\n',
  'index.html':'<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Motes React App</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n',
  'vite.config.js':"import {defineConfig} from 'vite';\nimport tailwindcss from '@tailwindcss/vite';\nexport default defineConfig({plugins:[tailwindcss()],esbuild:{jsx:'automatic'}});\n",
  'src/main.jsx':"import React from 'react';\nimport {createRoot} from 'react-dom/client';\nimport App from './App.jsx';\nimport './index.css';\ncreateRoot(document.getElementById('root')).render(<App />);\n",
  'README.md':'# React + Tailwind application\n\nRequires Node.js 22.13 or newer. Run `npm install`, then `npm run dev` or `npm run build`.\n\nThe Motes shared-data SDK is supplied by the hosted preview/public page. Outside Motes, applications must show temporary-preview status when the SDK is unavailable.\n',
};
export function projectFiles(html:string):{path:string;content:string}[]{
  const project=parseReactProject(html);
  return project?Object.entries({...scaffold,...project.files}).map(([path,content])=>({path,content})):[{path:'index.html',content:html}];
}
