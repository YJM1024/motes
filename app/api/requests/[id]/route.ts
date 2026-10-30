import {route} from '@/lib/forma/server';
import {requestStatus} from '@/lib/motes/request-status';

export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return route(()=>context.params.then(({id})=>requestStatus(request,id)));
}
