import { route } from '@/lib/forma/server';
import { exportBackup, receiveBackup } from '@/lib/motes/backup';
export async function GET(request: Request) { return route(() => exportBackup(request)); }
export async function POST(request: Request) { return route(() => receiveBackup(request)); }
