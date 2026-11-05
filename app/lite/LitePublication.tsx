'use client';
import { useEffect, useRef, useState } from 'react';
import type { Publication } from '@/lib/motes/publication-types';
import { publicationUrl } from '@/lib/motes/publication-client';
import { publicationPreflight } from '@/lib/motes/publication-preflight';
import { liteApi } from './api';
type Mutation = { action: 'publish'; versionId: string; expectedRevision: number; requestId: string } | { action: 'unpublish'; expectedRevision: number; requestId: string };
export default function LitePublication({ appId, versionId, number, html }: { appId: string; versionId: string; number: number; html: string }) {
  const [publication, setPublication] = useState<Publication | null>(null), [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [confirm, setConfirm] = useState<'publish' | 'unpublish' | false>(false), [pending, setPending] = useState<Mutation | null>(null);
  const mounted = useRef(true);
  const path = '/api/projects/' + appId + '/publication', key = 'motes-lite-publication:' + appId;
  function clearPending() { try { sessionStorage.removeItem(key); } catch {} }
  async function reconnect() { setLoading(true); setMessage(''); try { const data = await liteApi<{ publication: Publication | null }>(path); if (mounted.current) { setPublication(data.publication); setReady(true); setMessage('已连接发布服务。'); } } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : '发布服务暂时不可用。'); } finally { if (mounted.current) setLoading(false); } }
  useEffect(() => {
    mounted.current = true; const controller = new AbortController();
    try { const prior = JSON.parse(sessionStorage.getItem(key) || 'null'); if ((prior?.action === 'unpublish' || prior?.action === 'publish' && typeof prior.versionId === 'string') && Number.isSafeInteger(prior.expectedRevision) && typeof prior.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(prior.requestId) && prior.expectedRevision >= 0) setPending(prior); } catch {}
    void liteApi<{ publication: Publication | null }>(path, undefined, controller.signal).then(data => { if (mounted.current) { setPublication(data.publication); setReady(true); } }).catch(e => { if (mounted.current) setMessage(e.message); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, [path, key]);
  async function publish(action: 'publish' | 'unpublish' = 'publish') {
    if (busy || !ready) return;
    const body: Mutation = pending || { action, ...(action === 'publish' ? { versionId } : {}), expectedRevision: publication?.revision || 0, requestId: crypto.randomUUID() } as Mutation;
    if (!pending && action === 'publish' && publicationPreflight(html).errors.length) { setMessage('此版本未通过发布前静态检查。'); return; }
    setPending(body); try { sessionStorage.setItem(key, JSON.stringify(body)); } catch {}
    setBusy(true); setMessage('正在保存发布状态…');
    try {
      const result = await liteApi<{ publication: Publication }>(path, body, AbortSignal.timeout(15000));
      if (!mounted.current) return;
      setPublication(result.publication); setPending(null); setConfirm(false); clearPending();
      setMessage(result.publication.enabled ? `已发布 v${result.publication.versionNumber}。可复制链接公开运行。` : "已暂停公开链接。再次发布将沿用原链接。");
    } catch (e) {
      if (!mounted.current) return;
      setMessage(e instanceof Error ? e.message : '发布结果尚未确认，请核对原发布请求。');
      if ((e as { status?: number }).status === 409) {
        try { const next = await liteApi<{ publication: Publication | null }>(path); if (mounted.current) { setPublication(next.publication); setPending(null); clearPending(); setMessage('发布状态已变化，已读取最新状态。请核对所见版本后再次发布。'); setConfirm(false); } } catch {}
      }
    } finally { if (mounted.current) setBusy(false); }
  }
  async function copy() {
    if (!publication?.enabled) return;
    const url = publicationUrl(publication.path, window.location.origin);
    try { await navigator.clipboard.writeText(url); setMessage('发布链接已复制。'); } catch { setMessage('自动复制不可用，请选中下方链接复制。'); }
  }
  const current = publication?.enabled && publication.versionId === versionId;
  return <div className="lite-publication">
    {ready && <div className="lite-publication-state">{publication?.enabled ? <><strong>当前发布 v{publication.versionNumber}</strong><span>{current ? `当前预览 v${number} 已发布` : `当前预览 v${number} 尚未发布`}</span></> : publication ? <><strong>发布已暂停</strong><span>公开链接暂不可访问 · 可重新发布当前预览 v{number}</span></> : <><strong>尚未发布</strong><span>当前预览 v{number} 仅在工作台中查看</span></>}</div>}
    <div className="lite-publication-actions">{loading && <small role="status">正在读取发布状态…</small>}{!ready && !loading && <button onClick={() => void reconnect()}>重试连接发布服务</button>}<button className="lite-primary" disabled={!ready || busy} onClick={() => pending ? void publish() : setConfirm(confirm === 'publish' ? false : 'publish')}>{busy ? '发布中…' : pending ? '核对原发布请求' : current ? `重新发布 v${number}` : `发布 v${number}`}</button>{publication?.enabled && <><button onClick={() => void copy()}>复制链接</button><a href={publication.path} target="_blank" rel="noopener noreferrer">打开 ↗</a><button disabled={busy || !!pending} onClick={() => setConfirm("unpublish")}>暂停发布</button></>}</div>
    {confirm && <div className="lite-publish-confirm"><p>{confirm === "unpublish" ? "将暂停公开链接的后续访问；再次发布可恢复同一链接。已复制或下载的内容不会被收回。" : <>将公开当前预览版本 v{number} 的完整 HTML。此空间的作品和业务数据由访客共享；请确认适合公开。</>}</p><small>发布前静态检查不能代替实际功能验证。</small><div><button className="lite-primary" onClick={() => void publish(confirm || "publish")} disabled={busy}>{confirm === "unpublish" ? "确认暂停" : `确认发布 v${number}`}</button><button onClick={() => setConfirm(false)}>取消</button></div></div>}
    {publication?.enabled && <small><a href={publication.path} target="_blank" rel="noopener noreferrer">{publication.path}</a></small>}
    {message && <p role="status" className="lite-note">{message}</p>}
  </div>;
}




