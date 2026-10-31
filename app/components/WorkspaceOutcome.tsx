"use client";
import { Check, X } from 'lucide-react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './WorkspaceOutcome.module.css';
export default function WorkspaceOutcome({title,message,primaryLabel,onPrimary,onHistory,onManage,onDismiss,disabled=false}:{title:string;message:string;primaryLabel:string;onPrimary:()=>void;onHistory?:()=>void;onManage?:()=>void;onDismiss:()=>void;disabled?:boolean}){
  const {t}=useHostLocale();
  return <section className={styles.root} role="status"><Check size={16}/><div className={styles.copy}><strong>{title}</strong><p>{message}</p></div><div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled} onClick={onPrimary}>{primaryLabel}</button>{onHistory&&<button type="button" disabled={disabled} onClick={onHistory}>{t('版本历史')}</button>}{onManage&&<button type="button" disabled={disabled} onClick={onManage}>{t('应用管理')}</button>}<button type="button" className={styles.dismiss} aria-label={t('收起完成提示')} onClick={onDismiss}><X size={15}/></button></div></section>;
}
