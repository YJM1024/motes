import { route } from '@/lib/forma/server';
import { createDiscussionThread } from '@/lib/motes/discussions';
export async function POST(request: Request) { return route(() => createDiscussionThread(request)); }
