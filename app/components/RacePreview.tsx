"use client";
import {useState} from 'react';
import type {RaceController,RaceState} from '@/lib/motes/race-controller';
import type {racePresentation} from '@/lib/motes/race-presentation';
import {useHostLocale} from './HostLocaleProvider';
import styles from './RacePreview.module.css';
const statuses={running:['正在生成','Generating'],ready:['已保存','Saved'],failed:['生成失败','Failed'],unresolved:['结果待核对','Needs checking'],save_pending:['暂存待保存','Staged · save pending']} as const;
const failures:Record<string,[string,string]>={timeout:['等待超时','Wait timed out'],quota:['模型账户额度不足','Model account quota unavailable'],rate_limit:['服务繁忙，请稍后核对','Service rate limited'],authentication:['模型权限不可用','Model access unavailable'],upstream:['模型服务暂时异常','Model provider unavailable'],output:['输出未通过完整性检查','Output validation failed'],connection:['连接中断','Connection lost'],storage:['结果保存未完成','Result not yet saved'],state_changed:['执行状态已变化，请核对','Execution state changed; check the original result']};
type Props={state:RaceState;controller:RaceController;view:ReturnType<typeof racePresentation>;appAvailable:boolean;disabled:boolean;onChoose:(slot:number|null)=>void;onOpen:(appId:string,versionId:string,isCurrent?:()=>boolean)=>Promise<void>};
export function RacePreviewTabs({state,view,appAvailable,onChoose}:Pick<Props,'state'|'view'|'appAvailable'|'onChoose'>){
  const {locale}=useHostLocale(),en=locale==='en',index=en?1:0;
  return <div className={styles.tabs} role="tablist" aria-label={en?'Preview candidate':'切换预览方案'}>{view.slots.map(({slot,candidate})=>{const status=candidate?statuses[candidate.status][index]:state.error?(en?'Not ready':'未完成'):(en?'Generating':'正在生成');return <button key={slot} type="button" role="tab" aria-selected={view.slot===slot} aria-label={(en?'Candidate':'方案')+' '+String.fromCharCode(65+slot)+' · '+status} title={status} onClick={()=>onChoose(slot)}>{en?'Option':'方案'} {String.fromCharCode(65+slot)}</button>})}{appAvailable&&<button type="button" role="tab" aria-selected={view.slot===null} onClick={()=>onChoose(null)}>{en?'Saved app':'原应用'}</button>}</div>;
}
/** A single left-aligned selector controls the workbench's existing large iframe. */
export default function RacePreview({state,controller,view,disabled,onOpen}:Props){
  const {locale}=useHostLocale(),en=locale==='en',index=en?1:0;const [retryConfirm,setRetryConfirm]=useState<string|null>(null);
  const candidate=view.candidate,locked=disabled||state.busy;
  const status=candidate?statuses[candidate.status][index]:state.error?(en?'No saved result':'暂无已保存结果'):(en?'Waiting for result':'等待生成结果');
  return <div className={styles.root} aria-label={en?'Candidate preview controls':'候选预览控制'}>
    {view.showCandidate?<>
      <div className={styles.status}><strong>{en?'Candidate':'候选方案'} {String.fromCharCode(65+(view.slot??0))}</strong><span role="status">{status}</span>{candidate?.strategy&&<span>{candidate.strategy}</span>}</div>
      {candidate?.errorCode&&<p className={styles.hint}>{failures[candidate.errorCode]?.[index]||(en?'Could not finish; check the original result':'暂未完成，请核对原结果')}</p>}
      <div className={styles.actions}>
        {candidate?.status==='save_pending'&&<button type="button" disabled={locked} onClick={()=>void controller.saveLane(candidate)}>{en?'Save staged result · 0 model calls':'保存暂存结果 · 0 次模型调用'}</button>}
        {candidate?.status==='failed'&&<button type="button" disabled={locked||controller.blocked} onClick={()=>setRetryConfirm(candidate.id)}>{en?'Retry this lane':'仅重试此路'}</button>}
        {candidate?.status==='unresolved'&&<button type="button" disabled={locked} onClick={()=>void controller.check()}>{en?'Check original attempt':'核对原尝试'}</button>}
        {candidate?.status==='ready'&&(candidate.adoptedAppId?<button type="button" disabled={locked} onClick={()=>void onOpen(candidate.adoptedAppId!,candidate.adoptedVersionId!)}>{en?'Open adopted app':'打开已采用应用'}</button>:<><button type="button" className={styles.adopt} disabled={locked} onClick={()=>void controller.adopt(candidate,false,onOpen)}>{en?'Adopt and open':state.group?.appId?'采用到原应用并打开':'采用并打开应用'}</button>{state.group?.appId&&<button type="button" disabled={locked} onClick={()=>void controller.adopt(candidate,true,onOpen)}>{en?'Save independent app copy':'另存独立应用副本'}</button>}</>)}
      </div>
      {candidate&&retryConfirm===candidate.id&&<div className={styles.confirmation}><p>{state.group?.mode==='model'?(en?'Retry only this lane with one additional paid model call?':'仅重新生成此路，将新增 1 次真实模型调用并可能产生费用。其他方案保留。'):(en?'Retry this preset lane with 0 real model calls?':'重新生成此路预设示例，0 次真实模型调用。其他方案保留。')}</p><div className={styles.actions}><button type="button" disabled={locked||controller.blocked} onClick={()=>{setRetryConfirm(null);void controller.retryLane(candidate)}}>{en?'Confirm retry':'确认重试此路'}</button><button type="button" onClick={()=>setRetryConfirm(null)}>{en?'Cancel':'取消'}</button></div></div>}
      <p className={styles.hint}>{(state.group?.mode||state.pending?.mode||state.submitted?.mode)==='demo'?(en?'Preset demo · 0 real model calls · ':'预设示例 · 0 次真实模型调用 · '):''}{en?'App data saving connects after adoption.':'候选仅验证交互，采用后才接入应用数据保存。'}</p>
    </>:<p className={styles.hint}>{en?'Viewing the saved app. Candidates above remain available; adoption checks the live version again.':'正在查看已保存的原应用。上方候选仍保留；采用时会再次检查当前版本。'}</p>}
  </div>;
}
