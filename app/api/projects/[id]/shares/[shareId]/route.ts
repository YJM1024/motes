import { route } from '@/lib/forma/server';
import { revokeShare } from '@/lib/motes/sharing';

export async function DELETE(request:Request,context:{params:Promise<{id:string;shareId:string}>}) {
  return route(()=>context.params.then(({id,shareId})=>revokeShare(request,id,shareId)));
}
