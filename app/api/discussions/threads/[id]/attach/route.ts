import { route } from '@/lib/forma/server';
import { attachDiscussion } from '@/lib/motes/discussions';
export async function POST(request: Request, context: {params:Promise<{id:string}>}) { return route(async () => attachDiscussion(request,(await context.params).id)); }
