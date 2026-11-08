'use client';
import { useLayoutEffect, useState, type RefObject } from 'react';
import { diagnosticCollector, type RuntimeDiagnostic } from '@/lib/motes/runtime-diagnostics';

export default function LiteRuntimeDiagnostics({ frameRef, channel, onRepair }: { frameRef: RefObject<HTMLIFrameElement | null>; channel: string; onRepair: (request: string) => void }) {
  const [errors, setErrors] = useState<RuntimeDiagnostic[]>([]);
  useLayoutEffect(() => {
    const collector = diagnosticCollector(channel);
    const receive = (event: MessageEvent) => {
      const diagnostic = collector.accept(event, frameRef.current?.contentWindow, Date.now());
      if (diagnostic) setErrors(current => [...current, diagnostic].slice(0, 10));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [frameRef, channel]);
  if (!errors.length) return null;
  return <div className="lite-runtime-error" role="alert" aria-label="应用运行错误">
    <strong>运行检查发现问题：{[...new Set(errors.map(e => e.errorType))].join('、')}</strong>
    <p>页面已载入，但运行发生错误，不能视为功能验收通过。原代码版本仍保留。</p>
    <button onClick={() => onRepair('请修复当前应用在隔离预览中发生的运行错误：' + [...new Set(errors.map(e => e.errorType))].join('、') + '。检查空数据初始化、异步保存和 React effect，保留已有功能及业务数据键，按当前工程类型进行最小修改。')}>准备修复需求</button>
  </div>;
}
