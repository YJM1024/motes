'use client';

import { useEffect, useRef, useState } from 'react';
import { formatVersionConfigDate, formatVersionConfigValue, versionConfigOperationLabel, versionConfigSettingLabel, versionConfigStatus, type VersionConfigSnapshot } from '@/lib/motes/version-config-view';
import styles from './VersionConfigPanel.module.css';

type Props = { projectId: string; versionId: string; onClose: () => void };

async function readConfig(projectId: string, versionId: string, signal: AbortSignal): Promise<VersionConfigSnapshot> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/config`, { cache: 'no-store', signal });
  const raw = await response.text();
  let value: VersionConfigSnapshot & { error?: string };
  try { value = JSON.parse(raw) as VersionConfigSnapshot & { error?: string }; }
  catch { throw new Error('服务没有返回有效的配置记录，请重试读取。'); }
  if (!response.ok) throw new Error(value.error || `配置记录读取失败（${response.status}）。`);
  if (value.versionId !== versionId || typeof value.recorded !== 'boolean' || !value.limits || typeof value.limits !== 'object' || typeof value.limits.apps !== 'number' || typeof value.limits.versions !== 'number') {
    throw new Error('服务返回的配置记录格式无效。');
  }
  return value;
}

export default function VersionConfigPanel({ projectId, versionId, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const [snapshot, setSnapshot] = useState<VersionConfigSnapshot | null>(null), [loadedKey, setLoadedKey] = useState(''), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const key = `${projectId}\u0000${versionId}`;
  const loading = loadedKey !== key;

  useEffect(() => {
    const element = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); closeButton.current?.focus();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readConfig(projectId, versionId, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setSnapshot(value); setError(''); setLoadedKey(key); } })
      .catch(cause => { if (!controller.signal.aborted) { setSnapshot(null); setError(cause instanceof Error ? cause.message : '配置记录读取失败。'); setLoadedKey(key); } });
    return () => controller.abort();
  }, [projectId, versionId, key, reload]);

  function close() { onClose(); }
  const current = snapshot?.versionId === versionId ? snapshot : null;

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="version-config-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.header}><div><h2 id="version-config-title">版本配置</h2><p>仅显示该版本保存时记录的信息，不会修改或恢复设置。</p></div><button ref={closeButton} type="button" onClick={close} aria-label="关闭版本配置">关闭</button></header>
    <div className={styles.body}>
      {loading ? <p className={styles.status} role="status">正在读取版本配置…</p> : error ? <div className={styles.empty}><p className={styles.error} role="alert">{error}</p><button type="button" onClick={() => { setLoadedKey(''); setError(''); setReload(value => value + 1); }}>重试读取</button></div> : current ? <>
        <p className={styles.status} role="status">{versionConfigStatus(current)}</p>
        {current.note && <p className={styles.note}>{current.note}</p>}
        {current.recorded && current.settings && <section className={styles.settings} aria-label="记录的生成设置"><h3>生成时设置</h3><dl>{Object.entries(current.settings).map(([setting, value]) => <div key={setting}><dt>{versionConfigSettingLabel(setting)}</dt><dd>{formatVersionConfigValue(setting, value)}</dd></div>)}</dl><p>敏感密钥和权限不会记录，也无法从此处恢复。</p></section>}
        {current.recorded && !current.settings && <p className={styles.note}>{versionConfigStatus(current)}</p>}
        <div className={styles.disclosures}>
          <details><summary>来源信息</summary><dl>{current.operation && <div><dt>操作类型</dt><dd>{versionConfigOperationLabel(current.operation)}</dd></div>}{current.baseVersionId && <div><dt>基础版本编号</dt><dd>{current.baseVersionId}</dd></div>}{current.recordedAt && <div><dt>记录时间</dt><dd>{formatVersionConfigDate(current.recordedAt)}</dd></div>}</dl></details>
          <details><summary>配置差异</summary>{!current.recorded ? <p>该版本没有差异记录；不会推测此前配置。</p> : current.changes === null ? <p>此版本未保存配置差异。</p> : current.changes.length ? <dl className={styles.changes}>{current.changes.map((change, index) => <div key={`${change.key}-${index}`}><dt>{versionConfigSettingLabel(change.key)}</dt><dd><span>{formatVersionConfigValue(change.key, change.before)}</span><b aria-hidden="true">→</b><span>{formatVersionConfigValue(change.key, change.after)}</span></dd></div>)}</dl> : <p>没有记录配置差异。</p>}</details>
          <details><summary>容量上限</summary><dl><div><dt>应用数上限</dt><dd>{current.limits.apps}</dd></div><div><dt>单个应用版本上限</dt><dd>{current.limits.versions}</dd></div></dl><p>这里显示服务端上限，不代表当前已用数量。</p></details>
        </div>
      </> : <p className={styles.status}>没有可显示的版本配置记录。</p>}
    </div>
  </dialog>;
}
