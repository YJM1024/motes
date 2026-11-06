import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowHarness} from './helpers/workflow-harness.mjs';

const response=(text,tokens=3)=>Response.json({status:'completed',model:'mock-model',usage:{input_tokens:tokens,output_tokens:tokens+1,total_tokens:tokens*2+1},output:[{content:[{type:'output_text',text}]}]});
const patch=(search,replace)=>({format:'motes.replace.v1',edits:[{search,replace}]});
const reactPatch=(search,replace)=>({format:'motes.react.replace.v1',edits:[{path:'src/App.jsx',search,replace}]});
const shortPlan='1. Preserve the shared counter and data key. 2. Update only the heading. 3. Check document structure.';

test('precise patches are atomic, uniquely matched against the original and bounded',async t=>{
  const h=await workflowHarness();t.after(h.close);
  const base='alpha beta gamma alpha';
  assert.equal(h.patch.applyHtmlPatch(base,patch('beta','updated')),'alpha updated gamma alpha');
  for(const value of [patch('alpha','x'),patch('missing','x'),patch('beta','beta'),{...patch('beta','x'),extra:true},patch('<html>','x'),patch('beta','<!doctype html>'),{format:'motes.replace.v1',edits:[{search:'beta gamma',replace:'x'},{search:'gamma',replace:'y'}]}, {format:'motes.replace.v1',edits:Array.from({length:41},()=>({search:'beta',replace:'x'}))},patch('beta','x'.repeat(90001))])assert.throws(()=>h.patch.applyHtmlPatch(base,value));
  assert.equal(base,'alpha beta gamma alpha');
  assert.throws(()=>h.patch.applyHtmlPatch(base,{format:'motes.replace.v1',edits:[{search:'beta',replace:'delta'},{search:'delta',replace:'epsilon'}]}),'No cascading edits against a partially changed document');
});

test('fixed example theme and budget changes use exact patches without rewriting scripts',async t=>{
  const h=await workflowHarness();t.after(h.close);
  for(const prompt of ['旅行预算计算器','任务看板','番茄钟']){
    const base=h.demo.generateDemo(prompt).html,next=h.demo.generateDemo('深色主题，蓝色，预算上限 8000',base).html;
    const edits=h.patch.demoPatch(base,next);
    assert.equal(h.patch.applyHtmlPatch(base,edits),next);
    assert.equal(base.match(/<script>([\s\S]*)<\/script>/)[1],next.match(/<script>([\s\S]*)<\/script>/)[1]);
  }
});

test('model workflow makes exactly two calls, passes the real plan, patches locally and sums usage',async t=>{
  const h=await workflowHarness();t.after(h.close);
  const base=h.demo.generateDemo('番茄钟').html,calls=[],phases=[],observations=[],timeouts=[];
  const timeout=AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);return timeout(ms)});
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    return calls.length===1?response(shortPlan,5):response(JSON.stringify(patch('<h1>专注，从这一刻开始</h1>','<h1>新的标题</h1>')),11);
  });
  const html=await h.model.generateWorkflowModel('修改标题',base,'mock-only','mock-model','UI language Chinese.',o=>observations.push(o),async(id,state)=>phases.push([id,state]));
  assert.equal(calls.length,2);assert.equal(calls[0].max_output_tokens,600);
  assert.ok(calls[1].input.includes(shortPlan));assert.ok(calls[1].instructions.includes('motes.replace.v1'));
  assert.ok(timeouts[0]<=30000&&timeouts[1]<=180000);
  assert.equal(html,base.replace('<h1>专注，从这一刻开始</h1>','<h1>新的标题</h1>'));
  assert.deepEqual(phases,[['plan','running'],['plan','completed'],['execute','running'],['execute','completed']]);
  assert.equal(observations.at(-1).totalTokens,34);assert.equal(observations.at(-1).callCount,2);assert.equal(observations.at(-1).usageComplete,true);
});

