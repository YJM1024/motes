import {route} from '@/lib/forma/server';
import {getPublication,managePublication} from '@/lib/motes/publications';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return route(async()=>getPublication(request,(await params).id));}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return route(async()=>managePublication(request,(await params).id));}
