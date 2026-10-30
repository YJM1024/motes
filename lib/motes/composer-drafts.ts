type StorageLike = { getItem(key:string):string|null;setItem(key:string,value:string):void };
export function composerDraftStore(storage:StorageLike){
  let workspace:string|null=null,values:Record<string,string>={};
  function save(){if(workspace)storage.setItem('motes-build-drafts:'+workspace,JSON.stringify(values))}
  return{
    load(id:string){if(workspace===id)return;workspace=id;let next:unknown={};try{next=JSON.parse(storage.getItem('motes-build-drafts:'+id)||'{}')}catch{}values=next&&typeof next==='object'&&!Array.isArray(next)?Object.fromEntries(Object.entries(next).filter(([,value])=>typeof value==='string')):{}},
    read(key:string){return values[key]||''},
    entries(){return{...values}},
    write(id:string,key:string,text:string){if(id!==workspace)return false;values={...values,[key]:text};save();return true},
    transfer(id:string,from:string,to:string){if(id!==workspace||from===to)return;const incoming=values[from]||'',existing=values[to]||'';if(incoming)values={...values,[to]:existing&&existing!==incoming?existing+'\n\n'+incoming:incoming,[from]:''};save()},
  };
}
