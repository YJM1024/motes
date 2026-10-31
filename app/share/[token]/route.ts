import { readSharedVersion } from '@/lib/motes/sharing';
import { sharedPageResponse } from '@/lib/motes/shared-page';

export async function GET(request:Request,context:{params:Promise<{token:string}>}) {
  const origin=new URL(request.url).origin;
  try {return sharedPageResponse(await readSharedVersion((await context.params).token),undefined,'snapshot',origin);}
  catch {return sharedPageResponse(null,503,'snapshot',origin);}
}
