export type PromptTemplate = { id: string; name: string; prompt: string; createdAt: string; updatedAt: string };
export type BuiltinPrompt = { id: string; name: string; prompt: string; readonly: true };
export type TemplateLibrary = { templates: PromptTemplate[]; builtins: BuiltinPrompt[]; total: number; limits: { templates: number; name: number; prompt: number } };
export type TemplateAction = { action: 'create'; name: string; prompt: string; requestId: string } | { action: 'update'; id: string; name?: string; prompt?: string; requestId: string } | { action: 'delete'; id: string; requestId: string };
export const TEMPLATE_LIMITS = { templates: 50, name: 80, prompt: 4000 };
export const BUILTIN_PROMPTS: BuiltinPrompt[] = [
  { id: 'builtin:travel', name: '旅行预算规划', prompt: '帮我做一个旅行预算规划工具，可以添加交通、住宿和餐饮支出，设置预算上限。', readonly: true },
  { id: 'builtin:board', name: '轻量任务看板', prompt: '帮我做一个任务看板，可以添加任务，在待办、进行中和已完成之间移动。', readonly: true },
  { id: 'builtin:timer', name: '专注番茄钟', prompt: '帮我做一个番茄钟，支持专注倒计时、暂停和重新开始。', readonly: true },
];
