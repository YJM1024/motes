import { route } from '@/lib/forma/server';
import { updateVersionMetadata } from '@/lib/motes/source-editor';
export async function POST(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) { return route(async () => { const p = await context.params; return updateVersionMetadata(request, p.id, p.versionId); }); }
