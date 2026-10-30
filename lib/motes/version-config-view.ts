export type VersionConfigOperation = 'generate' | 'modify' | 'element' | 'manual' | 'candidate' | 'template-copy' | 'fork';
export type VersionConfigSettings = { creationMode: string; previewDevice: string; autoFollow: boolean; showWaitTimer: boolean; language: string; visualStyle: string; model?: string };
export type VersionConfigChange = { key: string; before: string | boolean | null; after: string | boolean | null };
export type VersionConfigSnapshot = {
  versionId: string;
  recorded: boolean;
  operation?: VersionConfigOperation;
  baseVersionId?: string | null;
  settings?: VersionConfigSettings | null;
  recordedAt?: string;
  changes: VersionConfigChange[] | null;
  limits: { apps: number; versions: number };
  note: string;
};

const operationLabels: Record<VersionConfigOperation, string> = {
  generate: '新建生成', modify: '版本修改', element: '选中元素修改', manual: '手动源码编辑', candidate: '候选方案采用', 'template-copy': '模板复制', fork: '应用副本',
};
const settingLabels: Record<string, string> = {
  creationMode: '创建模式', previewDevice: '预览设备', autoFollow: '自动跟随新消息', showWaitTimer: '显示等待计时', language: '生成语言', visualStyle: '视觉风格', model: '模型名称',
};
const valueLabels: Record<string, string> = {
  demo: '示例', model: '模型', desktop: '桌面', mobile: '手机', 'zh-CN': '简体中文', en: 'English', minimal: '简洁', soft: '柔和', bold: '鲜明',
};

type DisplayLocale = 'zh-CN' | 'en';
const englishLabels: Readonly<Record<string,string>> = {
  "新建生成": "Initial generation",
  "版本修改": "Version modification",
  "选中元素修改": "Selected element change",
  "手动源码编辑": "Manual source edit",
  "候选方案采用": "Candidate adoption",
  "模板复制": "Template copy",
  "应用副本": "App copy",
  "创建模式": "Creation mode",
  "预览设备": "Preview device",
  "自动跟随新消息": "Follow new messages",
  "显示等待计时": "Show wait timer",
  "生成语言": "Generated app language",
  "视觉风格": "Visual style",
  "模型名称": "Model name",
  "示例": "Demo",
  "模型": "Model",
  "桌面": "Desktop",
  "手机": "Mobile",
  "简体中文": "简体中文",
  "简洁": "Minimal",
  "柔和": "Soft",
  "鲜明": "Bold",
  "此版本未记录当时的生成配置。为避免猜测，无法还原它使用的设置。": "This version did not record its generation settings. They cannot be reconstructed without guessing.",
  "以下为版本创建时记录的有效设置，不代表当前工作区的设置。": "These effective settings were recorded when the version was created. They do not represent current workspace settings.",
  "此操作没有使用生成模型配置，因此没有生成设置快照。": "This operation did not use generation model settings, so no generation settings snapshot exists.",
  "此版本没有可显示的生成设置快照。": "No generation settings snapshot is available for this version.",
  "未记录操作类型": "Operation type not recorded",
  "未识别设置": "Unknown setting",
  "未显示": "Not shown",
  "无": "None",
  "开启": "On",
  "关闭": "Off",
  "时间未记录": "Time not recorded"
};
// Only controlled schema labels use this lookup. Raw model names and unknown values stay unchanged.
function label(value:string,locale:DisplayLocale):string { return locale === 'en' ? englishLabels[value] ?? value : value; }

export function versionConfigStatus(snapshot: Pick<VersionConfigSnapshot, 'recorded' | 'operation' | 'settings'>, locale:DisplayLocale='zh-CN'): string {
  if (!snapshot.recorded) return label('此版本未记录当时的生成配置。为避免猜测，无法还原它使用的设置。',locale);
  if (snapshot.settings) return label('以下为版本创建时记录的有效设置，不代表当前工作区的设置。',locale);
  if (snapshot.operation === 'manual' || snapshot.operation === 'template-copy' || snapshot.operation === 'fork') return label('此操作没有使用生成模型配置，因此没有生成设置快照。',locale);
  return label('此版本没有可显示的生成设置快照。',locale);
}

export function versionConfigOperationLabel(operation: VersionConfigOperation | undefined = undefined, locale:DisplayLocale='zh-CN'): string {
  return label(operation ? operationLabels[operation] : '未记录操作类型',locale);
}

export function versionConfigSettingLabel(key: string, locale:DisplayLocale='zh-CN'): string {
  return label(Object.hasOwn(settingLabels,key) ? settingLabels[key] : '未识别设置',locale);
}

export function formatVersionConfigValue(key: string, value: string | boolean | null, locale:DisplayLocale='zh-CN'): string {
  if (!Object.hasOwn(settingLabels,key)) return label('未显示',locale);
  if (value === null) return label('无',locale);
  if (typeof value === 'boolean') return label(value ? '开启' : '关闭',locale);
  if (key === 'model') return value;
  return Object.hasOwn(valueLabels,value) ? label(valueLabels[value],locale) : value;
}

export function formatVersionConfigDate(value: string | undefined = undefined, locale:DisplayLocale='zh-CN'): string {
  if (!value || !Number.isFinite(Date.parse(value))) return label('时间未记录',locale);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
