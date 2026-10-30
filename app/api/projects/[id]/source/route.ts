import { route } from '@/lib/forma/server';
import { saveSource } from '@/lib/motes/source-editor';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return route(async () => saveSource(request, (await context.params).id)); }
