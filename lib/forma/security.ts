import { env } from 'cloudflare:workers';
export class HttpError extends Error { constructor(public status:number,message:string,public retry?:'new'){super(message)} }
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')}
export const COOKIE='forma_session';
/** Deliberately separate from every historical visitor hash. Never enumerate old owners. */
export const SHARED_OWNER='motes-public-demo-v1';
export function sharedWorkspaceOwner(){return SHARED_OWNER}
export function isSharedOwner(value:unknown):value is typeof SHARED_OWNER{return value===SHARED_OWNER}
/** Anonymous visitor identity is for spend accounting, never business ownership. */
export async function visitor(request:Request){const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token || !/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'会话已失效，请刷新页面后重试。');return digest(token)}
export function sharedWorkspaceEnabled(){return env.MOTES_WORKSPACE_VISIBILITY==='shared'}
export async function owner(request:Request){const actor=await visitor(request);return sharedWorkspaceEnabled()?sharedWorkspaceOwner():actor}
export function assertOrigin(request:Request){const origin=request.headers.get('origin');if(!origin || origin!==new URL(request.url).origin)throw new HttpError(403,'请求来源无效，请在本站操作。')}
