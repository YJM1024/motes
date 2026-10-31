export const RUNTIME_DATA_PROTOCOL = 'motes.runtime-data.v1';
export type RuntimeDataRequest = { requestId: string; action: 'get'; key: string; sequence: number } | { requestId: string; action: 'set'; key: string; value: unknown; expectedRevision: number; sequence: number };
const keyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

export function validRuntimeJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return new TextEncoder().encode(value).byteLength <= 12 * 1024;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => validRuntimeJson(item, depth + 1));
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 100 && entries.every(([name, item]) => name.length <= 64 && !forbidden.has(name) && validRuntimeJson(item, depth + 1));
}

/** Validates the opaque-frame event envelope before the parent reads any payload. */
export function runtimeDataRequestFromEvent(event: { source: unknown; origin: string; data: unknown }, expectedSource: unknown, channel: string, lastSequence = 0): RuntimeDataRequest | null {
  if (!expectedSource || event.source !== expectedSource || event.origin !== 'null' || !/^[a-f0-9]{32}$/.test(channel)) return null;
  const value = event.data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.protocol !== RUNTIME_DATA_PROTOCOL || data.channel !== channel || data.kind !== 'request' || typeof data.requestId !== 'string') return null;
  const match = new RegExp(`^${channel}:([1-9][0-9]{0,8})$`).exec(data.requestId);
  if (!match) return null;
  const sequence = Number(match[1]);
  if (!Number.isSafeInteger(sequence) || sequence <= lastSequence) return null;
  const base = ['protocol', 'channel', 'kind', 'requestId', 'action', 'key'];
  if (typeof data.key !== 'string' || !keyPattern.test(data.key)) return null;
  if (data.action === 'get' && Object.keys(data).length === base.length && Object.keys(data).every(key => base.includes(key))) {
    return { requestId: data.requestId, action: 'get', key: data.key, sequence };
  }
  const setKeys = [...base, 'value', 'expectedRevision'];
  if (data.action === 'set' && Object.keys(data).length === setKeys.length && Object.keys(data).every(key => setKeys.includes(key)) && Number.isSafeInteger(data.expectedRevision) && Number(data.expectedRevision) >= 0 && validRuntimeJson(data.value)) {
    const bytes = new TextEncoder().encode(JSON.stringify(data.value)).byteLength;
    if (bytes <= 12 * 1024) return { requestId: data.requestId, action: 'set', key: data.key, value: data.value, expectedRevision: Number(data.expectedRevision), sequence };
  }
  return null;
}

export function validRuntimeHello(event: { source: unknown; origin: string; data: unknown }, expectedSource: unknown, channel: string): boolean {
  if (!expectedSource || event.source !== expectedSource || event.origin !== 'null') return false;
  const value = event.data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const data = value as Record<string, unknown>;
  return keys.length === 3 && ['protocol', 'channel', 'kind'].every(key => keys.includes(key)) && data.protocol === RUNTIME_DATA_PROTOCOL && data.channel === channel && data.kind === 'hello' && /^[a-f0-9]{32}$/.test(channel);
}
