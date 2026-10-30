import {route} from '@/lib/forma/server';
import {saveDiscussionResult} from '@/lib/motes/discussions';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return route(async()=>saveDiscussionResult(request,(await params).id));}
