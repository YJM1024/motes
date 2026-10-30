import { database,json,payload,readProject } from '../forma/server';
import { owner,HttpError } from '../forma/security';
import { commitGenerationResult } from './results';
import { saveCandidateResult } from './candidates';
export type TaskItem={id:string;requestId:string;prompt:string;kind:'generation'|'candidate';phase:'running'|'saved'|'failed'|'save_pending'|'unresolved';createdAt:string;expiresAt?:string};
export async function listTasks(request:Request){
 const who=await owner(request),db=database(),now=new Date().toISOString();
 const rows=await db.prepare("SELECT r.id,r.status,r.created_at,r.project_id,v.prompt AS version_prompt,g.prompt AS candidate_prompt,s.kind,s.expires_at,s.committed_at,s.result_json,EXISTS(SELECT 1 FROM forma_locks l WHERE l.request_id=r.id AND l.expires_at>?) AS live FROM forma_requests r LEFT JOIN forma_versions v ON v.id=r.result_version_id LEFT JOIN motes_candidates c ON c.request_id=r.id LEFT JOIN motes_candidate_groups g ON g.id=c.group_id AND g.owner=r.owner LEFT JOIN motes_generation_results s ON s.request_id=r.id AND s.owner=r.owner WHERE r.owner=? AND r.mode IN ('demo','model') AND r.project_id NOT LIKE 'discussion:%' ORDER BY r.created_at DESC,r.id DESC LIMIT 50").bind(Date.now(),who).all<{id:string;status:string;created_at:string;project_id:string;version_prompt:string|null;candidate_prompt:string|null;kind:'generation'|'candidate'|null;expires_at:string|null;committed_at:string|null;result_json:string|null;live:number}>();
 const items:TaskItem[]=rows.results.map(row=>{let stagedPrompt='';try{stagedPrompt=JSON.parse(row.result_json??'{}').version?.prompt??'';}catch{}return {id:row.id,requestId:row.id,prompt:row.candidate_prompt??row.version_prompt??stagedPrompt,kind:row.kind??(row.project_id.startsWith('candidate:')?'candidate':'generation'),phase:row.status==='done'?'saved':row.result_json&&!row.committed_at&&row.expires_at!>now?'save_pending':row.status==='failed'?'failed':row.live?'running':'unresolved',createdAt:row.created_at,...row.expires_at?{expiresAt:row.expires_at}:{}};});
 return json({items,limit:50,retentionDays:7});
}
export async function saveTask(request:Request,requestId:string){
 const who=await owner(request),body=await payload(request),db=database();if(Object.keys(body).length||!/^[a-f0-9-]{36}$/i.test(requestId))throw new HttpError(400,'保存请求无效。');
 const stage=await db.prepare('SELECT kind FROM motes_generation_results WHERE request_id=? AND owner=?').bind(requestId,who).first<{kind:string}>();if(!stage){const receipt=await db.prepare("SELECT project_id FROM forma_requests WHERE id=? AND owner=? AND status='done'").bind(requestId,who).first<{project_id:string}>();if(receipt)return receipt.project_id.startsWith('candidate:')?json({saved:true}):json({project:await readProject(who,receipt.project_id)});throw new HttpError(404,'原暂存结果不存在或不属于当前访客。');}
 if(stage.kind==='generation'){const projectId=await commitGenerationResult(db,who,requestId);return json({project:await readProject(who,projectId)});}
 const lane=await db.prepare('SELECT c.id,c.group_id FROM motes_candidates c JOIN motes_candidate_groups g ON g.id=c.group_id WHERE c.request_id=? AND g.owner=?').bind(requestId,who).first<{id:string;group_id:string}>();if(!lane)throw new HttpError(409,'原候选已有新尝试，不能覆盖当前候选。');
 await saveCandidateResult(who,lane.group_id,lane.id,requestId);return json({saved:true,groupId:lane.group_id});
}
