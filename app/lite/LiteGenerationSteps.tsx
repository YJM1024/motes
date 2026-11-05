'use client';
import { Check, Circle, CircleAlert, LoaderCircle } from 'lucide-react';
import type { GenerationProgress, GenerationStepId } from '@/lib/motes/workflow-types';

const labels: Record<GenerationStepId, string> = { plan: '规划', execute: '执行', check: '检查', save: '保存' };
const states = { pending: '未开始', running: '进行中', completed: '已完成', failed: '失败' } as const;
export default function LiteGenerationSteps({ progress }: { progress: GenerationProgress }) {
  return <ol className="lite-generation-steps" aria-label="生成步骤">
    {progress.steps.map(step => <li key={step.id} className={`is-${step.state}`} aria-current={step.state === 'running' ? 'step' : undefined}>
      {step.state === 'completed' ? <Check size={13}/> : step.state === 'running' ? <LoaderCircle size={13}/> : step.state === 'failed' ? <CircleAlert size={13}/> : <Circle size={13}/>}
      <span>{labels[step.id]} <small>{states[step.state]}</small></span>
    </li>)}
  </ol>;
}
