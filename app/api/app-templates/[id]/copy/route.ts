import {route} from '@/lib/forma/server';
import {copyAppTemplate} from '@/lib/motes/app-templates';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return route(async()=>copyAppTemplate(request,(await params).id));}
