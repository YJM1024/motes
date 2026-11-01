/** Browser-only durable storage. No credentials, model keys or automatic network writes. */
export type OfflineEntry<T=unknown>={id:string;workspaceId:string;type:string;value:T;updatedAt:string};
export interface OfflineStore{
 get<T>(id:string):Promise<OfflineEntry<T>|undefined>;
 list<T>(workspaceId:string,type:string):Promise<OfflineEntry<T>[]>;
 atomic<T>(ids:string[],change:(values:Map<string,OfflineEntry>)=>T):Promise<T>;
}
export class OfflineError extends Error{constructor(public code:string,message=code){super(message)}}
let opening:Promise<IDBDatabase>|undefined;
function database(){
 if(typeof indexedDB==='undefined')return Promise.reject(new OfflineError('storage_unavailable'));
 opening??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('motes-offline-v1',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('entries',{keyPath:'id'});store.createIndex('scope',['workspaceId','type'])};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=undefined};resolve(db)};request.onerror=()=>{opening=undefined;reject(new OfflineError('storage_unavailable'))};request.onblocked=()=>{opening=undefined;reject(new OfflineError('storage_blocked'))}});
 return opening;
}
function result<T>(request:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new OfflineError('storage_unavailable'))})}
export const browserOfflineStore:OfflineStore={
 async get<T>(id:string){const db=await database();return result(db.transaction('entries').objectStore('entries').get(id)) as Promise<OfflineEntry<T>|undefined>},
 async list<T>(workspaceId:string,type:string){const db=await database();return result(db.transaction('entries').objectStore('entries').index('scope').getAll(IDBKeyRange.only([workspaceId,type]))) as Promise<OfflineEntry<T>[]>},
 async atomic<T>(ids:string[],change:(values:Map<string,OfflineEntry>)=>T){
  const db=await database();return new Promise<T>((resolve,reject)=>{const transaction=db.transaction('entries','readwrite'),store=transaction.objectStore('entries');let returned:T,failed=false;
   transaction.oncomplete=()=>{if(!failed){globalThis.dispatchEvent?.(new Event('motes-offline-change'));resolve(returned)}};
   transaction.onabort=transaction.onerror=()=>reject(new OfflineError('storage_unavailable'));
   Promise.all([...new Set(ids)].map(async id=>[id,await result(store.get(id))] as const)).then(rows=>{const values=new Map(rows.filter((row):row is readonly[string,OfflineEntry]=>!!row[1]));try{returned=change(values);for(const id of new Set(ids)){const value=values.get(id);if(value)store.put(value);else store.delete(id)}}catch(error){failed=true;transaction.abort();reject(error)}}).catch(()=>transaction.abort());
  });
 }
};
export const offlineId=(workspaceId:string,type:string,id:string)=>JSON.stringify([workspaceId,type,id]);
export function entry<T>(workspaceId:string,type:string,id:string,value:T):OfflineEntry<T>{return{id:offlineId(workspaceId,type,id),workspaceId,type,value,updatedAt:new Date().toISOString()}}
