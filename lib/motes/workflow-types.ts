export type GenerationStepId = 'plan' | 'execute' | 'check' | 'save';
export type GenerationStepState = 'pending' | 'running' | 'completed' | 'failed';
export type GenerationProgress = {
  requestId: string;
  steps: {id: GenerationStepId; state: GenerationStepState}[];
  updatedAt: string;
};