test('execution failures retain planning usage and never fall back to a full document or retry',async t=>{
  const h=await workflowHarness();t.after(h.close);
  const base=h.demo.generateDemo('番茄钟').html;
  for(const failure of ['timeout','full-html','ambiguous']){
    let count=0,last;
    const mocked=t.mock.method(globalThis,'fetch',async()=>{
      count++;
      if(count===1)return response(shortPlan,7);
      if(failure==='timeout')throw new DOMException('mock timeout','TimeoutError');
      return response(failure==='full-html'?base:JSON.stringify(patch('button','other')),13);
    });
    try{
      await assert.rejects(h.model.generateWorkflowModel('edit',base,'mock-only','mock-model','',o=>{last=o},async()=>{}));
      assert.equal(count,2);assert.equal(last.callCount,2);
      assert.equal(last.totalTokens,failure==='timeout'?15:42);
      assert.equal(last.usageComplete,failure!=='timeout');
    }finally{mocked.mock.restore();}
  }
});

test('invalid planning stops before execution; structural checks reject broken documents without executing scripts',async t=>{
  const h=await workflowHarness();t.after(h.close);let count=0;
  t.mock.method(globalThis,'fetch',async()=>{count++;return response(h.demo.generateDemo('番茄钟').html)});
  await assert.rejects(h.model.generateWorkflowModel('new',undefined,'mock-only','mock-model','',()=>{},async()=>{}));assert.equal(count,1);
  assert.throws(()=>h.patch.checkGeneratedHtml('<!doctype html><html><body>'+'x'.repeat(150)+'</html>'));
  assert.throws(()=>h.patch.checkGeneratedHtml('<!doctype html><html><body><script>'+'x'.repeat(150)+'</body></html>'));
  globalThis.workflowExecuted=false;
  h.patch.checkGeneratedHtml('<!doctype html><html><body><script>globalThis.workflowExecuted=true;</script>'+'x'.repeat(150)+'</body></html>');
  assert.equal(globalThis.workflowExecuted,false);delete globalThis.workflowExecuted;
});

test('saved and failed requests expose real phases; failed patch preserves immutable HTML and business data',async t=>{
  const h=await workflowHarness();t.after(h.close);
  const initial=await h.generate({mode:'demo',prompt:'番茄钟',requestId:crypto.randomUUID()});assert.equal(initial.status,200);
  const project=initial.data.project,base=project.versions[0];
  h.sqlite.prepare('INSERT INTO motes_app_runtime_data VALUES(?,?,?,?,?)').run(project.id,'counter','{"count":7}',1,new Date().toISOString());
  let n=0;
  t.mock.method(globalThis,'fetch',async()=>{
    n++;
    if(n%2===0){
      const checkpoint=h.sqlite.prepare("SELECT call_count,total_tokens,usage_complete FROM motes_model_usage WHERE status='running'").get();
      assert.equal(checkpoint.call_count,1);assert.equal(checkpoint.total_tokens,7);assert.equal(checkpoint.usage_complete,0);
    }
    return n%2===1?response(shortPlan):response(JSON.stringify(reactPatch('专注，从这一刻开始','更新标题')));
  });
  const id=crypto.randomUUID(),saved=await h.generate({mode:'model',prompt:'修改标题',projectId:project.id,baseVersionId:base.id,requestId:id});assert.equal(saved.status,200);
  assert.equal(saved.data.project.versions.length,2);assert.deepEqual(saved.data.project.versions[0],base);
  const receipt=await h.get(id);assert.equal(receipt.status,'done');assert.ok(receipt.progress.steps.every(s=>s.state==='completed'));
  const failedId=crypto.randomUUID(),failed=await h.generate({mode:'model',prompt:'bad stale search',projectId:project.id,requestId:failedId});assert.equal(failed.status,502);
  const failedReceipt=await h.get(failedId);assert.equal(failedReceipt.status,'failed');assert.deepEqual(failedReceipt.progress.steps.map(s=>s.state),['completed','failed','pending','pending']);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,2);
  assert.equal(h.sqlite.prepare('SELECT value_json FROM motes_app_runtime_data WHERE app_id=?').get(project.id).value_json,'{"count":7}');
  const usage=h.sqlite.prepare('SELECT * FROM motes_model_usage WHERE request_id=?').get(id);assert.equal(usage.call_count,2);assert.equal(usage.total_tokens,14);
  h.queries.length=0;await h.get(id);assert.ok(h.queries.every(q=>q.trim().startsWith('SELECT')));
});

