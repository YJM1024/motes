export class LiteApiError extends Error {
  constructor(message: string, public status: number, public retry?: 'new') { super(message); }
}
export async function liteApi<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(225000)]) : AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({ error: '服务未返回有效结果，请先核对原请求。' })) as { error?: string; retry?: 'new' };
  if (!response.ok) throw new LiteApiError(data.error || '暂时无法完成操作。', response.status, data.retry);
  return data as T;
}

