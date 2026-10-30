import {route} from '@/lib/forma/server';
import {getAppTemplates} from '@/lib/motes/app-templates';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return route(async()=>getAppTemplates(request,(await params).id));}
