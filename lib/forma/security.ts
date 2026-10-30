export class HttpError extends Error { constructor(public status:number,message:string,public retry?:'new'){super(message)} }
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')}
export const COOKIE='forma_session';
export async function owner(request:Request){const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token || !/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'会话已失效，请刷新页面后重试。');return digest(token)}
export function assertOrigin(request:Request){const origin=request.headers.get('origin');if(!origin || origin!==new URL(request.url).origin)throw new HttpError(403,'请求来源无效，请在本站操作。')}
