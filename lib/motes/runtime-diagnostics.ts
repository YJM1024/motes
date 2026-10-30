export const RUNTIME_PROTOCOL = 'motes.preview.runtime.v1';
export const DIAGNOSTIC_LIMITS = { total: 10, perWindow: 3, windowMs: 1500, position: 1000000, repairEntries: 5 };
const errorTypes = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'EvalError', 'URIError', 'AggregateError', 'UnhandledRejection'] as const;
export type RuntimeDiagnostic = { kind: 'error' | 'unhandledrejection'; errorType: typeof errorTypes[number]; line: number; column: number };
type DiagnosticEvent = { source: unknown; origin: string; data: unknown };
export function diagnosticFromEvent(event: DiagnosticEvent, expectedSource: unknown, channel: string): RuntimeDiagnostic | null {
  if (!expectedSource || event.source !== expectedSource || event.origin !== 'null' || !/^[a-f0-9]{32}$/.test(channel)) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  const allowed = ['protocol','channel','kind','errorType','line','column'];
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some(key => !allowed.includes(key))) return null;
  if (value.protocol !== RUNTIME_PROTOCOL || value.channel !== channel || typeof value.kind !== 'string' || !['error','unhandledrejection'].includes(value.kind)) return null;
  if (typeof value.errorType !== 'string' || value.errorType.length > 32 || !(errorTypes as readonly string[]).includes(value.errorType) || (value.kind === 'error' && value.errorType === 'UnhandledRejection')) return null;
  if (![value.line,value.column].every(p => typeof p === 'number' && Number.isSafeInteger(p) && p >= 0 && p <= DIAGNOSTIC_LIMITS.position)) return null;
  return { kind: value.kind as RuntimeDiagnostic['kind'], errorType: value.errorType as RuntimeDiagnostic['errorType'], line: value.line as number, column: value.column as number };
}
export function diagnosticCollector(channel: string) {
  let start = 0, inWindow = 0, total = 0;
  const seen = new Set<string>();
  return { accept(event: DiagnosticEvent, expectedSource: unknown, now: number): RuntimeDiagnostic | null {
    const value = diagnosticFromEvent(event, expectedSource, channel);
    if (!value || !Number.isFinite(now) || total >= DIAGNOSTIC_LIMITS.total) return null;
    const key = `${value.kind}:${value.errorType}:${value.line}:${value.column}`;
    if (seen.has(key)) return null;
    if (now < start || now - start >= DIAGNOSTIC_LIMITS.windowMs) { start = now; inWindow = 0; }
    if (inWindow >= DIAGNOSTIC_LIMITS.perWindow) return null;
    inWindow++; total++; seen.add(key); return value;
  } };
}
export function runtimeRepairRequest(errors: RuntimeDiagnostic[]): string {
  const safe = errors.filter(value => errorTypes.includes(value.errorType) && ['error','unhandledrejection'].includes(value.kind) && [value.line,value.column].every(p => Number.isSafeInteger(p) && p >= 0 && p <= DIAGNOSTIC_LIMITS.position));
  if (!safe.length) throw new Error('当前没有可用于准备修复的运行诊断。');
  const entries = safe.slice(0, DIAGNOSTIC_LIMITS.repairEntries).map((e, i) => `${i + 1}. ${e.kind === 'unhandledrejection' ? '未捕获 Promise 拒绝' : 'JavaScript 运行错误'}：${e.errorType}${e.line ? `，预览副本第 ${e.line} 行、第 ${e.column} 列` : '，未提供源码位置'}`).join('\n');
  return `请排查并修复当前应用在隔离预览中出现的以下运行问题：\n${entries}\n\n以上仅包含错误类别与预览位置，不含错误原文、运行时输入或堆栈。预览经过安全包装，行列与保存源码可能有偏差。请结合当前应用代码定位原因，保留与修复无关的功能、界面语言和设计。不要通过放宽预览安全约束、使用外部网络或加载依赖来绕过问题。请提供完整单文件 HTML。`;
}
