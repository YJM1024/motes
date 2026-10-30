/** A local hint only, never a paid classifier or an automatic mode switch. */
export function suggestDiscussion(prompt: string): boolean {
  const text = prompt.trim();
  const explicitBuild = /^(?:(?:(?:请帮我|帮我|请)?\s*)(?:创建|生成|构建|做一个|建一个|修改|改成|增加|添加|删除|实现|调整|开发|编写|修复|修正|排查并修复|解决|优化|补全|升级)|(?:please\s+)?(?:build|create|generate|modify|change|add|remove|implement|fix|debug|update)\b)/i.test(text);
  const repairScaffold = /^请排查并修复当前应用在隔离预览中出现的以下运行问题：/.test(text);
  const adoptedBuildScaffold = /^请根据以下已经讨论的方向构建或修改应用。(?:请保留当前应用中与这些需求无关的功能。|内容较长已节选，请先编辑核对完整需求，再发送。)/.test(text);
  if (explicitBuild || repairScaffold || adoptedBuildScaffold) return false;
  return /(?:为什么|如何|怎么|是什么|解释|建议|是否|应该|区别|原因|原理|作用|[?？]$|^(?:why|how|what|explain|should|can you)\b)/i.test(text);
}
export function discussionBuildDraft(question: string, answer: string) {
  const full = `请根据以下已经讨论的方向构建或修改应用。请保留当前应用中与这些需求无关的功能。\n\n原始问题：\n${question}\n\n采用的讨论方向：\n${answer}`;
  if (full.length <= 4000) return { text:full, shortened:false };
  return { text:`请根据以下已经讨论的方向构建或修改应用。内容较长已节选，请先编辑核对完整需求，再发送。\n\n原始问题：\n${question.slice(0,800)}\n\n采用的讨论方向（节选）：\n${answer.slice(0,2900)}`.slice(0,4000),shortened:true };
}
