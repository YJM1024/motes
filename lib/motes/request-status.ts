import {database, json} from '../forma/server';
import {owner} from '../forma/security';
import type {RequestStatus, SavedRequestResult} from './request-types';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Status reads never renew a lease, launch work or change a request row. */
export async function requestStatus(request:Request,id:string) {
  const who=await owner(request),db=database();
  const missing=()=>json({status:'not-found',...(uuid.test(id)?{requestId:id}:{})},404);
  if(!uuid.test(id))return missing();
  const row=await db.prepare(`SELECT r.status,r.project_id,r.result_version_id,l.expires_at
    FROM forma_requests r LEFT JOIN forma_locks l ON l.project_id=r.project_id AND l.request_id=r.id AND l.expires_at>?
    WHERE r.id=? AND r.owner=? AND r.mode IN ('demo','model') AND r.project_id NOT LIKE 'discussion:%' AND r.project_id NOT LIKE 'candidate:%'`).bind(Date.now(),id,who).first<{status:string;project_id:string;result_version_id:string|null;expires_at:number|null}>();
  if(!row)return missing();
  let state:RequestStatus;
  if(row.status==='done'){
    // Read only this request's committed immutable version. Never include the
    // fingerprint, prompt, profile, other versions or model configuration.
    const saved=await db.prepare(`SELECT p.id AS projectId,p.title,v.id AS versionId,v.number,v.html,v.created_at AS createdAt
      FROM forma_projects p JOIN forma_versions v ON v.project_id=p.id WHERE p.id=? AND p.owner=? AND v.id=?`).bind(row.project_id,who,row.result_version_id).first<SavedRequestResult>();
    if(!saved)return missing();
    state={requestId:id,status:'done',projectId:saved.projectId,resultVersionId:saved.versionId,result:saved};
  }else if(row.status==='failed')state={requestId:id,status:'failed',retry:'new'};
  else if(row.status==='running')state=row.expires_at?{requestId:id,status:'running',leaseExpiresAt:row.expires_at}:{requestId:id,status:'expired',retry:'new'};
  else return missing();
  return json(state);
}
