import {route} from '@/lib/forma/server';
import {getAppTemplates,manageAppTemplates} from '@/lib/motes/app-templates';
export async function GET(request:Request){return route(()=>getAppTemplates(request));}
export async function POST(request:Request){return route(()=>manageAppTemplates(request));}
