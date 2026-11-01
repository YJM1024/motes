import {displayModeStorageKey} from './display-mode';
import {workbenchLayoutStorageKey} from './workbench-layout';
export const LOCAL_DATA_EVENT='motes.workspace.local-data.v1';
export type LocalDataEvent={workspaceId:string;scope:'drafts'|'display'};
type StorageLike={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void};
function scope(id:string){if(!id||id.length>128)throw new Error('当前工作空间尚未确认。');return id;}
function apply(operations:{storage:StorageLike;key:string;value:string|null}[]){const originals=operations.map(o=>({...o,old:o.storage.getItem(o.key)}));try{for(const o of originals)if(o.value===null)o.storage.removeItem(o.key);else o.storage.setItem(o.key,o.value);}catch(error){for(const o of originals)try{if(o.old===null)o.storage.removeItem(o.key);else o.storage.setItem(o.key,o.old);}catch{}throw new Error('浏览器存储不可用，清理未确认完成，请重新核对；没有删除云端作品或身份。',{cause:error});}return originals.map(o=>o.key);}
export function clearWorkspaceDraftStorage(local:StorageLike,session:StorageLike,workspaceId:string){const id=scope(workspaceId);return apply([{storage:local,key:'motes-build-drafts:'+id,value:'{}'},{storage:session,key:'motes-discussion-drafts:'+id,value:'{}'}]);}
export function resetWorkspaceDisplayStorage(local:StorageLike,workspaceId:string){scope(workspaceId);return apply([{storage:local,key:displayModeStorageKey(workspaceId),value:null},{storage:local,key:workbenchLayoutStorageKey(workspaceId),value:null}]);}
export type UsageAlertPreferences={enabled:boolean;threshold:number};
export const DEFAULT_USAGE_ALERTS:UsageAlertPreferences={enabled:true,threshold:2};
export function usageAlertStorageKey(workspaceId:string){return 'motes:usage-alerts:'+encodeURIComponent(scope(workspaceId));}
export function parseUsageAlerts(value:string|null):UsageAlertPreferences{try{const v=JSON.parse(value??'null');if(v&&v.schemaVersion===1&&typeof v.enabled==='boolean'&&Number.isInteger(v.threshold)&&v.threshold>=0&&v.threshold<=10)return {enabled:v.enabled,threshold:v.threshold};}catch{}return {...DEFAULT_USAGE_ALERTS};}
export function showUsageAlert(remaining:number|null,preferences:UsageAlertPreferences,limitsEnforced=true){return limitsEnforced&&preferences.enabled&&remaining!==null&&Number.isFinite(remaining)&&remaining>=0&&remaining<=preferences.threshold;}
