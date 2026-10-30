import {restore,route} from '@/lib/forma/server';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return route(async()=>restore(request,(await context.params).id))}
