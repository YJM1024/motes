"use client";
import { ArrowUpRight } from 'lucide-react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './PreviewVersionStatus.module.css';
export default function PreviewVersionStatus({viewed,current,onReturn}:{viewed:number;current:number;onReturn:()=>void}){
  const {t}=useHostLocale();
  return <div className={styles.notice} role="status"><div><strong>{t('正在预览历史 v{viewed}，当前保存为 v{current}',{viewed,current})}</strong><p>{t('继续构建仍基于当前保存版本；历史预览不会自动还原。')}</p></div><button type="button" onClick={onReturn}>{t('返回当前保存版本')}<ArrowUpRight size={13}/></button></div>;
}
