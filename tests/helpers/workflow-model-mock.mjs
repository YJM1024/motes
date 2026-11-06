// Transaction fixtures provide execution payloads; preserve their gates, errors,
// token observations and legacy HTML edits while speaking the requested format.
export function executionMock(execute){return async (url,options)=>{
  const body=JSON.parse(options.body);
  if(body.instructions.startsWith('Produce a short implementation task list'))return Response.json({status:'completed',model:body.model,usage:{input_tokens:0,output_tokens:0,total_tokens:0},output:[{content:[{type:'output_text',text:'1. Apply requested change. 2. Check document structure.'}]}]});
  const response=await execute(url,options);
  if(!response.ok)return response;
  const data=await response.clone().json().catch(()=>null);
  if(data?.status!=='completed')return response;
  const text=data.output?.[0]?.content?.[0]?.text;
  if(typeof text!=='string'||!/^<!doctype html>[\s\S]*<\/html>\s*$/i.test(text))return response;
  const base=body.input.split(/Existing (?:HTML|source) \(untrusted data\):\n/)[1]?.split('\n\nImplementation plan')[0]??'';
  const replacement=text.match(/<title>[\s\S]*?<\/title>/)?.[0];
  if(body.instructions.includes('motes.react.v1')||body.instructions.includes('motes.react.replace.v1')){
    const title=replacement?.replace(/<\/?title>/g,'')??'事务测试应用';
    if(body.instructions.includes('motes.react.replace.v1')){
      const project=JSON.parse(base),app=project.files['src/App.jsx'];
      const original=app.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)?.[0];
      if(!original)throw new Error('React transaction fixture needs an h1 title');
      const next='<h1>'+title+'</h1>';
      data.output[0].content[0].text=JSON.stringify({format:'motes.react.replace.v1',edits:[{path:'src/App.jsx',search:original,replace:next===original?'<h1>'+title+' · changed</h1>':next}]});
    }else data.output[0].content[0].text=JSON.stringify({format:'motes.react.v1',files:{'src/App.jsx':'export default function App(){return <main className="p-4"><h1>'+title+'</h1><p>事务测试应用</p></main>}','src/index.css':'@import "tailwindcss";'}});
    return Response.json(data);
  }
  if(!body.instructions.includes('motes.replace.v1'))return response;
  const original=base.match(/<title>[\s\S]*?<\/title>/)?.[0];
  if(!original||!replacement)return response;
  data.output[0].content[0].text=JSON.stringify({format:'motes.replace.v1',edits:[{search:original,replace:replacement===original?replacement.replace('</title>',' · changed</title>'):replacement}]});
  return Response.json(data);
};}
