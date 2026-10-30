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
    [/仅(?:限)?(?:手机|移动端|移动设备)|只(?:能)?(?:在)?(?:手机|移动端)/i, /仅(?:限)?(?:桌面|电脑|PC)|只(?:能)?(?:在)?(?:桌面|电脑|PC)/i, '同时出现“仅手机”和“仅桌面”要求'],
    [/仅(?:限)?离线|(?:必须|只能)离线/i, /(?:必须|需要|要求).{0,12}(?:联网|在线同步)|(?:实时|自动)同步/i, '同时出现“仅离线”和“需要联网同步”要求'],
  ];
  for (const [first, second, message] of rules) if (first.test(text) && second.test(text)) conflicts.push(message);
  const negativeLogin = /(?:不需要|无需|不要|禁止)(?:用户)?登录/i;
  const positiveLogin = /(?:必须|需要|要求)(?:用户)?(?:先)?登录/i;
  if (negativeLogin.test(text) && positiveLogin.test(text.replace(/(?:不需要|无需|不要|禁止)(?:用户)?登录/gi, ''))) {
    conflicts.push('同时出现“需要登录”和“不需要登录”要求');
  }
  return conflicts;
}

export function appendRequirementDraft(current: string, incoming: string): string {
  const next = current.trim() ? `${current}\n\n${incoming}` : incoming;
  if (!incoming.trim() || next.length > REQUIREMENT_DRAFT_LIMIT) {
    throw new Error(`填入后需求不能超过 ${REQUIREMENT_DRAFT_LIMIT} 字，请精简或选择替换。`);
  }
  return next;
}
