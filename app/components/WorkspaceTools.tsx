"use client";
import { useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useHostLocale } from './HostLocaleProvider';
import styles from './WorkspaceTools.module.css';

export type WorkspaceTool = { id:string;label:string;disabled?:boolean;reason?:string } & ({onSelect:()=>void;href?:never}|{href:string;onSelect?:never});
export type WorkspaceToolGroup = {id:string;label:string;items:WorkspaceTool[]};
export default function WorkspaceTools({groups,disabled=false}:{groups:WorkspaceToolGroup[];disabled?:boolean}) {
  const {t}=useHostLocale(),root=useRef<HTMLDetailsElement>(null),trigger=useRef<HTMLElement>(null);
  useEffect(()=>{
    const close=(event:KeyboardEvent|PointerEvent)=>{const element=root.current;if(!element?.open)return;if(event instanceof KeyboardEvent){if(event.key!=='Escape')return;element.open=false;trigger.current?.focus();event.stopPropagation();event.preventDefault();}else if(event.target instanceof Node&&!element.contains(event.target))element.open=false;};
    document.addEventListener('keydown',close);document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close)};
  },[]);
  function activate(item:WorkspaceTool){if(item.disabled)return;if(root.current)root.current.open=false;trigger.current?.focus();item.onSelect?.();}
  return <details ref={root} className={styles.root} onToggle={event=>{if(disabled)event.currentTarget.open=false;}}>
    <summary ref={trigger} className={styles.trigger} aria-disabled={disabled} onClick={event=>{if(disabled)event.preventDefault();}}><MoreHorizontal size={17}/>{t('更多工具')}</summary>
    <div className={styles.menu}>{groups.filter(group=>group.items.length).map(group=><section key={group.id}><h2>{group.label}</h2>{group.items.map(item=><div key={item.id} className={styles.item}>{item.href&&!item.disabled?<a href={item.href} onClick={()=>{if(root.current)root.current.open=false;}}>{item.label}</a>:<button type="button" disabled={item.disabled} aria-describedby={item.reason?'tool-reason-'+item.id:undefined} onClick={()=>activate(item)}>{item.label}</button>}{item.reason&&item.disabled&&<small id={'tool-reason-'+item.id}>{item.reason}</small>}</div>)}</section>)}</div>
  </details>;
}
