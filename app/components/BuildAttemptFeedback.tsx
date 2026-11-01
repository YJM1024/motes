"use client";
import { useState } from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { useHostLocale } from './HostLocaleProvider';
import { p0ActivityText } from '../../lib/motes/locale/p0-activity';
import styles from './BuildAttemptFeedback.module.css';

type Props={phase:'working'|'waiting'|'save'|'failed';title:string;hint:string;details?:string;requestId:string;elapsed?:number;primaryLabel:string;disabled?:boolean;onPrimary:()=>void;onEdit?:()=>void};
type RecordState={requestId:string;open:boolean};

/** Display-only feedback: request, retry, and recovery decisions remain owned by the page. */
export default function BuildAttemptFeedback(props:Props){
  const {locale,t}=useHostLocale();
  const [record,setRecord]=useState<RecordState>({requestId:props.requestId,open:false});
  const expanded=record.requestId===props.requestId&&record.open;
  const copy=(key:Parameters<typeof p0ActivityText>[1])=>p0ActivityText(locale,key);
  const detailsId=`build-work-record-${props.requestId.replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  const toggleRecord=()=>setRecord(current=>current.requestId===props.requestId?{...current,open:!current.open}:{requestId:props.requestId,open:true});
  return <div className={`${styles.root} ${styles[props.phase]}`} role={props.phase==='failed'?'alert':'status'}>
    <div className={styles.title}>
      <span className={styles.stateLabel}>{copy('当前状态')}</span>
      {props.phase==='working'&&<LoaderCircle size={16} className="spin" aria-hidden="true"/>}
      <strong>{props.title}</strong>
      {props.elapsed!==undefined&&<small>{t('已等待 {seconds} 秒',{seconds:props.elapsed})}</small>}
    </div>
    <p className={styles.hint}>{props.hint}</p>
    {props.phase==='failed'&&props.details&&<p className={styles.failureReason}><span>{copy('已记录原因')}</span>{props.details}</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={props.disabled} onClick={props.onPrimary}>{props.primaryLabel}</button>
      {props.onEdit&&<button type="button" disabled={props.disabled} onClick={props.onEdit}>{t('编辑需求')}</button>}
    </div>
    <section className={styles.workRecord} aria-label={copy('本页请求记录')}>
      <button type="button" className={styles.recordToggle} aria-expanded={expanded} aria-controls={detailsId} onClick={toggleRecord}>
        <span>{copy('工作记录')}</span><ChevronDown size={15} aria-hidden="true" className={expanded?styles.chevronOpen:''}/>
      </button>
      <div className={styles.recordDetails} id={detailsId} hidden={!expanded}>
        <p className={styles.recordNote}>{copy('本页已发起此请求；服务端是否已接收或完成，仍以核对结果为准。')}</p>
        <div className={styles.recordRow}><span>{copy('当前状态')}</span><strong>{props.title}</strong></div>
        {props.details&&<div className={styles.recordRow}><span>{copy('已有详情')}</span><p>{props.details}</p></div>}
        <div className={styles.recordRow}><span>{copy('请求编号')}</span><code>{props.requestId}</code></div>
      </div>
    </section>
  </div>;
}
