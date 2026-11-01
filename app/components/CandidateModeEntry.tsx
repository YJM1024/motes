"use client";
import {useHostLocale} from './HostLocaleProvider';
import styles from './CandidateModeEntry.module.css';
type Props={workspaceId:string;prompt:string;appId?:string;baseVersionId?:string;managedProjectId?:string;mode:'single'|'race';count:2|3|4;creationMode:'demo'|'model';confirmed:boolean;confirmationOpen:boolean;disabled?:boolean;onModeChange:(mode:'single'|'race')=>void;onCountChange:(count:2|3|4)=>void;onConfirmedChange:(value:boolean)=>void};
/** Shares the existing composer send action; selecting a count never sends a request. */
export default function CandidateModeEntry(props:Props){
  const {locale}=useHostLocale();const en=locale==='en';
  return <section className={styles.root} aria-label={en?'Generation mode':'创作方式'}>
    <div className={styles.modes} role="group" aria-label={en?'Generation mode':'创作方式'}>
      <button type="button" aria-pressed={props.mode==='single'} disabled={props.disabled} onClick={()=>props.onModeChange('single')}>{en?'Single':'单次'}</button>
      {([2,3,4] as const).map(count=><button key={count} type="button" aria-pressed={props.mode==='race'&&props.count===count} disabled={props.disabled} onClick={()=>{props.onCountChange(count);props.onModeChange('race')}}>{en?`${count} candidates`:`${count} 路赛马`}</button>)}
    </div>
    {props.mode==='race'&&<p className={styles.note}>{props.creationMode==='demo'?(en?'Preset demo themes · 0 real model calls. Send to compare here.':'预设示例主题 · 0 次真实模型调用。发送后在当前页面比较。'):(en?`Same model, ${props.count} calls. Review costs before sending; nothing is adopted automatically.`:`同一模型生成 ${props.count} 路方案。发送前确认真实费用，不会自动采用。`)}</p>}
    {props.mode==='race'&&props.creationMode==='model'&&props.confirmationOpen&&<div className={styles.confirmation}>
      <p>{en?`This request makes ${props.count} real model calls and may incur the corresponding provider fees, including failed calls. Failed lanes are never retried automatically.`:`本次将进行 ${props.count} 次真实模型调用并产生相应费用；失败调用也可能收费。失败不会自动重试。`}</p>
      <label><input type="checkbox" checked={props.confirmed} disabled={props.disabled} onChange={e=>props.onConfirmedChange(e.target.checked)}/>{en?'I confirm the cost. Use the send button to start.':'我已确认费用，点击发送按钮开始'}</label>
    </div>}
  </section>;
}
