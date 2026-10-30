import {readPublication} from '@/lib/motes/publications';
import {sharedPageResponse} from '@/lib/motes/shared-page';
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){try{return sharedPageResponse(await readPublication((await params).token),undefined,'publication');}catch{return sharedPageResponse(null,503,'publication');}}