test('old requests omit progress and expired running steps are derived as failed without writes',async t=>{
  const h=await workflowHarness();t.after(h.close);
  const id=crypto.randomUUID(),result=await h.generate({mode:'demo',prompt:'番茄钟',requestId:id});assert.equal(result.status,200);
  h.sqlite.prepare("UPDATE forma_requests SET status='running' WHERE id=?").run(id);
  const progress=JSON.parse(h.sqlite.prepare('SELECT progress_json FROM motes_generation_progress WHERE request_id=?').get(id).progress_json);
  progress.steps[1].state='running';progress.steps[2].state='pending';progress.steps[3].state='pending';
  const stored=JSON.stringify(progress);h.sqlite.prepare('UPDATE motes_generation_progress SET progress_json=? WHERE request_id=?').run(stored,id);
  h.queries.length=0;const expired=await h.get(id);assert.equal(expired.status,'expired');assert.equal(expired.progress.steps[1].state,'failed');assert.ok(h.queries.every(q=>q.trim().startsWith('SELECT')));
  assert.equal(h.sqlite.prepare('SELECT progress_json FROM motes_generation_progress WHERE request_id=?').get(id).progress_json,stored);
  h.sqlite.prepare('DELETE FROM motes_generation_progress WHERE request_id=?').run(id);
  const legacy=await h.get(id);assert.equal(legacy.status,'expired');assert.equal('progress' in legacy,false);
});

test('save failure keeps the result; retry saves the same snapshot without another model call',async t=>{
  const h=await workflowHarness();t.after(h.close);let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return response(calls===1?shortPlan:JSON.stringify(h.reactProject.parseReactProject(h.reactDemo.generateReactDemo('番茄钟').html)))});
  h.sqlite.exec("CREATE TRIGGER fail_save BEFORE INSERT ON forma_versions BEGIN SELECT RAISE(ABORT,'mock failure'); END");
  const body={mode:'model',prompt:'番茄钟',requestId:crypto.randomUUID()},failed=await h.generate(body);assert.equal(failed.status,503);
  const waiting=await h.get(body.requestId);assert.equal(waiting.status,'save_pending');assert.deepEqual(waiting.progress.steps.map(s=>s.state),['completed','completed','completed','pending']);
  h.sqlite.exec('DROP TRIGGER fail_save');const saved=await h.generate(body);assert.equal(saved.status,200);assert.equal(calls,2);
  const done=await h.get(body.requestId);assert.ok(done.progress.steps.every(s=>s.state==='completed'));
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,1);
});

test('new model apps use React source JSON; compiler failure stops check before saving with both calls accounted',async t=>{
  const h=await workflowHarness();t.after(h.close);let calls=0;
  const project=h.reactProject.parseReactProject(h.reactDemo.generateReactDemo('任务看板').html);
  project.files['src/App.jsx']="import bad from 'untrusted-package';export default ()=>null;";
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    const input=JSON.parse(options.body);calls++;
    if(calls===2){assert.match(input.instructions,/motes.react.v1/);assert.match(input.instructions,/Tailwind/);}
    return response(calls===1?shortPlan:JSON.stringify(project));
  });
  const requestId=crypto.randomUUID(),result=await h.generate({mode:'model',prompt:'任务看板',requestId});
  assert.equal(result.status,502);assert.equal(calls,2);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM forma_versions').get().n,0);
  const receipt=await h.get(requestId);assert.deepEqual(receipt.progress.steps.map(s=>s.state),['completed','completed','failed','pending']);
  const usage=h.sqlite.prepare('SELECT * FROM motes_model_usage WHERE request_id=?').get(requestId);assert.equal(usage.call_count,2);assert.equal(usage.usage_complete,1);assert.equal(usage.status,'failed');
});
