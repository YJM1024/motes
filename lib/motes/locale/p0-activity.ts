const p0ActivityEnglish={
  '当前状态':'Current status',
  '已记录原因':'Recorded reason',
  '本页请求记录':'Request record from this page',
  '工作记录':'Work record',
  '本页已发起此请求；服务端是否已接收或完成，仍以核对结果为准。':'This page started the request. Check its status to confirm whether the server received or completed it.',
  '已有详情':'Available details',
  '请求编号':'Request ID',
} as const;

export type P0ActivityMessageKey=keyof typeof p0ActivityEnglish;
export function p0ActivityText(locale:'zh-CN'|'en',key:P0ActivityMessageKey):string{
  return locale==='en'?p0ActivityEnglish[key]:key;
}
