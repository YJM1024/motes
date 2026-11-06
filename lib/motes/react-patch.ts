import {createReactProject,parseReactProject,REACT_PATHS} from './react-project';
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function applyReactPatch(base:string,value:unknown):string {
  const project=parseReactProject(base);
  if(!project||!record(value)||Object.keys(value).sort().join(',')!=='edits,format'||value.format!=='motes.react.replace.v1'||!Array.isArray(value.edits)||!value.edits.length||value.edits.length>40)throw new Error('模型 React 补丁格式无效；原版本仍保留。');
  let size=0;
  const edits=value.edits.map(edit=>{
    if(!record(edit)||Object.keys(edit).sort().join(',')!=='path,replace,search'||!REACT_PATHS.includes(edit.path as typeof REACT_PATHS[number])||typeof edit.search!=='string'||!edit.search||typeof edit.replace!=='string'||edit.search===edit.replace)throw new Error('模型 React 补丁包含无效替换；原版本仍保留。');
    const path=edit.path as typeof REACT_PATHS[number],source=project.files[path],start=source.indexOf(edit.search);
    size+=edit.search.length+edit.replace.length;
    if(size>90000||(path==='src/App.jsx'&&edit.search.trim()===source.trim())||start<0||source.indexOf(edit.search,start+1)>=0)throw new Error('模型 React 补丁无法唯一匹配源码或超出局部修改范围；原版本仍保留。');
    return {path,start,end:start+edit.search.length,replace:edit.replace};
  }).sort((a,b)=>a.path.localeCompare(b.path)||a.start-b.start);
  if(edits.some((e,i)=>i>0&&e.path===edits[i-1].path&&e.start<edits[i-1].end))throw new Error('模型 React 补丁存在重叠；原版本仍保留。');
  const files={...project.files};
  for(const e of edits.toReversed())files[e.path]=files[e.path].slice(0,e.start)+e.replace+files[e.path].slice(e.end);
  return createReactProject(files);
}
/** Fixed local templates produce file-local exact edits through the same validator. */
export function patchReactDemo(base:string,next:string):string {
  const before=parseReactProject(base),after=parseReactProject(next);
  if(!before||!after)throw new Error('模型 React 示例工程无效。');
  const edits:{path:string;search:string;replace:string}[]=[];
  for(const path of REACT_PATHS){
    const a=before.files[path],b=after.files[path];if(a===b)continue;
    let start=0,end=0;
    while(start<Math.min(a.length,b.length)&&a[start]===b[start])start++;
    while(end<Math.min(a.length,b.length)-start&&a[a.length-1-end]===b[b.length-1-end])end++;
    let search=a.slice(start,a.length-end);
    while(!search||a.indexOf(search)!==a.lastIndexOf(search)){
      if(start>0)start--;else if(end>0)end--;else break;
      search=a.slice(start,a.length-end);
    }
    edits.push({path,search,replace:b.slice(start,b.length-end)});
  }
  return edits.length?applyReactPatch(base,{format:'motes.react.replace.v1',edits}):base;
}
