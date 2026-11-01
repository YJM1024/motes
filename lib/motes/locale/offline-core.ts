export const offlineCoreMessages={
 '已恢复本浏览器保存的源码草稿；预览未改变。':'Restored the source draft saved in this browser. The preview is unchanged.',
 '本浏览器无法保存离线源码草稿，请保留内容或导出。':'This browser cannot save the source draft offline. Keep the content or export it.',
 '离线时无法核对实时用量。':'Live usage cannot be checked offline.',
 '离线时此操作不可用；真实 AI 不会被离线执行或排队。':'This action is unavailable offline. Real AI requests are never executed or queued offline.',
 '本地版本已变化，请保留内容并重新核对。':'The local version changed. Keep your content and review it again.',
 '离线副本不可用或尚未缓存；请联网读取后再试。':'The offline copy is unavailable or has not been cached. Read it online and try again.',
} as const;
export function offlineCoreText(key:keyof typeof offlineCoreMessages){return typeof document!=='undefined'&&document.documentElement.lang==='en'?offlineCoreMessages[key]:key}
