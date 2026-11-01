'use client';

import { useHostLocale } from '@/app/components/HostLocaleProvider';
import { p0ArtifactText } from '@/lib/motes/locale/p0-artifacts';
import { Code2, Download, Eye, History, Star } from 'lucide-react';
import styles from './ArtifactCard.module.css';

export type ArtifactMode = 'manual' | 'demo' | 'model';

export type ArtifactCardProps = {
  versionNumber: number;
  name?: string;
  important: boolean;
  current: boolean;
  viewing: boolean;
  historical: boolean;
  mode: ArtifactMode;
  date: string;
  disabled?: boolean;
  onPreview: () => void;
  onSource: () => void;
  onHistory: () => void;
  onExport: () => void;
};

const modeMessage = {
  manual: '手动修改',
  demo: '示例模式',
  model: '模型生成',
} as const;

function formatDate(value: string, locale: 'zh-CN' | 'en') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function ArtifactCard({ versionNumber, name, important, current, viewing, historical, mode, date, disabled = false, onPreview, onSource, onHistory, onExport }: ArtifactCardProps) {
  const { locale } = useHostLocale();
  const text = (key: Parameters<typeof p0ArtifactText>[1], params?: { number?: number; date?: string }) => p0ArtifactText(locale, key, params);
  const label = name?.trim() || text('未命名版本');
  const previewLabel = viewing ? text('正在查看此版本') : text('预览此版本');

  return <article className={`${styles.card} ${viewing ? styles.viewing : ''}`} aria-label={`${text('版本 v{number}', { number: versionNumber })} · ${label}`}>
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <span className={styles.eyebrow}>{text('已保存成果')}</span>
        <h3 className={styles.title}>{label}</h3>
        <span className={styles.version}>{text('版本 v{number}', { number: versionNumber })}</span>
      </div>
      <div className={styles.badges} aria-label={text('版本状态')}>
        {current && <span className={`${styles.badge} ${styles.current}`}>{text('当前版本')}</span>}
        {viewing && <span className={`${styles.badge} ${styles.selected}`}>{text('正在查看')}</span>}
        {historical && <span className={styles.badge}>{text('历史版本')}</span>}
        {important && <span className={`${styles.badge} ${styles.important}`}><Star size={12} aria-hidden="true" />{text('重要')}</span>}
      </div>
    </header>

    <div className={styles.meta}>
      <span>{text(modeMessage[mode])}</span>
      <time dateTime={date}>{text('创建于 {date}', { date: formatDate(date, locale) })}</time>
    </div>

    <button className={styles.preview} type="button" onClick={onPreview} disabled={disabled} aria-pressed={viewing}>
      <Eye size={16} aria-hidden="true" />
      <span>{previewLabel}</span>
    </button>

    <div className={styles.actions} aria-label={text('版本操作')}>
      <button type="button" onClick={onSource} disabled={disabled} aria-label={`${text('查看源码')} · v${versionNumber}`}>
        <Code2 size={15} aria-hidden="true" /><span>{text('查看源码')}</span>
      </button>
      <button type="button" onClick={onHistory} disabled={disabled} aria-label={`${text('版本历史')} · v${versionNumber}`}>
        <History size={15} aria-hidden="true" /><span>{text('版本历史')}</span>
      </button>
      <button type="button" onClick={onExport} disabled={disabled} aria-label={text('导出版本 v{number} HTML', { number: versionNumber })}>
        <Download size={15} aria-hidden="true" /><span>{text('导出此版本 HTML')}</span>
      </button>
    </div>
  </article>;
}
