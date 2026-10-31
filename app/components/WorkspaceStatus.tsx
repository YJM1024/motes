"use client";
import Link from 'next/link';
import {workspaceStatusView} from '../hooks/workspace-status';
import {useEffect,useRef} from 'react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './WorkspaceStatus.module.css';
type Props={ready:boolean;error?:boolean;intent:'build'|'discuss';mode:'demo'|'model';model:string|null;connected:boolean;busy:boolean;remaining:number|null;limit:number|null;day?:string;warning:boolean;onToggleMode:()=>void;onAlertPreferences:()=>void};
export default function WorkspaceStatus(props:Props){
  const {t}=useHostLocale(),root=useRef<HTMLDetailsElement>(null),trigger=useRef<HTMLElement>(null);
  useEffect(()=>{const close=(event:KeyboardEvent|PointerEvent)=>{if(!root.current?.open)return;if(event instanceof KeyboardEvent){if(event.key!=="Escape")return;root.current.open=false;trigger.current?.focus();event.stopPropagation();event.preventDefault();}else if(event.target instanceof Node&&!root.current.contains(event.target))root.current.open=false;};document.addEventListener("keydown",close);document.addEventListener("pointerdown",close);return()=>{document.removeEventListener("keydown",close);document.removeEventListener("pointerdown",close)};},[]);
  const view=workspaceStatusView(props);
  function close(){if(root.current)root.current.open=false;trigger.current?.focus();}
  return <details ref={root} className={styles.root}><summary ref={trigger} className={`${styles.summary} ${props.warning?styles.warning:''}`}><span className={`${styles.dot} ${view.connectedDot?styles.connected:""}`}/><span>{view.kind==='unconfirmed'?t('设置待核对'):view.kind==='restoring'?t('正在读取当前创作设置'):view.kind==='disconnected'?t('讨论未连接'):view.kind==='discussion'?t('文字讨论'):view.kind==='example'?t('预设示例'):props.model||t('AI 模式')}</span>{view.showQuota&&<small>{props.remaining===null?t('AI 额度未读取'):t('AI 剩余 {remaining}/{limit}',{remaining:props.remaining,limit:props.limit??'—'})}</small>}</summary><div className={styles.details}><p>{!props.ready?t('设置尚未确认，暂不能发送新请求。'):!props.connected&&props.intent==='discuss'?t('讨论需要服务端连接模型，当前草稿会保留。'):props.intent==='discuss'?t('讨论只返回文字，不更新代码版本。'):props.mode==='demo'?t('示例使用已有模板，不调用模型。'):t('AI 构建会调用当前模型并保存新版本。')}</p>{props.ready&&props.remaining!==null&&<p>{t('模型额度为最近一次服务端核对结果，额度日 {day} UTC。',{day:props.day??'—'})}</p>}{props.ready&&props.connected&&props.intent==='build'&&<button type="button" disabled={props.busy} onClick={()=>{close();props.onToggleMode();}}>{props.mode==='demo'?t('切换 AI 模式'):t('体验示例')}</button>}<Link href="/settings">{t('查看用量与设置')}</Link><button type="button" disabled={!props.ready} onClick={()=>{close();props.onAlertPreferences();}}>{t('额度提醒偏好')}</button></div></details>;
}
