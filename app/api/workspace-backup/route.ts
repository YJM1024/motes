import {route} from '@/lib/forma/server';
import {exportWorkspaceBackup,receiveWorkspaceBackup} from '@/lib/motes/workspace-backup';
export async function GET(request:Request){return route(()=>exportWorkspaceBackup(request));}
export async function POST(request:Request){return route(()=>receiveWorkspaceBackup(request));}
