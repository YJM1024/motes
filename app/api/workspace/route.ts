import { getWorkspace, manageWorkspace } from '@/lib/motes/management';
import { route } from '@/lib/forma/server';
export async function GET(request: Request) { return route(() => getWorkspace(request)); }
export async function POST(request: Request) { return route(() => manageWorkspace(request)); }
