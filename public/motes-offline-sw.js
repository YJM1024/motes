/* global self, caches */
// Cache only the workbench shell and its public assets. API data lives in scoped IndexedDB.
const CACHE='motes-workbench-shell-v1',PAGES=['/','/manage','/settings','/compare'];
const own=url=>url.origin===self.location.origin;
const asset=url=>own(url)&&!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/share/')&&!url.pathname.startsWith('/published/')&&( /\.(?:js|mjs|css|svg|png|ico|woff2?)(?:$)/i.test(url.pathname)||/^\/(?:@vite\/|@id\/|@react-refresh)/.test(url.pathname));
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function cacheAsset(url,cache,seen=new Set(),missing=new Set()){
 const key=new URL(url,self.location.origin);if(!asset(key)||seen.has(key.href)||seen.size>=384)return;seen.add(key.href);
 try{const response=await fetch(key.href,{credentials:'same-origin',cache:'no-cache'});if(!response.ok||response.type==='opaque'){missing.add(key.href);return}try{await cache.put(key.href,response.clone())}catch{missing.add(key.href);return}if(/javascript|css/.test(response.headers.get('content-type')||'')){const text=await response.text(),references=[...text.matchAll(/["']((?:\.\.?\/|\/assets\/|\/_next\/static\/)[^"'\s<>]+\.(?:m?js|css)(?:\?[^"'\s<>]*)?)["']/g)].map(match=>new URL(match[1],key).href);for(const child of references)await cacheAsset(child,cache,seen,missing)}}catch{missing.add(key.href)}
}
async function cachePage(path,cache,seen,missing=new Set()){
 try{const response=await fetch(new URL(path,self.location.origin),{credentials:'same-origin',headers:{Accept:'text/html'},cache:'no-cache'});if(!response.ok||!(response.headers.get('content-type')||'').includes('text/html'))return false;const html=await response.clone().text(),critical=new Set();
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){const url=new URL(match[1],self.location.origin);if(asset(url))critical.add(url.href)}
 for(const match of html.matchAll(/["']((?:\/assets\/|\/_next\/static\/)[^"'\s<>]+\.(?:m?js|css)(?:\?[^"'\s<>]*)?)["']/g))critical.add(new URL(match[1],self.location.origin).href);
 for(const url of critical)await cacheAsset(url,cache,seen,missing);
 const ok=critical.size>0&&missing.size===0&&(await Promise.all([...critical].map(url=>cache.match(url)))).every(Boolean);if(ok)await cache.put(new URL(path,self.location.origin).href,response);return ok;
 }catch{return false}
}
async function verifiedCachedShell(cache){
 const page=await cache.match(new URL('/',self.location.origin).href);if(!page)return false;const html=await page.text(),pending=new Set(),seen=new Set();
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){const url=new URL(match[1],self.location.origin);if(asset(url))pending.add(url.href)}
 for(const match of html.matchAll(/["']((?:\/assets\/|\/_next\/static\/)[^"'\s<>]+\.(?:m?js|css)(?:\?[^"'\s<>]*)?)["']/g))pending.add(new URL(match[1],self.location.origin).href);
 if(!pending.size)return false;
 while(pending.size){if(seen.size>=384)return false;const url=pending.values().next().value;pending.delete(url);if(seen.has(url))continue;seen.add(url);const saved=await cache.match(url);if(!saved)return false;if(/\.(?:m?js|css)$/.test(new URL(url).pathname)){const text=await saved.text();for(const match of text.matchAll(/["']((?:\.\.?\/|\/assets\/|\/_next\/static\/)[^"'\s<>]+\.(?:m?js|css)(?:\?[^"'\s<>]*)?)["']/g)){const child=new URL(match[1],url);if(asset(child)&&!seen.has(child.href))pending.add(child.href)}}}
 return true;
}
self.addEventListener('message',event=>{
 const data=event.data,source=event.source;if(!source||!source.url||!own(new URL(source.url))||!PAGES.includes(new URL(source.url).pathname)||data?.type!=='MOTES_CACHE_WORKBENCH')return;
 event.waitUntil((async()=>{const cache=await caches.open(CACHE),seen=new Set(),missing=new Set();let ok=await cachePage('/',cache,seen,missing);if(!ok)ok=await verifiedCachedShell(cache);if(ok&&missing.size===0){for(const path of PAGES.filter(path=>path!=='/'))await cachePage(path,cache,seen);for(const value of Array.isArray(data.assets)?data.assets.slice(0,384):[])if(typeof value==='string')await cacheAsset(value,cache,seen)}source.postMessage({type:ok?'MOTES_OFFLINE_SHELL_READY':'MOTES_OFFLINE_SHELL_ERROR',ok});})());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||!own(url)||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'&&PAGES.includes(url.pathname)){
  event.respondWith((async()=>{const cache=await caches.open(CACHE),key=new URL(url.pathname,self.location.origin).href;try{const response=await fetch(request);if(response.status<500)return response}catch{}const saved=await cache.match(key)||await cache.match(new URL('/',self.location.origin).href);return saved||new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Motes offline</title><p>此浏览器尚未缓存工作台，请先联网打开一次。 / Open Motes online once before using it offline.</p></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})})());return;
 }
 if(asset(url))event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(request);if(response.ok)try{await cache.put(request,response.clone())}catch{};return response}catch(error){const saved=await cache.match(request);if(saved)return saved;throw error}})());
});
