import { route } from '@/lib/forma/server';
import { getCandidates } from '@/lib/motes/candidates';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return route(()=>getCandidates(request,id));}
