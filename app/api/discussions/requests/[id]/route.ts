import { route } from '@/lib/forma/server';
import { discussionRequestStatus } from '@/lib/motes/discussions';
export async function GET(request: Request, context: {params:Promise<{id:string}>}) { return route(async () => discussionRequestStatus(request,(await context.params).id)); }
