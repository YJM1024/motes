import { route } from '@/lib/forma/server';
import { getSharedVersion } from '@/lib/motes/sharing';

export async function GET(_request:Request,context:{params:Promise<{token:string}>}) {
  return route(()=>context.params.then(({token})=>getSharedVersion(token)));
}
