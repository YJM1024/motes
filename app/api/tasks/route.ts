import { route } from '@/lib/forma/server';
import { listTasks } from '@/lib/motes/tasks';
export async function GET(request:Request){return route(()=>listTasks(request));}
