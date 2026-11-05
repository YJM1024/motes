import type { GenerationProgress, GenerationStepId } from '@/lib/motes/workflow-types';

const stepIds: GenerationStepId[] = ['plan', 'execute', 'check', 'save'];
export type ProgressQuery = (requestId: string, signal: AbortSignal) => Promise<{ requestId: string; status?: string; progress?: GenerationProgress }>;
export type ProgressWait = (milliseconds: number, signal: AbortSignal) => Promise<void>;

export function isGenerationProgress(value: unknown, requestId: string): value is GenerationProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as GenerationProgress;
  return progress.requestId === requestId && Array.isArray(progress.steps) && progress.steps.length === 4 &&
    stepIds.every(id => progress.steps.some(step => step.id === id && ['pending', 'running', 'completed', 'failed'].includes(step.state)));
}

function waitVisible(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', update); signal.removeEventListener('abort', finish); resolve(); };
    const update = () => {
      if (signal.aborted) return finish();
      if (document.visibilityState === 'hidden') { if (timer) clearTimeout(timer); timer = undefined; }
      else if (!timer) timer = setTimeout(finish, milliseconds);
    };
    signal.addEventListener('abort', finish, { once: true });
    document.addEventListener('visibilitychange', update);
    update();
  });
}

/** Read-only, serialized progress polling. It never accepts a generation result. */
export async function pollGenerationProgress(requestId: string, signal: AbortSignal, query: ProgressQuery, onProgress: (progress: GenerationProgress) => void, wait: ProgressWait = waitVisible): Promise<void> {
  const deadline = Date.now() + 210000;
  let initialMissing = 0, observedRequest = false;
  while (!signal.aborted && Date.now() < deadline) {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { await wait(2000, signal); continue; }
    try {
      const result = await query(requestId, signal);
      if (signal.aborted || result.requestId !== requestId) return;
      // The first GET can arrive before the active POST reserves its request row.
      // Allow at most 15 read-only checks for that race; never reissue the POST.
      if (result.status === 'not-found') {
        if (observedRequest || ++initialMissing >= 15) return;
      } else observedRequest = true;
      if (isGenerationProgress(result.progress, requestId)) onProgress(result.progress);
      if (['done', 'failed', 'expired', 'save_pending'].includes(result.status || '')) return;
    } catch { if (signal.aborted) return; /* Keep the last known state; a read failure is not a failed step. */ }
    await wait(2000, signal);
  }
}
