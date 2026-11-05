export type HtmlPatch = {format:'motes.replace.v1';edits:{search:string;replace:string}[]};
const MAX_HTML=180000,MAX_EDITS=40,MAX_CHANGE=90000;
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
/** Every search matches the original exactly once. All edits apply together or none do. */
export function applyHtmlPatch(base:string,value:unknown):string {
  if(base.length>MAX_HTML||!record(value)||Object.keys(value).sort().join(',')!=='edits,format'||value.format!=='motes.replace.v1'||!Array.isArray(value.edits)||!value.edits.length||value.edits.length>MAX_EDITS)throw new Error('模型修改补丁格式无效；原版本仍保留。');
  let changed=0;
  const ranges=value.edits.map(edit=>{
    if(!record(edit)||Object.keys(edit).sort().join(',')!=='replace,search'||typeof edit.search!=='string'||typeof edit.replace!=='string'||!edit.search||edit.search===edit.replace)throw new Error('模型修改补丁包含无效替换；原版本仍保留。');
    changed+=edit.search.length+edit.replace.length;
    // Prevent disguised whole-document rewrites, even when the payload says patch.
    if(changed>MAX_CHANGE||/<!doctype\s+html|<\/?(?:html|body)\b/i.test(edit.search)||/<!doctype\s+html|<\/?(?:html|body)\b/i.test(edit.replace))throw new Error('模型修改补丁超出局部修改范围；请拆分需求，原版本仍保留。');
    const start=base.indexOf(edit.search);
    if(start<0||base.indexOf(edit.search,start+1)>=0)throw new Error('模型修改补丁无法唯一匹配原代码；原版本仍保留。');
    return {start,end:start+edit.search.length,replace:edit.replace};
  }).sort((a,b)=>a.start-b.start);
  if(ranges.some((range,i)=>i>0&&range.start<ranges[i-1].end))throw new Error('模型修改补丁存在重叠；原版本仍保留。');
  let result=base;
  for(const range of ranges.toReversed())result=result.slice(0,range.start)+range.replace+result.slice(range.end);
  if(result.length>MAX_HTML)throw new Error('模型修改结果超出 HTML 上限；原版本仍保留。');
  return result;
}
/** Fixed templates are diffed deterministically, then use the same atomic validator. */
export function demoPatch(base:string,next:string):HtmlPatch {
  if(base===next)return {format:'motes.replace.v1',edits:[]};
  // Template HTML is one line; split at stable HTML/CSS boundaries to preserve code.
  const before=base.split(/(?<=>)|(?<=})/),after=next.split(/(?<=>)|(?<=})/);
  if(before.length!==after.length)throw new Error('示例模板结构已变化，请创建新示例。');
  const edits:{search:string;replace:string}[]=[];
  for(let i=0;i<before.length;i++)if(before[i]!==after[i]){
    let start=i,end=i+1,search=before.slice(start,end).join('');
    while(base.indexOf(search)!==base.lastIndexOf(search)&&start>0){start--;search=before.slice(start,end).join('');}
    if(edits.some(e=>search.includes(e.search)))throw new Error('示例补丁存在歧义，请创建新示例。');
    edits.push({search,replace:after.slice(start,end).join('')});
  }
  return {format:'motes.replace.v1',edits};
}
/** Bounded structural validation only. Never executes generated JS or claims browser testing. */
export function checkGeneratedHtml(html:string):void {
  if(html.length<100||html.length>MAX_HTML||!/^<!doctype html>/i.test(html)||!/<html[\s>]/i.test(html)||!/<\/html>\s*$/i.test(html)||!/<body[\s>]/i.test(html)||!/<\/body\s*>/i.test(html))throw new Error('模型结果未通过 HTML 结构检查；原版本仍保留。');
  for(const tag of ['script','style']) {
    const open=[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>','gi'))].length;
    const close=[...html.matchAll(new RegExp('</'+tag+'\\s*>','gi'))].length;
    if(open!==close)throw new Error('模型结果包含未闭合的脚本或样式；原版本仍保留。');
  }
}
