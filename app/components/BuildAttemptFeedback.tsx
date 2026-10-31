"use client";
import { LoaderCircle } from 'lucide-react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './BuildAttemptFeedback.module.css';
type Props={phase:'working'|'waiting'|'save'|'failed';title:string;hint:string;details?:string;requestId:string;elapsed?:number;primaryLabel:string;disabled?:boolean;onPrimary:()=>void;onEdit?:()=>void};
/** Display-only feedback: the page retains all original request and retry decisions. */
export default function BuildAttemptFeedback(props:Props){
  const {t}=useHostLocale();
  return <div className={`${styles.root} ${styles[props.phase]}`} role={props.phase==='failed'?'alert':'status'}>
    <div className={styles.title}>{props.phase==='working'&&<LoaderCircle size={16} className="spin"/>}<strong>{props.title}</strong>{props.elapsed!==undefined&&<small>{t('已等待 {seconds} 秒',{seconds:props.elapsed})}</small>}</div>
    <p className={styles.hint}>{props.hint}</p><div className={styles.actions}><button type="button" className={styles.primary} disabled={props.disabled} onClick={props.onPrimary}>{props.primaryLabel}</button>{props.onEdit&&<button type="button" disabled={props.disabled} onClick={props.onEdit}>{t('编辑需求')}</button>}</div>
    <details className={styles.details}><summary>{t('原因与请求详情')}</summary>{props.details&&<p>{props.details}</p>}<small>{t('原请求编号')}</small><code>{props.requestId}</code></details>
  </div>;
}
