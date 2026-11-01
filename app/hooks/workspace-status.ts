export function workspaceStatusView(value:{ready:boolean;intent:'build'|'discuss';mode:'demo'|'model';connected:boolean;warning:boolean;error?:boolean}) {
  const kind=!value.ready?value.error?'unconfirmed':'restoring':value.intent==='discuss'?!value.connected?'disconnected':'discussion':value.mode==='demo'?'example':!value.connected?'model-disconnected':'model';
  const modelActive=value.ready&&value.connected&&(value.intent==='discuss'||value.mode==='model');
  return {kind,connectedDot:modelActive,showQuota:value.ready&&(modelActive||value.warning)};
}
