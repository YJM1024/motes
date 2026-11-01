"use client";
import { useState } from 'react';
import { useHostLocale } from './HostLocaleProvider';
import { p0EntryText } from '../../lib/motes/locale/p0-entry';
import { writeCompareHandoff, type CompareHandoff, type HandoffStorage } from '../../lib/motes/compare-handoff';
import styles from './CandidateModeEntry.module.css';

type Props={workspaceId:string;prompt:string;appId?:string;baseVersionId?:string;managedProjectId?:string;mode:'single'|'race';count:2|3|4;disabled?:boolean;onModeChange:(mode:'single'|'race')=>void;onCountChange:(count:2|3|4)=>void;storage?:HandoffStorage;navigate?:(path:string)=>void};
/** Presents a deliberate comparison handoff. It never sends a generation request. */
export default function CandidateModeEntry(props:Props){
  const {locale}=useHostLocale();
  const [error,setError]=useState('');
  const text=(key:Parameters<typeof p0EntryText>[1],params?:Readonly<Record<string,string|number>>)=>p0EntryText(locale,key,params);
  function openCompare(){
    setError('');
    const value:CompareHandoff={version:1,workspaceId:props.workspaceId,createdAt:Date.now(),prompt:props.prompt,
      ...(props.appId?{appId:props.appId,baseVersionId:props.baseVersionId}:{}),
      ...(!props.appId&&props.managedProjectId?{managedProjectId:props.managedProjectId}:{}),count:props.count};
    let storage=props.storage;
    if(!storage){try{storage=window.sessionStorage}catch{}}
    if(!storage||!writeCompareHandoff(storage,value)){setError(text('无法安全保存本次跳转内容；请复制需求后再打开比较页。'));return;}
    (props.navigate||((path:string)=>window.location.assign(path)))('/compare');
  }
  return <section className={styles.root} aria-label={text('赛马比较')}>
    <div className={styles.modes} role="group" aria-label={text('创作方式')}>
      <button type="button" aria-pressed={props.mode==='single'} disabled={props.disabled} onClick={()=>props.onModeChange('single')}>{text('单次创作')}</button>
      <button type="button" aria-pressed={props.mode==='race'} disabled={props.disabled} onClick={()=>props.onModeChange('race')}>{text('赛马比较')}</button>
    </div>
    {props.mode==='race'&&<div className={styles.race}>
      <label>{text('比较方案数量')}<select value={props.count} disabled={props.disabled} onChange={e=>props.onCountChange(Number(e.target.value) as 2|3|4)}>{[2,3,4].map(count=><option key={count} value={count}>{text('{count} 个方案',{count})}</option>)}</select></label>
      <p>{text('本次跳转已填入需求；选择比较模式并确认费用后，才会发送请求。')}</p>
      <button type="button" className={styles.open} disabled={props.disabled||!props.workspaceId||!props.prompt.trim()||props.prompt.length>4000||(!!props.appId&&!!props.managedProjectId)||(!!props.appId&&!props.baseVersionId)} onClick={openCompare}>{text('查看比较设置')}</button>
    </div>}
    {props.mode==='race'&&<p className={styles.note}>{text('仅准备需求并打开比较页；不会在此发送或调用模型。')}</p>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
  </section>;
}
