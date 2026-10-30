import { route } from '@/lib/forma/server';
import { forkVersion } from '@/lib/motes/version-tools';

export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
  return route(() => context.params.then(({id}) => forkVersion(request,id)));
}
