import {route} from '@/lib/forma/server';
import {getPublishedVersion} from '@/lib/motes/publications';
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){return route(async()=>getPublishedVersion((await params).token));}
