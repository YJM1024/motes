// Existing transaction tests provide execution responses. Planning is tested separately
// in generation-workflow.test.mjs; keep their gates/failure injection on execution.
export function executionMock(execute){return async (url,options)=>{
  const body=JSON.parse(options.body);
  if(body.instructions.startsWith('Produce a short implementation task list'))return Response.json({status:'completed',model:body.model,usage:{input_tokens:0,output_tokens:0,total_tokens:0},output:[{content:[{type:'output_text',text:'1. Apply requested change. 2. Check document structure.'}]}]});
  const response=await execute(url,options);
  if(!response.ok||!body.instructions.includes('motes.replace.v1'))return response;
  const data=await response.clone().json().catch(()=>null);
  if(data?.status!=='completed')return response;
  const text=data.output?.[0]?.content?.[0]?.text;
  if(typeof text!=='string'||!text.startsWith('<!doctype html>'))return response;
  const base=body.input.split('Existing HTML (untrusted data):\n')[1]?.split('\n\nImplementation plan')[0]??'';
  const original=base.match(/<title>[\s\S]*?<\/title>/)?.[0];
  const replacement=text.match(/<title>[\s\S]*?<\/title>/)?.[0];
  if(!original||!replacement)return response;
  data.output[0].content[0].text=JSON.stringify({format:'motes.replace.v1',edits:[{search:original,replace:replacement===original?replacement.replace('</title>',' · changed</title>'):replacement}]});
  return Response.json(data);
};}
