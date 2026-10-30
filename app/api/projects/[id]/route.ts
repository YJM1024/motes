import {json,readProject,owner,route} from '@/lib/forma/server';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return route(async()=>json({project:await readProject(await owner(request),(await context.params).id)}))}
