export const REQUIREMENT_DRAFT_LIMIT = 4000;

export type RequirementFields = {
  targetUser: string;
  mainActions: string;
  preserve: string;
  style: string;
  device: string;
  constraints: string;
};

export const EMPTY_REQUIREMENT_FIELDS: RequirementFields = {
  targetUser: '', mainActions: '', preserve: '', style: '', device: '', constraints: '',
};

const sections: Array<[keyof RequirementFields, string]> = [
  ['targetUser', '目标用户'],
  ['mainActions', '主要操作'],
  ['preserve', '必须保留'],
  ['style', '风格'],
  ['device', '设备'],
  ['constraints', '限制'],
];

export function buildRequirementDraft(fields: RequirementFields): string {
  return sections.flatMap(([key, label]) => {
    const value = fields[key].trim();
    return value ? [`${label}：${value}`] : [];
  }).join('\n\n');
}

export function findRequirementConflicts(text: string): string[] {
  const conflicts: string[] = [];
  const rules: Array<[RegExp, RegExp, string]> = [
    [/仅(?:限)?(?:手机|移动端|移动设备)|只(?:能)?(?:在)?(?:手机|移动端)/i, /仅(?:限)?(?:桌面|电脑|PC)|只(?:能)?(?:在)?(?:桌面|电脑|PC)/i, '你希望只支持手机，还是也需要桌面？当前描述同时写了“仅手机”和“仅桌面”。'],
    [/仅(?:限)?离线|(?:必须|只能)离线/i, /(?:必须|需要|要求).{0,12}(?:联网|在线同步)|(?:实时|自动)同步/i, '这个应用应只离线使用，还是需要联网同步？当前描述同时包含了两种要求。'],
  ];
  for (const [first, second, message] of rules) if (first.test(text) && second.test(text)) conflicts.push(message);
  const negativeLogin = /(?:不需要|无需|不要|禁止)(?:用户)?登录/i;
  const positiveLogin = /(?:必须|需要|要求)(?:用户)?(?:先)?登录/i;
  if (negativeLogin.test(text) && positiveLogin.test(text.replace(/(?:不需要|无需|不要|禁止)(?:用户)?登录/gi, ''))) {
    conflicts.push('是否需要用户登录？当前描述同时写了“需要登录”和“不需要登录”。');
  }
  return conflicts;
}

export function requirementGuidance(fields: RequirementFields): { suggestions: string[]; needsDataScopeClarification: boolean } {
  const entered = Object.values(fields).some(value => value.trim());
  const hasCoreActions = !!fields.mainActions.trim();
  const suggestions = entered && !hasCoreActions && (!!fields.style.trim() || !!fields.device.trim())
    ? ['还没有说明用户要完成的主要操作；可补充核心操作后再生成草稿。']
    : [];
  const allText = Object.values(fields).join('\n');
  const needsDataScopeClarification = /联网同步|账号|用户登录|持久化|长期保存|云端|服务器|跨设备|保存数据/i.test(allText);
  return { suggestions, needsDataScopeClarification };
}

export function appendRequirementDraft(current: string, incoming: string): string {
  const next = current.trim() ? `${current}\n\n${incoming}` : incoming;
  if (!incoming.trim() || next.length > REQUIREMENT_DRAFT_LIMIT) {
    throw new Error(`填入后需求不能超过 ${REQUIREMENT_DRAFT_LIMIT} 字，请精简或选择替换。`);
  }
  return next;
}
