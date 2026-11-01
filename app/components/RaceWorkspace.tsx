"use client";
import {useMemo,useState} from 'react';
import type {Candidate} from '@/lib/motes/candidate-types';
import type {RaceController,RaceState} from '@/lib/motes/race-controller';
import {PREVIEW_POLICY,safeDocument} from '@/lib/motes/preview-document';
import {useHostLocale} from './HostLocaleProvider';
import styles from './RaceWorkspace.module.css';
const statuses={running:'正在生成',ready:'已保存',failed:'生成失败',unresolved:'结果待核对',save_pending:'结果暂存 · 待保存'};
const failures:Record<string,[string,string]>={timeout:['等待超时','Wait timed out'],quota:['模型账户额度不足','Model account quota unavailable'],rate_limit:['服务繁忙，请稍后核对','Service rate limited'],authentication:['模型权限不可用','Model access unavailable'],upstream:['模型服务暂时异常','Model provider unavailable'],output:['输出未通过完整性检查','Output validation failed'],connection:['连接中断','Connection lost'],storage:['结果保存未完成','Result not yet saved'],state_changed:['执行状态已变化，请核对','Execution state changed; check the original result']};
const englishStatuses={running:'Generating',ready:'Saved',failed:'Failed',unresolved:'Needs checking',save_pending:'Staged · save pending'};
function Preview({candidate,mobile}:{candidate:Candidate;mobile:boolean}){
  const document=useMemo(()=>typeof window==='undefined'||!candidate.html?'':safeDocument(candidate.html,PREVIEW_POLICY),[candidate.html]);
  return <div className={`${styles.frame} ${mobile?styles.mobile:''}`}>{candidate.html&&<iframe title={`Candidate ${String.fromCharCode(65+candidate.slot)}`} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" srcDoc={document}/>}</div>;
}
export default function RaceWorkspace({controller,state,disabled,onOpen,onEdit}:{controller:RaceController;state:RaceState;disabled:boolean;onOpen:(appId:string,versionId:string,isCurrent?:()=>boolean)=>Promise<void>;onEdit:(prompt:string)=>void}){
  const {locale}=useHostLocale(),en=locale==='en';const [selected,setSelected]=useState(0),[compare,setCompare]=useState(false),[mobile,setMobile]=useState(false),[retryConfirm,setRetryConfirm]=useState<string|null>(null);
  const group=state.group;
  if(!group&&!state.pending&&!state.retry&&!state.error)return null;
  const shown=group?(compare?group.candidates:[group.candidates[selected]||group.candidates[0]]):[];
  const locked=disabled||state.busy;
  return <section className={styles.root} aria-label={en?'Candidate workspace':'赛马工作区'}>
    <header><strong>{en?'Compare candidates here':'赛马 · 比较后采用'}</strong>{group&&<span>{group.candidates.filter(c=>c.status==='ready').length} / {group.count} {en?'saved':'路已保存'}</span>}</header>
    <p className={styles.hint}>{group?.prompt||state.pending?.prompt||state.submitted?.prompt}</p>
    {state.error&&<p role="alert" className={styles.error}>{state.error}</p>}
    {state.notice&&<p role="status" className={styles.hint}>{state.notice}</p>}
    <div className={styles.actions}>
      {(group||state.pending||state.retry)&&<button type="button" disabled={locked} onClick={()=>controller.resume()}>{en?'Check original results · no model call':'核对原结果 · 不调用模型'}</button>}
      {(state.pending||state.retry)&&<button type="button" disabled={locked} onClick={()=>void controller.continueOriginal()}>{en?'Continue original request · same ID':'继续原请求 · 沿用原编号'}</button>}
      {(state.busy||(!state.paused&&controller.blocked))&&<button type="button" onClick={()=>controller.stop()}>{en?'Stop waiting':'停止等待'}</button>}
      {state.error&&state.submitted&&<button type="button" disabled={locked} onClick={()=>onEdit(state.submitted!.prompt)}>{en?'Edit original request':'编辑原需求'}</button>}
      <a href="/compare">{en?'Saved comparison history':'已保存方案历史'}</a>
    </div>
    {(state.pending||state.retry)&&<p className={styles.hint}>{en?'Original request retained. Reloading only checks results. Continue reuses this ID; a model call starts only if this original request has not executed.':'原请求编号已保留。刷新仅核对结果。手动继续会沿用原编号；仅原请求尚未执行时才开始调用模型。'} <code>{state.retry?.requestId||state.pending?.requestId}</code></p>}
    {group&&<>
      <p className={styles.hint}>{group.mode==='demo'?(en?'Preset demo · 0 real model calls':'预设示例 · 0 次真实模型调用'):`${group.model} · ${en?'Model calls':'模型调用'} ${group.reservedModelCalls}`} · {en?'Adoption checks the live app version again.':'采用时再次检查应用当前版本。'}</p>
      <div className={styles.tabs} role="group" aria-label={en?'Candidates':'候选方案'}>{group.candidates.map(c=><button type="button" key={c.id} aria-pressed={selected===c.slot} onClick={()=>setSelected(c.slot)}>{String.fromCharCode(65+c.slot)} · {en?englishStatuses[c.status]:statuses[c.status]}</button>)}</div>
      <div className={styles.actions}><label><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>{en?'Compare side by side':'并排比较'}</label><label><input type="checkbox" checked={mobile} onChange={e=>setMobile(e.target.checked)}/>{en?'Mobile preview':'手机预览'}</label></div>
      <div className={`${styles.grid} ${compare?styles.compare:''}`}>{shown.map(c=><article key={c.id}>
        <h3>{String.fromCharCode(65+c.slot)} · {c.strategy}</h3>
        <p role={c.status==='running'?'status':undefined}>{en?englishStatuses[c.status]:statuses[c.status]}{c.errorCode&&` · ${failures[c.errorCode]?.[en?1:0]||(en?'Could not finish; check the original result':'暂未完成，请核对原结果')}`}</p>
        {c.html&&<Preview candidate={c} mobile={mobile}/>}
        <div className={styles.actions}>
          {c.status==='save_pending'&&<button type="button" disabled={locked} onClick={()=>void controller.saveLane(c)}>{en?'Save staged result · 0 model calls':'保存暂存结果 · 0 次模型调用'}</button>}
          {c.status==='failed'&&<button type="button" disabled={locked||controller.blocked} onClick={()=>setRetryConfirm(c.id)}>{en?'Retry this lane':'仅重试此路'}</button>}
          {c.status==='unresolved'&&<button type="button" disabled={locked} onClick={()=>void controller.check()}>{en?'Check original attempt':'核对原尝试'}</button>}
          {c.status==='ready'&&(c.adoptedAppId?<button type="button" disabled={locked} onClick={()=>void onOpen(c.adoptedAppId!,c.adoptedVersionId!)}>{en?'Open adopted app':'打开已采用应用'}</button>:<><button type="button" disabled={locked} onClick={()=>void controller.adopt(c,false,onOpen)}>{en?'Adopt and open':group.appId?'采用到原应用并打开':'采用并打开应用'}</button>{group.appId&&<button type="button" disabled={locked} onClick={()=>void controller.adopt(c,true,onOpen)}>{en?'Save independent app copy':'另存独立应用副本'}</button>}</>)}
        </div>
        {retryConfirm===c.id&&<div className={styles.confirmation}><p>{group.mode==='model'?(en?'Retry only this failed lane with one additional paid model call?':'仅重新生成这一失败方案，将新增 1 次真实模型调用并可能产生费用。其他方案保留。'):(en?'Retry this preset demo lane with 0 model calls?':'重新生成此路预设示例，0 次真实模型调用。其他方案保留。')}</p><div className={styles.actions}><button type="button" disabled={locked||controller.blocked} onClick={()=>{setRetryConfirm(null);void controller.retryLane(c)}}>{en?'Confirm retry':'确认重试此路'}</button><button type="button" onClick={()=>setRetryConfirm(null)}>{en?'Cancel':'取消'}</button></div></div>}
      </article>)}</div>
      <p className={styles.hint}>{en?'Candidate previews verify interaction only; application data saving connects after adoption. A changed source version keeps candidates intact; save an independent copy if needed.':'候选预览只验证交互；采用后才接入应用数据保存。请实际检查业务交互后采用。原应用版本变化时候选仍保留，可明确另存独立应用副本。'}</p>
    </>}
  </section>;
}
