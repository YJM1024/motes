const en = {
  '创作流程':'Creation flow', '创作方式':'Creation mode', '描述需求':'Describe the request', '生成应用':'Generate an app', '继续修改':'Keep refining',
  '描述你想做什么':'Describe what you want to make', '先生成可运行的应用，再通过对话或源码继续调整。':'Generate a working app, then refine it through chat or source editing.',
  '单次创作':'Single creation', '赛马比较':'Compare options', '比较方案数量':'Number of options', '选择目标项目':'Choose a target project',
  '{count} 个方案':'{count} options', '查看比较设置':'Review comparison settings',
  '仅准备需求并打开比较页；不会在此发送或调用模型。':'This prepares the request and opens comparison settings. It does not submit or call a model.',
  '无法安全保存本次跳转内容；请复制需求后再打开比较页。':'This handoff could not be stored. Copy the request before opening comparison settings.',
  '比较页尚未恢复本次跳转内容。请检查浏览器存储后，从工作台重新打开。':'The comparison page could not restore this handoff. Check browser storage and reopen it from the workspace.',
  '本次跳转内容已过期。请从工作台重新打开比较页。':'This handoff expired. Reopen comparison from the workspace.',
  '工作空间不匹配，本次跳转内容已清除。请从当前工作空间重新打开比较页。':'The handoff belonged to another workspace and was cleared. Reopen comparison from this workspace.',
  '本次跳转内容无效，已清除。请从工作台重新打开比较页。':'The handoff was invalid and has been cleared. Reopen comparison from the workspace.',
  '找不到原应用或目标项目。请重新选择基准后再继续。':'The original app or target project is unavailable. Choose a new target before continuing.',
  '请选择本次比较的目标项目。':'Choose a target project for this comparison.',
  '原应用基准版本已变化。请明确确认后，使用当前版本继续比较。':'The app has a newer base version. Confirm explicitly to compare against the current version.',
  '使用当前版本作为比较基准':'Use the current version as the comparison base',
  '本次跳转已填入需求；选择比较模式并确认费用后，才会发送请求。':'The request is ready. Choose a comparison mode and confirm any cost before submitting.',
  '当前工作空间':'Current workspace',
} as const;
export type P0EntryMessageKey=keyof typeof en;
export function p0EntryText(locale:'zh-CN'|'en',key:P0EntryMessageKey,params:Readonly<Record<string,string|number>>={}):string{
  const text=locale==='en'?en[key]:key;
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(token,name)=>Object.hasOwn(params,name)?String(params[name]):token);
}
