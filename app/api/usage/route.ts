import { database, json, owner, route } from '@/lib/forma/server';
import { readUsage } from '@/lib/motes/usage';
export async function GET(request: Request) { return route(async () => json(await readUsage(database(), await owner(request)))); }
