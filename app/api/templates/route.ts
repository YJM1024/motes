import { route } from '@/lib/forma/server';
import { getTemplates, manageTemplates } from '@/lib/motes/templates';
export async function GET(request: Request) { return route(() => getTemplates(request)); }
export async function POST(request: Request) { return route(() => manageTemplates(request)); }
