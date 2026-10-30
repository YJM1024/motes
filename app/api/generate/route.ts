import {generate,route} from '@/lib/forma/server';
export async function POST(request:Request){return route(()=>generate(request))}
