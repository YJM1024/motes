import { readSharedVersion } from '@/lib/motes/sharing';
import { sharedPageResponse } from '@/lib/motes/shared-page';

export async function GET(_request:Request,context:{params:Promise<{token:string}>}) {
  try {return sharedPageResponse(await readSharedVersion((await context.params).token));}
  catch {return sharedPageResponse(null,503);}
}
