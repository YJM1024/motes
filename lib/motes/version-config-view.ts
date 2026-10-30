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
  creationMode: '创建模式', previewDevice: '预览设备', autoFollow: '自动跟随新消息', showWaitTimer: '显示等待计时', language: '界面语言', visualStyle: '视觉风格', model: '模型名称',
};
const valueLabels: Record<string, string> = {
  demo: '示例', model: '模型', desktop: '桌面', mobile: '手机', 'zh-CN': '简体中文', en: 'English', minimal: '简洁', soft: '柔和', bold: '鲜明',
};

export function versionConfigStatus(snapshot: Pick<VersionConfigSnapshot, 'recorded' | 'operation' | 'settings'>): string {
  if (!snapshot.recorded) return '此版本未记录当时的生成配置。为避免猜测，无法还原它使用的设置。';
  if (snapshot.settings) return '以下为版本创建时记录的有效设置，不代表当前工作区的设置。';
  if (snapshot.operation === 'manual' || snapshot.operation === 'template-copy' || snapshot.operation === 'fork') return '此操作没有使用生成模型配置，因此没有生成设置快照。';
  return '此版本没有可显示的生成设置快照。';
}

export function versionConfigOperationLabel(operation?: VersionConfigOperation): string {
  return operation ? operationLabels[operation] : '未记录操作类型';
}

export function versionConfigSettingLabel(key: string): string {
  return settingLabels[key] ?? '未识别设置';
}

export function formatVersionConfigValue(key: string, value: string | boolean | null): string {
  if (!(key in settingLabels)) return '未显示';
  if (value === null) return '无';
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  if (key === 'model') return value;
  return valueLabels[value] ?? value;
}

export function formatVersionConfigDate(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '时间未记录';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
