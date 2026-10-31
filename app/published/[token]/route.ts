import {readPublishedVersion} from '@/lib/motes/publications';
import {sharedPageResponse} from '@/lib/motes/shared-page';
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){const origin=new URL(request.url).origin;try{return sharedPageResponse(await readPublishedVersion((await params).token),undefined,'publication',origin);}catch{return sharedPageResponse(null,503,'publication',origin);}}
