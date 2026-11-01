"use client";
import type {RaceController,RaceState} from '@/lib/motes/race-controller';
import {useHostLocale} from './HostLocaleProvider';
import styles from './RaceWorkspace.module.css';
/** Chat timeline contains the request and recovery controls; the full preview lives in the preview pane. */
export default function RaceWorkspace({controller,state,disabled,onEdit}:{controller:RaceController;state:RaceState;disabled:boolean;onEdit:(prompt:string)=>void}){
  const {locale}=useHostLocale(),en=locale==='en';const group=state.group,locked=disabled||state.busy;
  if(!group&&!state.pending&&!state.retry&&!state.error)return null;
  return <div className="conversation-pair"><div className="user-message">{group?.prompt||state.pending?.prompt||state.submitted?.prompt}</div><section className={styles.root} aria-label={en?'Candidate task':'赛马任务'}>
    <header><strong>{en?'Candidates · review before adoption':'赛马 · 比较后采用'}</strong>{group&&<span>{group.candidates.filter(c=>c.status==='ready').length} / {group.count} {en?'saved':'路已保存'}</span>}</header>
    {state.error&&<p role="alert" className={styles.error}>{state.error}</p>}
    {state.notice&&<p role="status" className={styles.hint}>{state.notice}</p>}
    <p className={styles.hint}>{en?'Switch this round’s options above the preview. Your saved app stays unchanged until adoption.':'在预览上方切换本轮方案；采用前不会修改已保存的原应用。'}</p>
    <div className={styles.actions}>
      {(group||state.pending||state.retry)&&<button type="button" disabled={locked} onClick={()=>controller.resume()}>{en?'Check original results · no model call':'核对原结果 · 不调用模型'}</button>}
      {(state.pending||state.retry)&&<button type="button" disabled={locked} onClick={()=>void controller.continueOriginal()}>{en?'Continue original request · same ID':'继续原请求 · 沿用原编号'}</button>}
      {(state.busy||(!state.paused&&controller.blocked))&&<button type="button" onClick={()=>controller.stop()}>{en?'Stop waiting':'停止等待'}</button>}
      {state.error&&state.submitted&&<button type="button" disabled={locked} onClick={()=>onEdit(state.submitted!.prompt)}>{en?'Edit original request':'编辑原需求'}</button>}
      <a href="/compare">{en?'Saved comparison history':'已保存方案历史'}</a>
    </div>
    {(state.pending||state.retry)&&<p className={styles.hint}>{en?'Reloading only checks results. Continue reuses the original ID; a model call starts only if this original request has not executed.':'刷新仅核对结果。手动继续沿用原编号；仅原请求尚未执行时才开始调用模型。'} <code>{state.retry?.requestId||state.pending?.requestId}</code></p>}
  </section></div>;
}
