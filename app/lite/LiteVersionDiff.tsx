'use client';

import { useMemo, useState } from 'react';
import { compareLines } from '../../lib/motes/line-diff';
import './version-diff.css';
import './source-viewer.css';
import { projectFiles } from '@/lib/motes/react-project';

export type LiteDiffVersion = { id: string; number: number; html: string; createdAt?: string };

export default function LiteVersionDiff({ versions, currentVersionId, onClose }: { versions: LiteDiffVersion[]; currentVersionId: string; onClose: () => void }) {
  const ordered = useMemo(() => [...versions].sort((a, b) => a.number - b.number), [versions]);
  const currentIndex = ordered.findIndex(version => version.id === currentVersionId);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : ordered.find(version => version.id !== currentVersionId);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [wrapLines, setWrapLines] = useState(true);
  const before = ordered.find(version => version.id === beforeId) ?? previous;
  const after = ordered.find(version => version.id === afterId) ?? ordered.find(version => version.id === currentVersionId) ?? ordered.at(-1);
  const [filePath, setFilePath] = useState('src/App.jsx');
  const beforeFiles = useMemo(() => before ? projectFiles(before.html) : [], [before]);
  const afterFiles = useMemo(() => after ? projectFiles(after.html) : [], [after]);
  const paths = [...new Set([...beforeFiles, ...afterFiles].map(file => file.path))];
  const selectedPath = paths.includes(filePath) ? filePath : paths[0];
  const result = useMemo(() => {
    if (!before || !after) return null;
    const diff = compareLines(beforeFiles.find(file => file.path === selectedPath)?.content ?? '', afterFiles.find(file => file.path === selectedPath)?.content ?? '');
    if (diff.limited || diff.coarse) return { rows: null, added: diff.added, removed: diff.removed };
    return { rows: diff.lines.map(line => ({ kind: line.kind === 'same' ? 'context' as const : line.kind, text: line.text, beforeLine: line.left ?? null, afterLine: line.right ?? null })), added: diff.added, removed: diff.removed };
  }, [before, after, beforeFiles, afterFiles, selectedPath]);
  const select = (side: 'before' | 'after', id: string) => side === 'before' ? setBeforeId(id) : setAfterId(id);

  return <div className="lite-overlay lite-version-diff" role="dialog" aria-modal="true" aria-labelledby="lite-version-diff-title">
    <header><strong id="lite-version-diff-title">版本差异</strong><button type="button" aria-label="关闭版本差异" onClick={onClose}>关闭</button></header>
    <div className="lite-diff-pickers">
      <label>基准版本<select value={before?.id ?? ''} onChange={event => select('before', event.target.value)} disabled={ordered.length < 2}><option value="">选择版本</option>{ordered.map(version => <option key={version.id} value={version.id}>版本 {version.number}</option>)}</select></label>
      <span aria-hidden="true">→</span>
      <label>比较版本<select value={after?.id ?? ''} onChange={event => select('after', event.target.value)} disabled={!ordered.length}><option value="">选择版本</option>{ordered.map(version => <option key={version.id} value={version.id}>版本 {version.number}</option>)}</select></label>
    </div>
    {paths.length > 1 && <label className="lite-diff-file">源文件<select value={selectedPath} onChange={event => setFilePath(event.target.value)}>{paths.map(path => <option key={path} value={path}>{path}</option>)}</select></label>}
    {ordered.length < 2 ? <p className="lite-diff-empty">还没有可比较的其他保存版本。</p>
      : result?.rows === null ? <p className="lite-diff-empty">这两个版本的代码量超过当前对比预算，暂时无法安全展示行级差异。</p>
      : result && before && after && before.id === after.id ? <p className="lite-diff-empty">选择了同一版本，没有差异。</p>
      : result ? <>
        <div className="lite-diff-summary"><p className="lite-diff-count">新增 {result.added} 行 · 删除 {result.removed} 行</p><label className="lite-diff-wrap-toggle"><input type="checkbox" checked={wrapLines} onChange={event => setWrapLines(event.target.checked)}/>自动换行</label></div>
        <div className={`lite-diff-code${wrapLines ? ' is-wrapped' : ''}`} role="region" aria-label="代码行差异" tabIndex={0}><table><tbody>{result.rows.map((row, index) => <tr className={`lite-diff-${row.kind}`} key={`${row.kind}-${row.beforeLine ?? '-'}-${row.afterLine ?? '-'}-${index}`}>
          <td className="lite-diff-mark">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}</td><td className="lite-diff-line">{row.beforeLine ?? ''}</td><td className="lite-diff-line">{row.afterLine ?? ''}</td><td className="lite-diff-text"><code>{row.text || ' '}</code></td>
        </tr>)}</tbody></table></div>
      </> : <p className="lite-diff-empty">请选择两个版本。</p>}
  </div>;
}
