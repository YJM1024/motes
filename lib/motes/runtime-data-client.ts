/** SDK injected into the opaque iframe. All persistence is proxied through its trusted parent. */
export function runtimeDataClientScript(channel: string, targetOrigin: string): string {
  if (!/^[a-f0-9]{32}$/.test(channel)) throw new Error('运行数据通道无效。');
  const origin = new URL(targetOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== targetOrigin) throw new Error('运行数据父窗口来源无效。');
  return `(() => {
    "use strict";
    const protocol = "motes.runtime-data.v1", channel = ${JSON.stringify(channel)}, targetOrigin = ${JSON.stringify(targetOrigin)};
    const pending = new Map(); let sequence = 0, resolveReady;
    class MotesDataError extends Error { constructor(code, message, revision) { super(message); this.name = 'MotesDataError'; this.code = code; if (Number.isSafeInteger(revision)) this.revision = revision; } }
    const ready = new Promise(resolve => { resolveReady = resolve; });
    function failReady(message) { resolveReady({available:false,error:message}); }
    function keys(object, expected) { return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === expected.length && Object.keys(object).every(key => expected.includes(key)); }
    function onMessage(event) {
      if (event.source !== window.parent || event.origin !== targetOrigin) return;
      const value = event.data;
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.protocol !== protocol || value.channel !== channel) return;
      if (value.kind === 'ready' && (keys(value, ['protocol','channel','kind','ok']) || keys(value, ['protocol','channel','kind','ok','error']))) {
        resolveReady(value.ok === true ? {available:true} : {available:false,error:typeof value.error === 'string' ? value.error : '当前预览没有连接共享数据。'});
        return;
      }
      if (value.kind !== 'result' || typeof value.requestId !== 'string') return;
      const item = pending.get(value.requestId);
      if (!item || (!keys(value, ['protocol','channel','kind','requestId','ok','result']) && !keys(value, ['protocol','channel','kind','requestId','ok','error']))) return;
      clearTimeout(item.timer); pending.delete(value.requestId);
      if (value.ok === true) item.resolve(value.result);
      else { const error = value.error && typeof value.error === 'object' ? value.error : {}; item.reject(new MotesDataError(typeof error.code === 'string' ? error.code : 'unavailable', typeof error.message === 'string' ? error.message : '共享数据暂时无法保存。', error.revision)); }
    }
    window.addEventListener('message', onMessage);
    function safeJson(value, depth = 0) {
      if (depth > 8) return false;
      if (value === null || typeof value === 'boolean') return true;
      if (typeof value === 'string') return new TextEncoder().encode(value).byteLength <= 12288;
      if (typeof value === 'number') return Number.isFinite(value);
      if (Array.isArray(value)) return value.length <= 100 && value.every(item => safeJson(item, depth + 1));
      if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
      const entries = Object.entries(value);
      return entries.length <= 100 && entries.every(([key, item]) => key.length <= 64 && !['__proto__','prototype','constructor'].includes(key) && safeJson(item, depth + 1));
    }
    function checkKey(key) { if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(key)) throw new MotesDataError('invalid_key','数据键无效。'); }
    async function request(action, key, value, expectedRevision) {
      const status = await ready;
      if (!status.available) throw new MotesDataError('unavailable', status.error || '当前预览没有连接共享数据。');
      if (pending.size >= 8) throw new MotesDataError('busy','当前有太多数据操作正在等待，请稍后重试。');
      checkKey(key);
      if (action === 'set') {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !safeJson(value)) throw new MotesDataError('invalid_value','数据值或版本无效。');
        if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 12288) throw new MotesDataError('too_large','单个数据值不能超过12KiB。');
      }
      const requestId = channel + ':' + (++sequence);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new MotesDataError('timeout','共享数据等待超时，请稍后重试。')); }, 15000);
        pending.set(requestId,{resolve,reject,timer});
        const message = {protocol,channel,kind:'request',requestId,action,key};
        if (action === 'set') { message.value=value; message.expectedRevision=expectedRevision; }
        try { window.parent.postMessage(message,targetOrigin); }
        catch { clearTimeout(timer); pending.delete(requestId); reject(new MotesDataError('unavailable','无法联系工作台共享数据服务。')); }
      });
    }
    const data = Object.freeze({
      ready,
      Error: MotesDataError,
      get(key) { return request('get',key); },
      set(key,value,expectedRevision) { return request('set',key,value,expectedRevision); }
    });
    const api = window.motes && typeof window.motes === 'object' ? window.motes : {};
    api.data = data; window.motes = api;
    try { window.parent.postMessage({protocol,channel,kind:'hello'},targetOrigin); }
    catch { failReady('无法联系工作台共享数据服务。'); }
    setTimeout(() => failReady('共享数据服务没有响应。'),10000);
  })();`;
}
