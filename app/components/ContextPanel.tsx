'use client';

import styles from './ContextPanel.module.css';
import { useHostLocale } from '@/app/components/HostLocaleProvider';

export type ContextHistory = {
  availableTurns: number;
  includedTurns: number;
  omittedTurns: number;
  characters: number;
  limit: 12000;
  maxTurns: 6;
  truncated: boolean;
  excerpts: { text: string; partial: boolean }[];
};

export type ContextPanelProps = {
  intent: 'build' | 'discuss';
  baseVersion?: { id: string; number: number } | null;
  history?: ContextHistory | null;
  elementSelector?: string | null;
};

export default function ContextPanel({ intent, baseVersion = null, history = null, elementSelector = null }: ContextPanelProps) {
  const { t } = useHostLocale();
  return <details className={styles.root}>
    <summary>{t('发送上下文范围')}</summary>
    {intent === 'build' ? <div className={styles.body}>
      <p>{t('构建只使用当前需求、已保存基准 HTML、有效设置，以及可选的元素定位信息。')}</p>
      <ul>
        <li>{baseVersion ? t('基于已保存版本 v{number}。', { number: baseVersion.number }) : t('当前没有选定已保存基准版本。')}</li>
        <li>{elementSelector ? t('包含当前选择的元素定位信息。') : t('未选择特定页面元素。')}</li>
        <li>{t('不会自动加入全部聊天记录或已废弃版本的需求；讨论内容需先由你明确采用。')}</li>
      </ul>
      <p className={styles.note}>{t('预览中临时输入的数据不会读取或加入上下文。')}</p>
    </div> : <div className={styles.body}>
      <p>{t('讨论使用当前问题、已保存基准 HTML，以及最近最多 6 轮已完成讨论；运行中或失败的请求不计入历史。')}</p>
      <p>{t('历史讨论总长度上限为 12,000 字符。以下数字和节选基于当前已读取的讨论。发送时服务器会按相同规则读取最新已保存历史：')}</p>
      {history ? <>
        <dl className={styles.stats}>
          <div><dt>{t('可用轮数')}</dt><dd>{history.availableTurns}</dd></div>
          <div><dt>{t('当前可纳入')}</dt><dd>{history.includedTurns} / {history.maxTurns}</dd></div>
          <div><dt>{t('未纳入')}</dt><dd>{history.omittedTurns} {t('轮')}</dd></div>
          <div><dt>{t('历史字符数')}</dt><dd>{history.characters.toLocaleString()} / {history.limit.toLocaleString()}</dd></div>
        </dl>
        {history.truncated && <p className={styles.note}>{t('历史内容按上下文上限截取；节选标记会指出部分内容。')}</p>}
        {history.excerpts.length > 0 ? <ol className={styles.excerpts}>{history.excerpts.map((excerpt, index) => <li key={`${index}-${excerpt.text.slice(0, 24)}`}><span>{excerpt.partial ? t('部分节选') : t('本轮节选')}</span><pre>{excerpt.text}</pre></li>)}</ol> : <p className={styles.note}>{t('当前没有可展示的已完成讨论节选。')}</p>}
        <p className={styles.note}>{t('这些是本地展示的原始对话节选，不是额外生成的 AI 摘要。')}</p>
      </> : <p className={styles.note}>{t('当前没有可用的历史上下文统计；此处不会猜测轮数或字符数。')}</p>}
      <p className={styles.note}>{t('预览 iframe 中临时输入的数据不会读取或加入上下文。')}</p>
    </div>}
  </details>;
}
