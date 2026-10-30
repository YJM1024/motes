/** Used only inside an opaque-origin allow-scripts allow-forms iframe; form-action must stay none. */
export const PREVIEW_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";

/** DOMParser normalizes malformed HTML before the policy becomes the first head node. */
export function safeDocument(html:string,policy:string):string {
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('meta[http-equiv]').forEach(node=>{if(node.getAttribute('http-equiv')?.trim().toLowerCase()==='refresh')node.remove();});
  const meta=doc.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content=policy;
  doc.head.insertBefore(meta,doc.head.firstChild);
  return '<!DOCTYPE html>'+doc.documentElement.outerHTML;
}
