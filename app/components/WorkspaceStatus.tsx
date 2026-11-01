"use client";
/* Production vinext Link/RSC navigation is incompatible; native anchors retain synchronous draft persistence and existing leave guards. */
import {workspaceStatusView} from '../hooks/workspace-status';
import {useEffect,useRef} from 'react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './WorkspaceStatus.module.css';
type QuotaLayer=Record<'model'|'demo',{used:number;remaining:number;limit:number}>;
type Props={limitsEnforced?:boolean;todayModelAttempts?:number|null;visibility:'shared'|'private';limits?:Record<'visitor'|'shared'|'global',QuotaLayer>;ready:boolean;error?:boolean;intent:'build'|'discuss';mode:'demo'|'model';model:string|null;connected:boolean;busy:boolean;remaining:number|null;limit:number|null;day?:string;warning:boolean;onToggleMode:()=>void;onAlertPreferences:()=>void};
export default function WorkspaceStatus(props:Props){
  const {t,locale}=useHostLocale(),root=useRef<HTMLDetailsElement>(null),trigger=useRef<HTMLElement>(null);
  useEffect(()=>{const close=(event:KeyboardEvent|PointerEvent)=>{if(!root.current?.open)return;if(event instanceof KeyboardEvent){if(event.key!=="Escape")return;root.current.open=false;trigger.current?.focus();event.stopPropagation();event.preventDefault();}else if(event.target instanceof Node&&!root.current.contains(event.target))root.current.open=false;};document.addEventListener("keydown",close);document.addEventListener("pointerdown",close);return()=>{document.removeEventListener("keydown",close);document.removeEventListener("pointerdown",close)};},[]);
  const view=workspaceStatusView(props);
  const unlimited=props.limitsEnforced===false;
  const testingMessage=locale==='en'?'No daily request limit during testing. Actual usage is still recorded.':'测试期间不限每日请求次数，仍记录真实用量。';
  function close(){if(root.current)root.current.open=false;trigger.current?.focus();}
  const modeToggleAvailable = props.ready && props.intent === 'build' && (props.mode === 'model' || props.connected);
  const detailMessage = !props.ready
    ? t('设置尚未确认，暂不能发送新请求。')
    : view.kind === 'model-disconnected'
      ? t('模型尚未连接；需求草稿和已保存成果会保留。配置后可继续，或切换到不调用模型的示例模式。')
      : !props.connected && props.intent === 'discuss'
        ? t('讨论需要服务端连接模型，当前草稿会保留。')
        : props.intent === 'discuss'
          ? t('讨论只返回文字，不更新代码版本。')
          : props.mode === 'demo'
            ? t('示例使用已有模板，不调用模型。')
            : !unlimited && props.remaining === 0
              ? t('今日模型额度已用完；已保存成果不会被覆盖。可以查看已有版本或切换到示例模式。')
              : t('AI 构建会调用当前模型并保存新版本。');
  return <details ref={root} className={styles.root}><summary ref={trigger} className={`${styles.summary} ${(!unlimited&&props.warning)||props.visibility==='shared'?styles.warning:''}`}><span className={`${styles.dot} ${view.connectedDot?styles.connected:""}`}/><span>{props.visibility==='shared'?t('公共演示空间'):view.kind==='unconfirmed'?t('设置待核对'):view.kind==='restoring'?t('正在读取当前创作设置'):view.kind==='disconnected'?t('讨论未连接'):view.kind==='model-disconnected'?t('模型未连接'):view.kind==='discussion'?t('文字讨论'):view.kind==='example'?t('预设示例'):props.model||t('AI 模式')}</span>{props.visibility==='shared'?<small>{t('公开共享 · 勿填私密资料')}</small>:view.showQuota&&<small>{props.remaining===null?t('AI 额度未读取'):t('AI 剩余 {remaining}/{limit}',{remaining:props.remaining,limit:props.limit??'—'})}</small>}</summary><div className={styles.details}>{props.visibility==='shared'&&<p><strong>{t('这是公共演示空间；所有访问者都可查看和修改这里的应用、需求及设置。请勿输入私密内容。')}</strong></p>}<p>{detailMessage}</p>{unlimited&&<p>{testingMessage} {locale==='en'?`AI requests today: ${props.todayModelAttempts??'—'}`:`今日 AI 请求：${props.todayModelAttempts??'—'} 次`}</p>}{!unlimited&&props.ready&&props.remaining!==null&&<p>{t('模型额度为最近一次服务端核对结果，额度日 {day} UTC。',{day:props.day??'—'})}</p>}{!unlimited&&props.visibility==='shared'&&<section aria-label={t('三层额度明细')}><strong>{t('三层额度明细')}</strong>{props.limits?(['visitor','shared','global'] as const).map(layer=><p key={layer}>{t(layer==='visitor'?'访客额度':layer==='shared'?'共享空间额度':'全站额度')}：{t('AI')} {props.limits![layer].model.used}/{props.limits![layer].model.limit} ({t('剩余 {count} 次',{count:props.limits![layer].model.remaining})}) · {t('示例')} {props.limits![layer].demo.used}/{props.limits![layer].demo.limit} ({t('剩余 {count} 次',{count:props.limits![layer].demo.remaining})})</p>):<p>{t('三层额度明细暂不可用；下方有效额度仍以服务端核对结果为准。')}</p>}{props.remaining!==null&&<p>{t('按三层剩余额度中的最小值计算')}：{t('AI')} {props.remaining}/{props.limit??'—'}</p>}</section>}{modeToggleAvailable&&<button type="button" disabled={props.busy} onClick={()=>{close();props.onToggleMode();}}>{props.mode==='demo'?t('切换 AI 模式'):t('体验示例')}</button>}<a href="/settings">{t('查看用量与设置')}</a>{!unlimited&&<button type="button" disabled={!props.ready} onClick={()=>{close();props.onAlertPreferences();}}>{t('额度提醒偏好')}</button>}</div></details>;
}
