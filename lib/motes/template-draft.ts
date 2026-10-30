import { TEMPLATE_LIMITS } from './template-types';
export function composeTemplateDraft(current: string, incoming: string, placement: 'replace' | 'append'): string {
  const next = placement === 'append' && current.trim() ? current + '\n\n' + incoming : incoming;
  if (!incoming.trim() || incoming.length > TEMPLATE_LIMITS.prompt || next.length > TEMPLATE_LIMITS.prompt) throw new Error(`填入后需求将超过 ${TEMPLATE_LIMITS.prompt} 字，请替换当前需求或先精简草稿。`);
  return next;
}
