import { route } from '@/lib/forma/server';
import { createShare, listShares } from '@/lib/motes/sharing';

export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  return route(()=>context.params.then(({id})=>listShares(request,id)));
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  return route(()=>context.params.then(({id})=>createShare(request,id)));
}
