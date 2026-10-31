import { assertOrigin, HttpError, isSharedOwner, sharedWorkspaceEnabled, sharedWorkspaceOwner } from '../forma/security';
import { database, json, owner, route } from '../forma/server';

export const RUNTIME_DATA_LIMITS = { bodyBytes: 16 * 1024, valueBytes: 12 * 1024, keysPerApp: 64, bytesPerApp: 256 * 1024 } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dataKey = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
const allowedVersionSql = `p.id=? AND p.owner=? AND (
  (p.current_version_id=? AND EXISTS(SELECT 1 FROM forma_versions v WHERE v.id=? AND v.project_id=p.id)) OR
  EXISTS(SELECT 1 FROM motes_publications pub JOIN forma_versions v ON v.id=pub.version_id AND v.project_id=pub.app_id WHERE pub.app_id=p.id AND pub.version_id=? AND pub.enabled=1) OR
  EXISTS(SELECT 1 FROM motes_shares s JOIN forma_versions v ON v.id=s.version_id AND v.project_id=s.app_id WHERE s.app_id=p.id AND s.version_id=? AND s.revoked_at IS NULL)
)`;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type RuntimeBody = { action: 'get'; appId: string; versionId: string; key: string } | { action: 'set'; appId: string; versionId: string; key: string; value: JsonValue; expectedRevision: number };
type RuntimeRow = { value_json: string; revision: number; updated_at: string };

function invalid(message = '运行数据请求格式无效。'): never { throw new HttpError(400, message); }

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > RUNTIME_DATA_LIMITS.bodyBytes) throw new HttpError(413, '运行数据请求超过大小限制。');
  const reader = request.body?.getReader();
  if (!reader) return invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RUNTIME_DATA_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new HttpError(413, '运行数据请求超过大小限制。');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return invalid(); }
  let value: unknown;
  try { value = JSON.parse(source); } catch { return invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function jsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return new TextEncoder().encode(value).byteLength <= RUNTIME_DATA_LIMITS.valueBytes;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => jsonValue(item, depth + 1));
  if (typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 100 && entries.every(([key, item]) => key.length <= 64 && !dangerousKeys.has(key) && jsonValue(item, depth + 1));
}

function parseBody(body: Record<string, unknown>): RuntimeBody {
  const action = body.action;
  const exact = (expected: string[]) => {
    if (Object.keys(body).length !== expected.length || Object.keys(body).some(key => !expected.includes(key))) return invalid();
  };
  if (action !== 'get' && action !== 'set') return invalid();
  exact(action === 'get' ? ['action', 'appId', 'versionId', 'key'] : ['action', 'appId', 'versionId', 'key', 'value', 'expectedRevision']);
  if (typeof body.appId !== 'string' || !uuid.test(body.appId) || typeof body.versionId !== 'string' || !uuid.test(body.versionId)) return invalid();
  if (typeof body.key !== 'string' || !dataKey.test(body.key)) return invalid('运行数据键无效，请使用不超过64位的英文字母、数字、点、短横线或下划线。');
  if (action === 'get') return { action, appId: body.appId, versionId: body.versionId, key: body.key };
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) > 2147483646) return invalid('运行数据版本无效，请重新读取后再保存。');
  if (!jsonValue(body.value)) return invalid('运行数据只接受有限大小的 JSON 值。');
  const serialized = JSON.stringify(body.value);
  if (new TextEncoder().encode(serialized).byteLength > RUNTIME_DATA_LIMITS.valueBytes) throw new HttpError(413, '单个运行数据值超过12KiB限制。');
  return { action, appId: body.appId, versionId: body.versionId, key: body.key, value: body.value, expectedRevision: Number(body.expectedRevision) };
}

function versionBindings(appId: string, versionId: string) {
  return [appId, sharedWorkspaceOwner(), versionId, versionId, versionId, versionId];
}

async function requireSharedVersion(appId: string, versionId: string) {
  const row = await database().prepare(`SELECT p.owner FROM forma_projects p WHERE ${allowedVersionSql}`).bind(...versionBindings(appId, versionId)).first<{ owner: string }>();
  if (!row || !isSharedOwner(row.owner)) throw new HttpError(404, '此应用版本没有可用的共享运行数据。');
}

function sharedVersionFence(alias = 'p') {
  return `EXISTS(SELECT 1 FROM forma_projects ${alias} WHERE ${allowedVersionSql.replaceAll('p.', `${alias}.`)})`;
}

function conflict(revision: number) {
  return json({ error: '运行数据已被其他访问者更新，请重新读取后再保存。', code: 'conflict', revision }, 409);
}

