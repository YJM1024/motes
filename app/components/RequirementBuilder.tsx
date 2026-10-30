'use client';

import { useMemo, useState } from 'react';
import { appendRequirementDraft, buildRequirementDraft, EMPTY_REQUIREMENT_FIELDS, findRequirementConflicts, REQUIREMENT_DRAFT_LIMIT, type RequirementFields } from '@/lib/motes/requirement-draft';
import styles from './RequirementBuilder.module.css';

type Props = { draft: string; onApply: (text: string, placement: 'append' | 'replace') => void; disabled?: boolean };

const fieldMeta: Array<{ key: keyof RequirementFields; label: string; placeholder: string; rows?: number }> = [
  { key: 'targetUser', label: '目标用户', placeholder: '例如：经常出差的个人用户' },
  { key: 'mainActions', label: '主要操作', placeholder: '例如：添加支出、按类别筛选、查看月度汇总', rows: 3 },
  { key: 'preserve', label: '必须保留', placeholder: '记录需要保留的内容或已有流程', rows: 2 },
  { key: 'style', label: '风格', placeholder: '例如：简洁、信息层级清晰' },
  { key: 'device', label: '设备', placeholder: '例如：手机优先，也适配桌面' },
  { key: 'constraints', label: '限制', placeholder: '例如：不需要账号登录；数据仅保存在本机', rows: 2 },
];

export default function RequirementBuilder({ draft, onApply, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<RequirementFields>({ ...EMPTY_REQUIREMENT_FIELDS });
  const [structuredDraft, setStructuredDraft] = useState('');
  const [pendingApply, setPendingApply] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const conflicts = useMemo(() => findRequirementConflicts(Object.values(fields).join('\n')), [fields]);
  const hasFields = Object.values(fields).some(value => value.trim());
  const tooLong = structuredDraft.length > REQUIREMENT_DRAFT_LIMIT;
  const appendTooLong = draft.trim().length > 0 && draft.length + 2 + structuredDraft.length > REQUIREMENT_DRAFT_LIMIT;

  function update(key: keyof RequirementFields, value: string) {
    setFields(current => ({ ...current, [key]: value }));
    setMessage('');
    setNotice('');
  }
  function generate() {
    setPendingApply(false); setMessage(''); setNotice('');
    if (!hasFields) { setStructuredDraft(''); setMessage('先填写至少一项需求，再生成结构化草稿。'); return; }
    if (conflicts.length) { setMessage('需求中有可能互相冲突的描述，请核对并修改后再生成。'); return; }
    const next = buildRequirementDraft(fields);
    if (next.length > REQUIREMENT_DRAFT_LIMIT) { setStructuredDraft(next); setMessage(`草稿为 ${next.length} 字，超过 ${REQUIREMENT_DRAFT_LIMIT} 字上限，请精简。`); return; }
    setStructuredDraft(next);
  }
  function apply(placement: 'append' | 'replace') {
    try {
      if (placement === 'append') appendRequirementDraft(draft, structuredDraft);
      else if (!structuredDraft.trim() || structuredDraft.length > REQUIREMENT_DRAFT_LIMIT) throw new Error(`需求需为 1–${REQUIREMENT_DRAFT_LIMIT} 字。`);
      onApply(structuredDraft, placement);
      setPendingApply(false);
      setNotice(placement === 'append' ? '已追加到当前需求；尚未发送。' : '已替换当前需求；尚未发送。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '暂时无法填入需求。'); }
  }
  function resetFields() {
    setFields({ ...EMPTY_REQUIREMENT_FIELDS });
    setPendingApply(false); setMessage('');
    setNotice('已清空这六项填写；当前需求和已生成草稿保留。');
  }

  return <section className={styles.root} aria-label="结构化需求编辑器">
    <button type="button" className={styles.disclosure} aria-expanded={open} aria-controls="requirement-builder-panel" onClick={() => setOpen(value => !value)} disabled={disabled}>
      <span><strong>按要点整理需求</strong><small>可选填写六项，生成后仍可编辑</small></span><span aria-hidden="true">{open ? '收起' : '展开'}</span>
    </button>
    {open && <div id="requirement-builder-panel" className={styles.panel}>
      <div className={styles.fieldGrid}>{fieldMeta.map(({ key, label, placeholder, rows }) => <label key={key} className={styles.field}>{label}{rows ? <textarea rows={rows} value={fields[key]} disabled={disabled} onChange={event => update(key, event.target.value)} placeholder={placeholder} /> : <input value={fields[key]} disabled={disabled} onChange={event => update(key, event.target.value)} placeholder={placeholder} />}</label>)}</div>
      {!!conflicts.length && <div className={styles.warning} role="alert"><strong>请核对可能冲突的内容</strong><ul>{conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul></div>}
      <div className={styles.actions}><button type="button" onClick={resetFields} disabled={disabled}>仅清空六项填写</button><span>{structuredDraft.length.toLocaleString()} / {REQUIREMENT_DRAFT_LIMIT} 字</span><button type="button" className={styles.primary} onClick={generate} disabled={disabled || conflicts.length > 0}>生成结构化草稿</button></div>
      {message && <p className={styles.error} role="alert">{message}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {structuredDraft && <div className={styles.result}><label htmlFor="structured-requirement-draft">可编辑的结构化草稿</label><textarea id="structured-requirement-draft" rows={7} maxLength={REQUIREMENT_DRAFT_LIMIT + 1} value={structuredDraft} disabled={disabled} onChange={event => { setStructuredDraft(event.target.value); setPendingApply(false); setMessage(''); setNotice(''); }} /><div className={styles.applyActions}>{pendingApply ? <><span>当前已有需求，请选择如何填入；不会自动发送。</span><button type="button" onClick={() => { setPendingApply(false); setMessage(''); }}>取消</button><button type="button" onClick={() => apply('append')} disabled={disabled || tooLong || appendTooLong}>追加</button><button type="button" className={styles.primary} onClick={() => apply('replace')} disabled={disabled || tooLong}>替换</button></> : <button type="button" onClick={() => { setMessage(''); if (draft.trim()) setPendingApply(true); else apply('replace'); }} disabled={disabled || tooLong || conflicts.length > 0}>填入当前需求</button>}</div>{(tooLong || appendTooLong) && <p className={styles.error}>{tooLong ? `请将结构化草稿精简到 ${REQUIREMENT_DRAFT_LIMIT} 字以内。` : `追加会超过 ${REQUIREMENT_DRAFT_LIMIT} 字上限，请精简当前需求或选择替换。`}</p>}</div>}
      <p className={styles.footnote}>只整理你填写的内容；不会补写空项、调用模型或发送需求。</p>
    </div>}
  </section>;
}
