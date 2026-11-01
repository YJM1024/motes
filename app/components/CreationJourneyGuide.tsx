"use client";
import { useHostLocale } from './HostLocaleProvider';
import { p0EntryText } from '../../lib/motes/locale/p0-entry';
import styles from './CreationJourneyGuide.module.css';

export default function CreationJourneyGuide({compact=false}:{compact?:boolean}){
  const {locale}=useHostLocale();
  const text=(key:Parameters<typeof p0EntryText>[1])=>p0EntryText(locale,key);
  return <section className={`${styles.guide} ${compact?styles.compact:''}`} aria-label={text('创作流程')}>
    <ol><li>{text('描述需求')}</li><li>{text('生成应用')}</li><li>{text('继续修改')}</li></ol>
    {!compact&&<p>{text('先生成可运行的应用，再通过对话或源码继续调整。')}</p>}
  </section>;
}
