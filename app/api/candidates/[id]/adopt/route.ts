import { route } from '@/lib/forma/server';
import { adoptCandidate } from '@/lib/motes/candidates';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return route(()=>adoptCandidate(request,id));}
