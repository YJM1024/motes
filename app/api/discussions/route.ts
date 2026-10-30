import { route } from '@/lib/forma/server';
import { getDiscussions, sendDiscussion } from '@/lib/motes/discussions';
export async function GET(request: Request) { return route(() => getDiscussions(request)); }
export async function POST(request: Request) { return route(() => sendDiscussion(request)); }
