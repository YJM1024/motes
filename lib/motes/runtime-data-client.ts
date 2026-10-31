/** SDK injected into the opaque iframe. All persistence is proxied through its trusted parent. */
export function runtimeDataClientScript(channel: string, targetOrigin?: string): string {
  if (!/^[a-f0-9]{32}$/.test(channel)) throw new Error('运行数据通道无效。');
  if (targetOrigin) { const origin = new URL(targetOrigin); if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== targetOrigin) throw new Error('运行数据父窗口来源无效。'); }
  const targetOriginValue = targetOrigin ? JSON.stringify(targetOrigin) : 'location.origin';
  return `(() => {
    "use strict";
    const protocol = "motes.runtime-data.v1", channel = ${JSON.stringify(channel)}, targetOrigin = ${targetOriginValue};
    const pending = new Map(); let sequence = 0, resolveReady, helloTimer = 0;
    class MotesDataError extends Error { constructor(code, message, revision) { super(message); this.name = 'MotesDataError'; this.code = code; if (Number.isSafeInteger(revision)) this.revision = revision; } }
    const ready = new Promise(resolve => { resolveReady = resolve; });
    function finishReady(status) { if (helloTimer) clearInterval(helloTimer); helloTimer = 0; resolveReady(status); }
    function failReady(message) { finishReady({available:false,error:message}); }
    function keys(object, expected) { return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === expected.length && Object.keys(object).every(key => expected.includes(key)); }
    function onMessage(event) {
      if (event.source !== window.parent || event.origin !== targetOrigin) return;
      const value = event.data;
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.protocol !== protocol || value.channel !== channel) return;
      if (value.kind === 'ready' && (keys(value, ['protocol','channel','kind','ok']) || keys(value, ['protocol','channel','kind','ok','error']))) {
        finishReady(value.ok === true ? {available:true} : {available:false,error:typeof value.error === 'string' ? value.error : '当前预览没有连接共享数据。'});
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
    const hello = () => { try { window.parent.postMessage({protocol,channel,kind:'hello'},targetOrigin); } catch { failReady('无法联系工作台共享数据服务。'); } };
    helloTimer = setInterval(hello, 500); hello();
    setTimeout(() => failReady('共享数据服务没有响应。'),10000);
  })();`;
}

/** Self-contained host-side proxy for the static public/share page bootstrap. */
export function runtimeDataHostScript(channel: string, targetOrigin: string, appId: string, versionId: string): string {
  if (!/^[a-f0-9]{32}$/.test(channel) || new URL(targetOrigin).origin !== targetOrigin) throw new Error('运行数据桥接参数无效。');
  return `(() => {
    "use strict";
    const protocol=${JSON.stringify('motes.runtime-data.v1')},channel=${JSON.stringify(channel)},targetOrigin=${JSON.stringify(targetOrigin)},appId=${JSON.stringify(appId)},versionId=${JSON.stringify(versionId)};
    const frame=document.getElementById('shared-frame'),source=frame&&frame.contentWindow;
    if(!frame||!source)return;
    let active=true,ready=false,sessionPromise=null,lastSequence=0,writes=0,writeWindow=Date.now();const inflight=new Map();
    const reply=data=>{if(active)source.postMessage({protocol,channel,...data},'*')};
    const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
    const safeJson=(value,depth=0)=>{if(depth>8)return false;if(value===null||typeof value==='boolean')return true;if(typeof value==='string')return new TextEncoder().encode(value).byteLength<=12288;if(typeof value==='number')return Number.isFinite(value);if(Array.isArray(value))return value.length<=100&&value.every(item=>safeJson(item,depth+1));if(!value||typeof value!=='object'||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))return false;const entries=Object.entries(value);return entries.length<=100&&entries.every(([key,item])=>key.length<=64&&!['__proto__','prototype','constructor'].includes(key)&&safeJson(item,depth+1));};
    async function session(){if(!sessionPromise)sessionPromise=fetch('/api/session',{credentials:'same-origin',cache:'no-store'}).then(async response=>{const value=await response.json();if(!response.ok||value.visibility!=='shared')throw new Error('unavailable');ready=true;return true;}).catch(()=>false);return sessionPromise;}
    async function receive(event){if(!active||event.source!==source||event.origin!=='null')return;const d=event.data;if(!d||typeof d!=='object'||Array.isArray(d)||d.protocol!==protocol||d.channel!==channel)return;
      if(d.kind==='hello'&&exact(d,['protocol','channel','kind'])){const ok=await session();reply({kind:'ready',ok,...ok?{}:{error:'共享数据服务不可用。'}});return;}
      const base=['protocol','channel','kind','requestId','action','key'];if(d.kind!=='request'||typeof d.requestId!=='string'||typeof d.key!=='string'||!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(d.key))return;const match=new RegExp('^'+channel+':([1-9][0-9]{0,8})$').exec(d.requestId);if(!match)return;const seq=Number(match[1]);if(!Number.isSafeInteger(seq)||seq<=lastSequence)return;
      let set=false;if(d.action==='get'){if(!exact(d,base))return;}else if(d.action==='set'){set=true;const keys=[...base,'value','expectedRevision'];if(!exact(d,keys)||!Number.isSafeInteger(d.expectedRevision)||d.expectedRevision<0||!safeJson(d.value)||new TextEncoder().encode(JSON.stringify(d.value)).byteLength>12288)return;}else return;
      lastSequence=seq;if(!ready||inflight.size>=8){reply({kind:'result',requestId:d.requestId,ok:false,error:{code:'unavailable',message:'共享数据服务尚未就绪。'}});return;}
      if(set){const now=Date.now();if(now<writeWindow||now-writeWindow>=60000){writeWindow=now;writes=0;}if(writes>=30){reply({kind:'result',requestId:d.requestId,ok:false,error:{code:'rate_limit',message:'保存过于频繁，请稍后重试。'}});return;}writes++;}
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);inflight.set(d.requestId,{controller,timeout});try{const response=await fetch('/api/runtime-data',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action:d.action,appId,versionId,key:d.key,...set?{value:d.value,expectedRevision:d.expectedRevision}:{}})});const result=await response.json();if(!active)return;if(response.ok)reply({kind:'result',requestId:d.requestId,ok:true,result:{key:result.key,...set?{}:{value:result.value},revision:result.revision,updatedAt:result.updatedAt}});else reply({kind:'result',requestId:d.requestId,ok:false,error:{code:typeof result.code==='string'?result.code:'http_'+response.status,message:typeof result.error==='string'?result.error:'共享数据暂时无法连接。',...(Number.isSafeInteger(result.revision)?{revision:result.revision}:{})}});}catch{reply({kind:'result',requestId:d.requestId,ok:false,error:{code:controller.signal.aborted?'timeout':'unavailable',message:controller.signal.aborted?'请求等待超时，写入结果可能尚未确认；请先重新读取数据。':'共享数据暂时无法连接。'}});}finally{clearTimeout(timeout);inflight.delete(d.requestId);}
    }
    window.addEventListener('message',receive);window.addEventListener('pagehide',()=>{active=false;for(const item of inflight.values()){clearTimeout(item.timeout);item.controller.abort();}inflight.clear();},{once:true});
  })();`;
}
