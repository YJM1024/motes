import { database, json, payload } from '../forma/server';
import { assertOrigin, HttpError, owner } from '../forma/security';
import type { ShareLink, SharedVersion } from './share-types';

export const SHARE_LIMITS = {activePerApp: 20, totalPerOwner: 200};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new HttpError(400, '分享编号无效。');
  return value;
}
type ShareRow = {id:string;app_id:string;version_id:string;number:number;title:string;token:string;created_at:string;revoked_at:string|null};
function link(row:ShareRow):ShareLink {
  return {id:row.id,versionId:row.version_id,versionNumber:row.number,title:row.title,createdAt:row.created_at,revokedAt:row.revoked_at,path:`/share/${row.token}`};
}
async function requireApp(who:string,id:string) {
  if (!await database().prepare('SELECT id FROM forma_projects WHERE id=? AND owner=?').bind(identifier(id),who).first()) throw new HttpError(404,'应用不存在或不属于当前访客。');
}
const select = 'SELECT s.*,v.number FROM motes_shares s JOIN forma_versions v ON v.id=s.version_id AND v.project_id=s.app_id';

export async function listShares(request:Request,appId:string) {
  const who=await owner(request);await requireApp(who,appId);
  const {results}=await database().prepare(`${select} JOIN forma_projects p ON p.id=s.app_id WHERE s.app_id=? AND p.owner=? ORDER BY s.created_at DESC,s.id LIMIT ?`).bind(appId,who,SHARE_LIMITS.totalPerOwner).all<ShareRow>();
  return json({shares:results.map(link),limits:SHARE_LIMITS});
}

export async function createShare(request:Request,appId:string) {
  const who=await owner(request),body=await payload(request),db=database();
  identifier(appId);const versionId=identifier(body.versionId);
  if(Object.keys(body).some(k=>!['versionId','requestId'].includes(k))||typeof body.requestId!=='string'||!uuid.test(body.requestId))throw new HttpError(400,'分享请求格式无效。');
  const requestId=body.requestId;
  const reconcile=async()=>{
    const row=await db.prepare(`${select} JOIN forma_projects p ON p.id=s.app_id WHERE s.request_id=?`).bind(requestId).first<ShareRow&{owner?:string}>();
    if(!row)return null;
    // Do not expose another visitor's link or resurrect a revoked request.
    const owned=await db.prepare('SELECT id FROM forma_projects WHERE id=? AND owner=?').bind(row.app_id,who).first();
    if(!owned||row.app_id!==appId||row.version_id!==versionId)throw new HttpError(409,'该请求编号已被使用。');
    return json({share:link(row)},200);
  };
  const prior=await reconcile();if(prior)return prior;
  const sourceQuery='SELECT p.title FROM forma_projects p JOIN forma_versions v ON v.project_id=p.id WHERE p.id=? AND p.owner=? AND v.id=? AND length(v.html)<=180000';
  const source=await db.prepare(sourceQuery).bind(appId,who,versionId).first<{title:string}>();
  if(!source)throw new HttpError(404,'应用或版本不可用于分享。');
  const id=crypto.randomUUID(),token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),now=new Date().toISOString();
  let result:D1Result;
  try {
    // A single atomic conditional INSERT fences ownership, version and counts.
    // Concurrent retries are serialized by the unique request index.
    result=await db.prepare(`INSERT INTO motes_shares(id,app_id,version_id,title,token,request_id,created_at)
      SELECT ?,p.id,v.id,substr(p.title,1,80),?,?,? FROM forma_projects p JOIN forma_versions v ON v.project_id=p.id
      WHERE p.id=? AND p.owner=? AND v.id=? AND length(v.html)<=180000
      AND (SELECT count(*) FROM motes_shares WHERE app_id=p.id AND revoked_at IS NULL)<?
      AND (SELECT count(*) FROM motes_shares s JOIN forma_projects own ON own.id=s.app_id WHERE own.owner=?)<?`).bind(id,token,requestId,now,appId,who,versionId,SHARE_LIMITS.activePerApp,who,SHARE_LIMITS.totalPerOwner).run();
  } catch(error) {const retry=await reconcile();if(retry)return retry;throw error;}
  if(!result.meta.changes){const retry=await reconcile();if(retry)return retry;if(!await db.prepare(sourceQuery).bind(appId,who,versionId).first())throw new HttpError(404,'应用或版本不可用于分享。');throw new HttpError(429,'分享链接已达到数量上限：每个应用最多 20 个有效链接，每位访客最多累计创建 200 个链接（含已撤销）。');}
  const row=await db.prepare(`${select} JOIN forma_projects p ON p.id=s.app_id WHERE s.id=? AND p.owner=?`).bind(id,who).first<ShareRow>();
  if(!row)throw new HttpError(503,'分享结果暂时无法读取，请重试核对同一请求。');
  return json({share:link(row)},201);
}

export async function revokeShare(request:Request,appId:string,shareId:string) {
  assertOrigin(request);const who=await owner(request);identifier(appId);identifier(shareId);
  const result=await database().prepare(`UPDATE motes_shares SET revoked_at=coalesce(revoked_at,?) WHERE id=? AND app_id=? AND EXISTS(SELECT 1 FROM forma_projects WHERE id=motes_shares.app_id AND owner=?)`).bind(new Date().toISOString(),shareId,appId,who).run();
  if(!result.meta.changes)throw new HttpError(404,'分享不存在或不属于当前访客。');
  return json({revoked:true});
}

export async function readSharedVersion(token:string):Promise<SharedVersion|null> {
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const row=await database().prepare(`SELECT s.app_id,s.version_id,s.title,v.number,v.html FROM motes_shares s JOIN forma_versions v ON v.id=s.version_id AND v.project_id=s.app_id WHERE s.token=? AND s.revoked_at IS NULL AND length(v.html)<=180000`).bind(token).first<{app_id:string;version_id:string;title:string;number:number;html:string}>();
  return row?{appId:row.app_id,versionId:row.version_id,title:row.title,versionNumber:row.number,html:row.html}:null;
}

export async function getSharedVersion(token:string) {
  const share=await readSharedVersion(token);
  const publicValue=share?{title:share.title,versionNumber:share.versionNumber,html:share.html}:null;
  return json(publicValue??{error:'分享不可用，链接可能已撤销或不存在。'},publicValue?200:404,{'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff'});
}
