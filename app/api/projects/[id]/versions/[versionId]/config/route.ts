import {route} from '@/lib/forma/server';
import {getVersionConfig} from '@/lib/motes/version-config-api';
export async function GET(request:Request,{params}:{params:Promise<{id:string;versionId:string}>}){return route(async()=>{const {id,versionId}=await params;return getVersionConfig(request,id,versionId);});}
