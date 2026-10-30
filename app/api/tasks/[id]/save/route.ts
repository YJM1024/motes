import { route } from '@/lib/forma/server';
import { saveTask } from '@/lib/motes/tasks';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return route(()=>saveTask(request,id));}