async function getData(appId: string, versionId: string, key: string) {
  const row = await database().prepare(`SELECT d.value_json,d.revision,d.updated_at FROM motes_app_runtime_data d WHERE d.app_id=? AND d.data_key=? AND ${sharedVersionFence()}`).bind(appId, key, ...versionBindings(appId, versionId)).first<RuntimeRow>();
  if (!row) { await requireSharedVersion(appId, versionId); return json({ key, value: null, revision: 0, updatedAt: null }); }
  let value: unknown;
  try { value = JSON.parse(row.value_json); } catch { throw new HttpError(500, '共享运行数据暂时无法读取。'); }
  return json({ key, value, revision: row.revision, updatedAt: row.updated_at });
}

async function setData(body: Extract<RuntimeBody, { action: 'set' }>) {
  const db = database();
  await requireSharedVersion(body.appId, body.versionId);
  const valueJson = JSON.stringify(body.value);
  const now = new Date().toISOString();
  let result: { meta: { changes: number }; results?: { revision: number }[] };
  if (body.expectedRevision === 0) {
    result = await db.prepare(`INSERT INTO motes_app_runtime_data(app_id,data_key,value_json,revision,updated_at)
      SELECT ?,?,?,1,? WHERE
        (SELECT count(*) FROM motes_app_runtime_data WHERE app_id=?) < ? AND
        (SELECT coalesce(sum(length(CAST(value_json AS BLOB))),0)+length(CAST(? AS BLOB)) FROM motes_app_runtime_data WHERE app_id=?) <= ? AND
        ${sharedVersionFence()}
      ON CONFLICT(app_id,data_key) DO NOTHING RETURNING revision`).bind(body.appId,body.key,valueJson,now,body.appId,RUNTIME_DATA_LIMITS.keysPerApp,valueJson,body.appId,RUNTIME_DATA_LIMITS.bytesPerApp,...versionBindings(body.appId,body.versionId)).run<{revision:number}>();
  } else {
    result = await db.prepare(`UPDATE motes_app_runtime_data AS d SET value_json=?,revision=d.revision+1,updated_at=?
      WHERE d.app_id=? AND d.data_key=? AND d.revision=? AND ${sharedVersionFence()}
        AND (SELECT coalesce(sum(length(CAST(value_json AS BLOB))),0)-length(CAST(d.value_json AS BLOB))+length(CAST(? AS BLOB)) FROM motes_app_runtime_data WHERE app_id=d.app_id) <= ?
      RETURNING revision`).bind(valueJson,now,body.appId,body.key,body.expectedRevision,...versionBindings(body.appId,body.versionId),valueJson,RUNTIME_DATA_LIMITS.bytesPerApp).run<{revision:number}>();
  }
  const row = result.results?.[0];
  if (result.meta.changes && row) return json({ key: body.key, revision: row.revision, updatedAt: now });
  await requireSharedVersion(body.appId, body.versionId);
  const current = await db.prepare('SELECT revision,length(CAST(value_json AS BLOB)) AS bytes FROM motes_app_runtime_data WHERE app_id=? AND data_key=?').bind(body.appId,body.key).first<{revision:number;bytes:number}>();
  const count = await db.prepare('SELECT count(*) AS count,coalesce(sum(length(CAST(value_json AS BLOB))),0) AS bytes FROM motes_app_runtime_data WHERE app_id=?').bind(body.appId).first<{count:number;bytes:number}>();
  if (current && (body.expectedRevision === 0 || current.revision !== body.expectedRevision)) return conflict(current.revision);
  if (!current && body.expectedRevision > 0) return conflict(0);
  const nextBytes = (count?.bytes ?? 0) - (current?.bytes ?? 0) + new TextEncoder().encode(valueJson).byteLength;
  if ((!current && (count?.count ?? 0) >= RUNTIME_DATA_LIMITS.keysPerApp) || nextBytes > RUNTIME_DATA_LIMITS.bytesPerApp) {
    return json({ error: '此应用的共享运行数据已达到容量限制。', code: 'capacity' }, 413);
  }
  if (!await database().prepare(`SELECT p.id FROM forma_projects p WHERE ${allowedVersionSql}`).bind(...versionBindings(body.appId,body.versionId)).first()) throw new HttpError(404, '此应用版本没有可用的共享运行数据。');
  if (current) return conflict(current.revision);
  throw new HttpError(404, '此应用版本没有可用的共享运行数据。');
}

export async function runtimeData(request: Request) {
  return route(async () => {
    assertOrigin(request);
    const who = await owner(request);
    if (!sharedWorkspaceEnabled() || !isSharedOwner(who)) throw new HttpError(404, '共享运行数据当前不可用。');
    const body = parseBody(await readBody(request));
    if (body.action === 'get') return getData(body.appId, body.versionId, body.key);
    return setData(body);
  });
}
