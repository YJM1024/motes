import {route} from '@/lib/forma/server';
import {createSeedApp} from '@/lib/motes/new-apps';
export async function POST(request:Request){return route(()=>createSeedApp(request));}
