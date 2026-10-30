import { route } from '@/lib/forma/server';
import { createCandidates, getCandidates } from '@/lib/motes/candidates';
export async function GET(request:Request){return route(()=>getCandidates(request));}
export async function POST(request:Request){return route(()=>createCandidates(request));}
