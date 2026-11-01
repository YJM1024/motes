'use client';

import { useCallback, useEffect, useState } from 'react';
import { useHostLocale } from '@/app/components/HostLocaleProvider';
import type { HostMessageKey } from '@/lib/motes/locale';
import type { UsageSnapshot } from '@/lib/motes/usage';
import './usage-panel.css';

type UsageLayer = { used: number; remaining: number; limit: number };
type LayerLimits = Record<'visitor' | 'shared' | 'global', Record<'model' | 'demo', UsageLayer>>;
type UsageView = UsageSnapshot & { limits?: LayerLimits };

const statusKeys = { running: '进行中', succeeded: '成功保存', failed: '失败', unresolved: '结果待核对' } as const;
const operationKeys: Record<string, HostMessageKey> = { generate: '新建', modify: '修改', repair: '修复', candidate: '候选', discuss: '讨论' };
const errorKeys: Record<string, HostMessageKey> = { timeout: '等待超时', quota: '账户额度不足', rate_limit: '服务限流', authentication: '模型权限不可用', upstream: '服务异常', output: '输出未通过校验', connection: '连接中断', storage: '保存未完成', state_changed: '应用或目标状态变化' };

export default function UsagePanel({ visibility = 'private' }: { visibility?: 'shared' | 'private' }) {
  const { t, locale } = useHostLocale();
  const [data, setData] = useState<UsageView | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const count = (value: number | null) => value === null ? t('未知') : value.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/usage', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const body = await response.json() as UsageView & { error?: string };
      if (!response.ok) throw new Error(body.error || t('读取用量失败。'));
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('读取用量失败。')); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const unlimited = data?.limitsEnforced === false;
  const testingLabel = locale === 'en' ? 'No daily request limit during testing. Actual usage is recorded; model service charges, balance limits and timeouts still apply.' : '测试期间不限每日请求次数，仍记录真实用量；模型服务费用、账户余额限制和超时仍适用。';

  return <section className="settings-section usage-panel" id="settings-usage">
    <div className="settings-section-title"><h3>{t('用量与任务')}</h3><button disabled={loading} onClick={() => void load()}>{loading ? t('正在读取…') : t('刷新用量')}</button></div>
    <p>{unlimited ? testingLabel : visibility === 'shared' ? t('公共演示空间的使用记录和应用对其他访问者可见；这里显示访客、共享空间和全站三层应用额度，不是模型账户余额。每日额度按 UTC 结算，失败尝试也可能占用额度。') : t('仅当前浏览器身份。每日额度按 UTC 结算，已进入生成流程的失败尝试也占次数；这是应用侧额度，不是模型账户余额。')}</p>
    {error && <p role="alert" className="usage-error">{error}</p>}
    {data && <>
      {unlimited ? <div className="usage-totals">
        <div><span>{t('今日 AI 请求')}</span><strong>{data.tokens.todayModelAttempts}</strong></div>
        <div><span>{t('今日示例请求')}</span><strong>{data.limits?.shared.demo.used ?? data.quota.demo.used}</strong></div>
        <div><span>{t('今日 AI 结果')}</span><strong>{t('{succeeded} 成功 · {failed} 失败', { succeeded: data.outcomes.succeeded, failed: data.outcomes.failed })}</strong><small>{t('{count} 条待完成或核对', { count: data.outcomes.running })}</small></div>
      </div> : visibility === 'shared' ? <>
        <div className="usage-totals">
          <div><span>{t('AI 有效可用额度')}</span><strong>{data.quota.model.remaining} / {data.quota.model.limit}</strong><small>{t('按三层剩余额度中的最小值计算')}</small></div>
          <div><span>{t('示例有效可用额度')}</span><strong>{data.quota.demo.remaining} / {data.quota.demo.limit}</strong><small>{t('按三层剩余额度中的最小值计算')}</small></div>
          <div><span>{t('今日 AI 结果')}</span><strong>{t('{succeeded} 成功 · {failed} 失败', { succeeded: data.outcomes.succeeded, failed: data.outcomes.failed })}</strong><small>{t('{count} 条待完成或核对', { count: data.outcomes.running })}</small></div>
        </div>
        {data.limits ? <div className="usage-shared-limits"><h4>{t('三层额度明细')}</h4><div>{(['visitor','shared','global'] as const).map(layer => <article key={layer}><strong>{t(layer === 'visitor' ? '访客额度' : layer === 'shared' ? '共享空间额度' : '全站额度')}</strong><span>{t('AI')}: {data.limits![layer].model.used}/{data.limits![layer].model.limit} · {t('剩余 {count} 次',{count:data.limits![layer].model.remaining})}</span><span>{t('示例')}: {data.limits![layer].demo.used}/{data.limits![layer].demo.limit} · {t('剩余 {count} 次',{count:data.limits![layer].demo.remaining})}</span></article>)}</div><small>{t('访客限制单个访客；共享空间限制全部访问者合计；全站限制所有空间合计。')}</small></div> : <p role="status">{t('三层额度明细暂不可用；下方有效额度仍以服务端核对结果为准。')}</p>}
      </> : <div className="usage-totals">
        <div><span>{t('今日 AI 请求')}</span><strong>{data.quota.model.used} / {data.quota.model.limit}</strong><small>{t('剩余 {count} 次', { count: data.quota.model.remaining })}</small></div>
        <div><span>{t('今日示例请求')}</span><strong>{data.quota.demo.used} / {data.quota.demo.limit}</strong><small>{t('剩余 {count} 次', { count: data.quota.demo.remaining })}</small></div>
        <div><span>{t('今日 AI 结果')}</span><strong>{t('{succeeded} 成功 · {failed} 失败', { succeeded: data.outcomes.succeeded, failed: data.outcomes.failed })}</strong><small>{t('{count} 条待完成或核对', { count: data.outcomes.running })}</small></div>
      </div>}
      <div className="usage-tokens">
        <h4>{t('今日已知 Token 小计')}</h4>
        {visibility === 'shared' && <p>{t('这些是共享空间的合计活动，不包含任何人的需求或源码内容。')}</p>}
        <p>{t('输入 {input} · 输出 {output} · 总计 {total}', { input: count(data.tokens.input), output: count(data.tokens.output), total: count(data.tokens.total) })}</p>
        <small>{t('完整用量回执 {known} / 今日 {attempts} 次 AI 尝试；', { known: data.tokens.knownRecords, attempts: data.tokens.todayModelAttempts })}{t(data.tokens.coverage === 'complete' ? '当前已覆盖全部尝试' : '存在未知或尚未记录的用量，以上不是完整消耗')}{t('。仅保存 API 实际回执，未知不会记作零；未接入记录前的旧请求没有补算。输出 Token 可包含推理与其他不可见内容，不代表可见代码长度。')}</small>
      </div>
      <h4>{t('最近 50 条模型任务')}</h4>
      {!data.items.length ? <p>{t('暂无已接入记录的模型任务。示例、人工保存、历史副本和备份不冒充模型调用。')}</p> : <div className="usage-list">{data.items.map(item => <article key={item.requestId}>
        <div><strong>{t(operationKeys[item.operation] || '模型任务')} · {item.requestedModel}</strong><span>{t(statusKeys[item.status])}</span></div>
        <p>{new Date(item.startedAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')} · {item.elapsedMs === null ? t('耗时未知') : `${(item.elapsedMs / 1000).toFixed(1)} ${t('秒')}`}{item.responseModel && item.responseModel !== item.requestedModel ? ` · ${t('实际回执')} ${item.responseModel}` : ''}</p>
        <p>{t('输入')} {count(item.inputTokens)} · {t('输出')} {count(item.outputTokens)} · {t('总计')} {count(item.totalTokens)}{item.errorCode ? ` · ${errorKeys[item.errorCode] ? t(errorKeys[item.errorCode]) : t('操作未完成')}` : ''}</p>
      </article>)}</div>}
      <small>{unlimited ? (locale === 'en' ? 'No estimated account balance or exact cost is shown.' : '不显示估算账户余额或精确费用。') : t('不显示估算余额或精确费用。服务端全站额度也可能先用完；个人剩余次数不保证全站仍可接受请求。')}</small>
    </>}
  </section>;
}
