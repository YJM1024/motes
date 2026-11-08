'use client';
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { projectFiles } from '@/lib/motes/react-project';
import './source-viewer.css';
export default function LiteSourceViewer({ html, number, onClose }: { html: string; number: number; onClose: () => void }) {
  const files = useMemo(() => projectFiles(html), [html]);
  const [path, setPath] = useState('src/App.jsx');
  const file = files.find(file => file.path === path) ?? files[0];
  return <div className="lite-overlay lite-source" role="dialog" aria-modal="true" aria-label="查看源码">
    <header><strong>{files.length > 1 ? 'React + Tailwind 工程' : 'HTML'} · v{number}</strong><button type="button" className="lite-return-preview" onClick={onClose}><ArrowLeft size={14} aria-hidden="true"/>返回预览</button></header>
    <p>只读完整源码。导出会编译成独立 HTML；离开工作台后 SDK 数据桥不可用，输入仅作临时使用。</p>
    <label className="lite-source-picker">源文件<select value={file?.path ?? ''} onChange={event => setPath(event.target.value)}>{files.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}</select></label>
    <pre><code>{file?.content}</code></pre>
  </div>;
}
