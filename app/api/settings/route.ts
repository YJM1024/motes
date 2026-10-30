import { database, json, modelName, modelNames, owner, payload, route } from '@/lib/forma/server';
import { initializeWorkspace } from '@/lib/motes/management';
import { readSettings, saveSettings } from '@/lib/motes/settings';
import { HttpError } from '@/lib/forma/security';
export async function GET(request: Request) { return route(async () => {
  const who = await owner(request); await initializeWorkspace(who);
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (!['projectId', 'appId'].includes(key)) throw new HttpError(400, '设置查询参数无效。');
  return json(await readSettings(database(), who, modelName(), { ...(params.has('projectId') ? { projectId: params.get('projectId')! } : {}), ...(params.has('appId') ? { appId: params.get('appId')! } : {}) }, modelNames()));
}); }
export async function POST(request: Request) { return route(async () => {
  const who = await owner(request), body = await payload(request); await initializeWorkspace(who);
  return json(await saveSettings(database(), who, modelName(), body, modelNames()));
}); }
