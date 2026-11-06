import {transform} from 'sucrase';
import {parse} from 'acorn';
import {compile} from 'tailwindcss';
import {parseReactProject} from './react-project';
import {REACT_RUNTIME,TAILWIND_THEME,TAILWIND_PREFLIGHT} from './react-runtime.generated';

function fail():never{throw new Error('模型 React 源码未通过编译检查（仅允许 React 导入及静态 Tailwind 样式）；原版本仍保留。');}
type Node={type:string;[key:string]:unknown};
function walk(value:unknown,visit:(node:Node)=>void):void {
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const item of value)walk(item,visit);return;}
  const node=value as Node;if(typeof node.type==='string')visit(node);
  for(const child of Object.values(node))if(child&&typeof child==='object')walk(child,visit);
}
/** Parse transformed code without executing it. Runtime module resolution is React-only. */
function compileJs(source:string):{code:string;candidates:string[]} {
  try{
    const jsx=transform(source,{transforms:['jsx'],jsxRuntime:'classic',production:true,jsxPragma:'window.__motesReact.createElement',jsxFragmentPragma:'window.__motesReact.Fragment'}).code;
    walk(parse(jsx,{ecmaVersion:'latest',sourceType:'module'}),node=>{
      if(node.type==='ImportExpression')fail();
      if((node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration')&&node.source&&(node.source as Node).value!=='react')fail();
    });
    const output=transform(jsx,{transforms:['imports']}).code;
    const tree=parse(output,{ecmaVersion:'latest',sourceType:'script'});
    let hasDefault=false;const candidates=new Set<string>();
    walk(tree,node=>{
      const text=node.type==='Literal'&&typeof node.value==='string'?node.value:node.type==='TemplateElement'?(node.value as {cooked?:string})?.cooked:null;
      if(text)for(const token of text.split(/\s+/))if(token&&token.length<512)candidates.add(token);
      if(node.type==='ImportExpression'||node.type==='ImportDeclaration'||node.type.startsWith('Export'))fail();
      if(node.type==='CallExpression'){
        const callee=node.callee as Node;
        if(callee?.type==='Identifier'&&callee.name==='require'){
          const args=node.arguments as Node[];
          if(args.length!==1||args[0].type!=='Literal'||args[0].value!=='react')fail();
        }
        if(callee?.type==='Identifier'&&(callee.name==='eval'||callee.name==='Function'))fail();
      }
      if(node.type==='NewExpression'&&(node.callee as Node)?.name==='Function')fail();
      if(node.type==='AssignmentExpression'){
        const left=node.left as Node;
        if(left.type==='MemberExpression'&&(left.object as Node)?.name==='exports'&&(left.property as Node)?.name==='default')hasDefault=true;
      }
    });
    if(!hasDefault)fail();
    return {code:output,candidates:[...candidates]};
  }catch{fail();}
}
function safeScript(source:string):string{return source.replace(/<\/script/gi,'<\\/script').replace(/<!--/g,'<\\!--');}
/** The same pure-JS compiler runs in Workers and browsers, with no generated-code execution. */
export async function renderApplicationHtml(html:string):Promise<string> {
  const project=parseReactProject(html);if(!project)return html;
  const compiled=compileJs(project.files['src/App.jsx']);
  let css=project.files['src/index.css'].replace(/@import\s+(['"])tailwindcss\1\s*;/g,'');
  // No module/plugin/remote loading hooks are supplied to Tailwind. CSS stays inline.
  if(/@(?:import|plugin|config|source)\b|url\s*\(|<\/style/i.test(css))fail();
  try{
    const compiler=await compile('@layer theme, base, components, utilities;\n@layer theme {'+TAILWIND_THEME+'}\n@layer base {'+TAILWIND_PREFLIGHT+'}\n@tailwind utilities;\n'+css);
    // Delimited source tokens cover static string/template classes, arbitrary values,
    // variants and JS arrays. Dynamic interpolation is intentionally unsupported.
    css=compiler.build(compiled.candidates);
  }catch{fail();}
  const script=REACT_RUNTIME+'\n(()=>{const exports={};const require=(name)=>{if(name!=="react")throw new Error("Unsupported module");return window.__motesReact;};\n'+compiled.code+'\nwindow.__motesCreateRoot(document.getElementById("root")).render(window.__motesReact.createElement(exports.default));})();';
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>React 应用</title><style>'+css+'</style></head><body><div id="root"></div><script>'+safeScript(script)+'</script></body></html>';
}
