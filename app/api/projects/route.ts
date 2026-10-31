import {json,listProjects,owner,route} from '@/lib/forma/server';
export async function GET(request:Request){return route(async()=>json({projects:await listProjects(await owner(request),'active')}))}
