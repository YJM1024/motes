import { translateHostMessage, type HostLocale, type HostMessageKey } from './index';

// Exact, bounded host notices only; unknown API details are preserved verbatim.
const noticeKeys = [
  "正在核对原请求的持久保存结果…",
  "已停止本页核对；不会取消已经开始的服务端调用或费用。",
  "已找到原请求保存的结果。",
  "原请求结果已暂存7天，可仅重试保存，不会重新调用模型。",
  "原请求已确认失败，可以重新发送。",
  "原请求已超出有效处理时限，可以重新发送。",
  "暂未找到原请求。重试会沿用原编号，避免重复发送。",
  "自动核对已暂停，结果尚未确认。可手动再次检查；停止等待不保证取消服务端调用或费用。",
  "原请求仍在有效处理时限内，正在核对结果；不代表页面会让任务在后台持续执行。",
  "暂时无法取回结果，稍后继续核对同一请求。",
  "正在核对刷新前的原请求，请勿重复发送。",
  "会话已失效，请重新连接后核对。",
  "暂时无法查询原请求。",
  "请求状态响应无效。",
  "保存结果尚未完整返回。",
  "原请求核对响应不匹配。",
  "当前工作空间尚未确认。",
  "浏览器存储不可用，清理未确认完成，请重新核对；没有删除云端作品或身份。",
  "当前没有可用于准备修复的运行诊断。"
] as const satisfies readonly HostMessageKey[];
const known = new Set<string>(noticeKeys);
export function homeNotice(locale: HostLocale, message: string | undefined): string {
  if (!message) return '';
  if (known.has(message)) return translateHostMessage(locale, message as typeof noticeKeys[number]);
  const limit = /^填入后需求将超过 (4000) 字，请替换当前需求或先精简草稿。$/.exec(message);
  return limit ? translateHostMessage(locale, '填入后需求将超过 {limit} 字，请替换当前需求或先精简草稿。', {limit:limit[1]}) : message;
}
