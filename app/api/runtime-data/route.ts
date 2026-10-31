import { runtimeData } from '@/lib/motes/runtime-data';

export async function POST(request: Request) { return runtimeData(request); }
