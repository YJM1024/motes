import type {GenerationProgress, GenerationStepId, GenerationStepState} from './workflow-types';

const ids:GenerationStepId[]=['plan','execute','check','save'];
export function initialProgress(requestId:string):GenerationProgress {
  return {requestId,steps:ids.map(id=>({id,state:'pending'})),updatedAt:new Date().toISOString()};
}
/** Progress contains only public phase names, never plans, prompts or HTML. */
export function parseProgress(raw:string|null|undefined,requestId:string):GenerationProgress|undefined {
  if(!raw)return;
  try {
    const value=JSON.parse(raw) as GenerationProgress;
    if(value.requestId!==requestId||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt))||!Array.isArray(value.steps)||value.steps.length!==4)return;
    if(value.steps.some((step,i)=>step.id!==ids[i]||!['pending','running','completed','failed'].includes(step.state)))return;
    return {requestId,steps:value.steps.map(({id,state})=>({id,state})),updatedAt:value.updatedAt};
  }catch{return;}
}
export function generationProgress(db:D1Database,who:string,requestId:string) {
  const progress=initialProgress(requestId);
  return {
    value:progress,
    async set(id:GenerationStepId,state:GenerationStepState) {
      progress.steps.find(step=>step.id===id)!.state=state;
      progress.updatedAt=new Date().toISOString();
      await db.prepare(`INSERT INTO motes_generation_progress(request_id,progress_json)
        SELECT ?,? WHERE EXISTS(SELECT 1 FROM forma_requests WHERE id=? AND owner=? AND status='running')
        ON CONFLICT(request_id) DO UPDATE SET progress_json=excluded.progress_json`).bind(requestId,JSON.stringify(progress),requestId,who).run();
    },
    failureStatement() {
      const running=progress.steps.find(step=>step.state==='running');
      if(!running)return null;
      running.state='failed';progress.updatedAt=new Date().toISOString();
      // Join the request failure/lease cleanup transaction. A progress-write
      // failure must never prevent the other cleanup statements from being tried.
      return db.prepare(`UPDATE motes_generation_progress SET progress_json=? WHERE request_id=?
        AND EXISTS(SELECT 1 FROM forma_requests WHERE id=? AND owner=? AND status='failed')`).bind(JSON.stringify(progress),requestId,requestId,who);
    },
  };
}
