import type { SharedVersion } from './share-types';
import { PREVIEW_POLICY, safeDocument } from './preview-document';
import { runtimeDataClientScript, runtimeDataHostScript } from './runtime-data-client';

// Parent frame-src also fences iframe-initiated external navigations. The
// iframe's own stricter policy denies nested frames and every network request.
export const SHARE_PAGE_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'self'; frame-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const style=`*{box-sizing:border-box}body{margin:0;background:#f3f5f6;color:#263541;font:14px/1.6 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}h1{font-size:24px;line-height:1.3;margin:8px 0;overflow-wrap:anywhere}.brand{font-size:12px;letter-spacing:.08em;color:#596e7b}.badge{display:inline-block;padding:3px 9px;background:#e5eef3;border-radius:6px;color:#34566c}p{color:#596975;margin:8px 0 18px}a{color:#345e78}iframe{display:block;border:1px solid #d2dce2;border-radius:12px;background:white;width:100%;height:min(70dvh,800px);min-height:300px}details{background:white;border:1px solid #dce3e7;border-radius:10px;margin-top:18px;padding:14px}summary{cursor:pointer}pre{overflow:auto;max-height:400px;font:12px/1.6 ui-monospace,Consolas,monospace;white-space:pre}button{border:1px solid #c7d3db;border-radius:7px;background:#fff;padding:7px 12px;color:#34566c;cursor:pointer}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #397ca0;outline-offset:3px}.source-actions{display:flex;gap:12px;align-items:center;margin-top:14px}.source-actions span{font-size:12px}.unavailable{background:white;border:1px solid #dce3e7;padding:32px;border-radius:12px;margin:10dvh auto;max-width:580px}@media(max-width:600px){main{padding:16px}header{flex-direction:column;gap:0}h1{font-size:21px}iframe{min-height:360px;height:65dvh}.source-actions{align-items:flex-start;flex-direction:column}}`;
export function sharedPage(share:SharedVersion|null,unavailable='分享不可用，链接可能已撤销或不存在。',kind:'snapshot'|'publication'='snapshot',targetOrigin?:string):string {
  const label=kind==='publication'?'当前发布版':'固定版本';
  const head=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>${escape(share?share.title+' · '+label+'分享':'分享不可用')} · Motes</title><style>${style}</style></head><body><main>`;
  if(!share)return head+`<div class="unavailable"><div class="brand">MOTES · 版本分享</div><h1>此分享暂时无法打开</h1><p>${escape(unavailable)}</p><a href="/">前往 Motes 工作台</a></div></main></body></html>`;
  const channel=Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
  const origin=targetOrigin&&new URL(targetOrigin).origin===targetOrigin&&['http:','https:'].includes(new URL(targetOrigin).protocol)?targetOrigin:null;
  const runtimeEnabled=!!origin&&share.runtimeData===true&&!!share.appId&&!!share.versionId;
  const hostBridge=runtimeEnabled?runtimeDataHostScript(channel,origin!,share.appId!,share.versionId!):'';
  const clientBridge=runtimeEnabled?runtimeDataClientScript(channel,origin!):'';
  const accessCopy=runtimeEnabled
    ? `这是公共工作空间中的${label}固定代码版本。访客可以使用应用；此页面不允许修改应用代码。内容由创作者提供。`
    : '这是创作者分享的应用版本，可以在下方操作预览。此处不是工作台，访问者不能编辑原应用。内容由创作者提供。';
  const versionCopy=kind==='publication'?'这是稳定发布链接，创作者可更新发布版本或将其下线；固定快照分享使用另一条链接。':'';
  const dataCopy=runtimeEnabled
    ? `应用接入 Motes SDK 后保存的业务数据会写入公共工作空间，所有访客读写同一份数据。未接入 SDK 的输入仅在当前预览中有效，刷新后会清空且不会自动保存。讨论记录和其他版本代码不会随此链接公开。`
    : '分享只包含此版本标题和源码，不包含需求对话或其他版本。预览中的输入属于临时状态，不会修改原应用。';
  // Source is escaped text in <code>. Only the trusted bootstrap reads it and
  // assigns a sanitized srcdoc; generated tags never enter the parent DOM.
  return head+`<header><div><div class="brand">MOTES · 只读分享</div><h1>${escape(share.title)}</h1></div><span class="badge">${label} v${share.versionNumber}</span></header><p>${accessCopy}${versionCopy}</p><iframe id="shared-frame" title="${escape(share.title)} · v${share.versionNumber} 分享预览" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe><p id="preview-error" role="alert"></p><details><summary>查看此${label}的完整 HTML 源码</summary><div class="source-actions"><button id="copy-source" type="button">复制源码</button><span id="copy-status" role="status"></span></div><pre><code id="shared-source">${escape(share.html)}</code></pre></details><p>${dataCopy}</p></main><script>${hostBridge}</script><script>try{const source=document.getElementById('shared-source').textContent;const parsed=new DOMParser().parseFromString((${safeDocument.toString()})(source,${JSON.stringify(PREVIEW_POLICY)}),'text/html');if(${JSON.stringify(runtimeEnabled)}){const runtime=document.createElement('script');runtime.textContent=${JSON.stringify(clientBridge)};parsed.head.insertBefore(runtime,parsed.head.firstChild?.nextSibling||null);}document.getElementById('shared-frame').srcdoc='<!DOCTYPE html>'+parsed.documentElement.outerHTML;document.getElementById('copy-source').addEventListener('click',async()=>{const status=document.getElementById('copy-status');try{await navigator.clipboard.writeText(source);status.textContent='完整源码已复制。';}catch{status.textContent='无法访问剪贴板，请手动选中源码复制。';}});}catch{document.getElementById('preview-error').textContent='预览未能载入，可以展开下方源码查看。';}</script></body></html>`;
}

export function sharedPageResponse(share:SharedVersion|null,status=share?200:404,kind:'snapshot'|'publication'='snapshot',targetOrigin?:string):Response {
  return new Response(sharedPage(share,status===503?'服务暂时不可用，请稍后重试。':kind==='publication'?'发布链接不可用，可能已下线或不存在。':undefined,kind,targetOrigin),{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Content-Security-Policy':SHARE_PAGE_POLICY}});
}
