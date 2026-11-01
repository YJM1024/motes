import type { Candidate, CandidateGroup, CreateCandidates } from './candidate-types';

export class CandidateApiError extends Error {
  constructor(message:string,public status:number,public retry?:string){super(message)}
}
export async function candidateApi<T>(url:string,body?:object,signal?:AbortSignal):Promise<T>{
  const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(200000)]):AbortSignal.timeout(200000)}:{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({error:'服务没有返回有效结果，请核对原请求。'})) as T&{error?:string;retry?:string};
  if(!response.ok||data.error)throw new CandidateApiError(data.error||'操作未完成。',response.status,data.retry);
  return data;
}
export type LaneRetry={groupId:string;requestId:string;candidateId:string;previousAttemptId:string;confirmOneCall:true};
type Saved={submitted?:CreateCandidates;error?:string;startedAt?:number;groupId?:string;pending?:CreateCandidates;retry?:LaneRetry};
export type RaceState={submitted:CreateCandidates|null;startedAt:number;group:CandidateGroup|null;pending:CreateCandidates|null;retry:LaneRetry|null;busy:boolean;paused:boolean;error:string;notice:string;restoring:boolean};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'>;
type Request=<T>(url:string,body?:object,signal?:AbortSignal)=>Promise<T>;
/** One scoped controller owns identities before any POST. Restoring and checking only use GET. */
export class RaceController {
  state:RaceState={submitted:null,startedAt:0,group:null,pending:null,retry:null,busy:false,paused:false,error:'',notice:'',restoring:true};
  private listeners=new Set<()=>void>();
  private epoch=0; private readEpoch=0; private controller:AbortController|null=null; private active=true;
  constructor(readonly key:string,private storage:Storage|undefined,private request:Request=candidateApi,private uuid=()=>crypto.randomUUID()){}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
  snapshot=()=>this.state;
  private update(patch:Partial<RaceState>){if(!this.active)return;this.state={...this.state,...patch};this.listeners.forEach(fn=>fn())}
  private persist(){if(!this.storage)throw new Error("storage unavailable");this.storage.setItem(this.key,JSON.stringify({submitted:this.state.submitted||undefined,error:this.state.error||undefined,startedAt:this.state.startedAt,groupId:this.state.group?.id||this.state.pending?.requestId||this.state.retry?.groupId,pending:this.state.pending||undefined,retry:this.state.retry||undefined}));}
  private save(){try{this.persist();return true}catch{this.update({error:'无法保存原请求编号。请检查浏览器存储后再发送。'});return false}}
  private accept(group:CandidateGroup){
    this.readEpoch++;
    const retry=this.state.retry;
    this.update({group,pending:this.state.pending?.requestId===group.id&&group.candidates.every(c=>['ready','failed','save_pending'].includes(c.status))?null:this.state.pending,retry:retry&&group.candidates.some(c=>c.attemptId===retry.requestId&&['ready','failed','save_pending'].includes(c.status))?null:retry});this.save();
  }
  activate(){this.active=true;}
  async restore(){
    const epoch=this.epoch;
    try{const saved=JSON.parse(this.storage?.getItem(this.key)||'null') as Saved|null;
      if(saved?.submitted&&typeof saved.submitted.prompt==='string'&&typeof saved.submitted.requestId==='string')this.update({submitted:saved.submitted,error:typeof saved.error==='string'?saved.error:''});
      if(saved&&typeof saved.groupId==='string'&&saved.groupId.length<200){
        const pending=saved.pending?.requestId===saved.groupId&&typeof saved.pending.prompt==='string'&&['model','demo'].includes(saved.pending.mode)?saved.pending:null;
        const retry=saved.retry?.groupId===saved.groupId&&saved.retry.confirmOneCall===true&&typeof saved.retry.requestId==='string'&&typeof saved.retry.candidateId==='string'&&typeof saved.retry.previousAttemptId==='string'?saved.retry:null;
        this.update({pending,retry,startedAt:typeof saved.startedAt==='number'?saved.startedAt:Date.now()});await this.check(saved.groupId);
      }
    }catch{if(epoch===this.epoch)this.update({error:'暂时无法读取原方案，请核对已保存结果。'});}
    finally{if(epoch===this.epoch)this.update({restoring:false});}
  }
  get blocked(){return this.state.busy||this.state.restoring||!!this.state.pending||!!this.state.retry||!!this.state.group?.candidates.some(c=>c.status==='running')}
  async check(id=this.state.pending?.requestId||this.state.retry?.groupId||this.state.group?.id){
    if(!id||!this.active)return;const epoch=this.epoch,read=++this.readEpoch;
    try{const result=await this.request<{group:CandidateGroup}>('/api/candidates/'+encodeURIComponent(id));if(this.active&&epoch===this.epoch&&read===this.readEpoch){this.accept(result.group);this.update({error:''});}}
    catch(e){if(this.active&&epoch===this.epoch&&read===this.readEpoch)this.update({error:e instanceof Error?e.message:'核对暂未完成。原请求编号保留，不会再次调用模型。'});}
  }
  private async run(url:string,body:object){
    const epoch=++this.epoch,controller=new AbortController();this.controller=controller;this.update({busy:true,paused:false,error:'',notice:''});
    try{const result=await this.request<{group:CandidateGroup}>(url,body,controller.signal);if(this.active&&epoch===this.epoch){this.accept(result.group);const ready=result.group.candidates.filter(c=>c.status==='ready').length;this.update({notice:ready?`${ready} 路候选已保存。请实际检查后明确采用；失败不会自动重试。`:result.group.candidates.some(c=>c.status==='save_pending')?'候选结果已暂存，请仅重试保存，不会再次调用模型。':'本轮尚无已保存的成功候选。请核对各路状态；不会自动重试。'});}}
    catch(e){if(this.active&&epoch===this.epoch){const rejected=e instanceof CandidateApiError&&(e.retry==='new'||[400,404,422,503].includes(e.status));this.update({...(rejected?{pending:null,retry:null}:{}),error:(e instanceof Error?e.message:'连接中断。')+(rejected?' 本次未开始新的模型调用。可编辑原需求后发送。':' 请核对原结果，避免重复生成。')});this.save();}}
    finally{if(this.active&&epoch===this.epoch){this.controller=null;this.update({busy:false});}}
  }
  async start(body:Omit<CreateCandidates,'requestId'>,onAccepted?:()=>void){
    if(this.blocked||!body.prompt.trim()||![2,3,4].includes(body.count??0))return false;
    const pending={...body,requestId:this.uuid()};this.update({pending,submitted:pending,group:null,retry:null,startedAt:Date.now()});
    if(!this.save()){this.update({pending:null});return false;}
    onAccepted?.();await this.run('/api/candidates',pending);return true;
  }
  /** Explicit replay uses the stored body and receipt; never creates a second identity. */
  async continueOriginal(){
    if(this.state.busy||this.state.restoring||(!this.state.pending&&!this.state.retry)||!this.save())return;
    if(this.state.retry){const {groupId,...body}=this.state.retry;await this.run('/api/candidates/'+encodeURIComponent(groupId)+'/retry',body);}
    else if(this.state.pending)await this.run('/api/candidates',this.state.pending);
  }
  async retryLane(candidate:Candidate){
    if(this.blocked||!this.state.group||candidate.status!=='failed')return;
    const retry:LaneRetry={groupId:this.state.group.id,requestId:this.uuid(),candidateId:candidate.id,previousAttemptId:candidate.attemptId,confirmOneCall:true};
    this.update({retry});if(!this.save()){this.update({retry:null});return;}
    const {groupId,...body}=retry;await this.run('/api/candidates/'+encodeURIComponent(groupId)+'/retry',body);
  }
  async saveLane(candidate:Candidate){if(this.state.busy||!this.state.group)return;await this.run('/api/candidates/'+encodeURIComponent(this.state.group.id)+'/save',{candidateId:candidate.id,attemptId:candidate.attemptId});}
  async adopt(candidate:Candidate,asNew:boolean,open:(appId:string,versionId:string,isCurrent?:()=>boolean)=>Promise<void>){
    if(this.state.busy||!this.state.group||candidate.status!=='ready')return;
    const epoch=++this.epoch;this.update({busy:true,error:''});
    try{const result=await this.request<{appId:string;versionId:string}>('/api/candidates/'+encodeURIComponent(this.state.group.id)+'/adopt',{candidateId:candidate.id,...asNew?{asNew:true}:{}});
      if(!this.active||epoch!==this.epoch)return;
      await open(result.appId,result.versionId,()=>this.active&&epoch===this.epoch);
      if(this.active&&epoch===this.epoch)await this.check();
    }catch(e){if(this.active&&epoch===this.epoch)this.update({error:(e instanceof Error?e.message:'采用未完成。')+' 候选保留，可核对后再打开。'});}
    finally{if(this.active&&epoch===this.epoch)this.update({busy:false});}
  }
  stop(){this.epoch++;this.controller?.abort();this.controller=null;this.update({busy:false,paused:true,notice:(this.state.group?.mode||this.state.pending?.mode)==='demo'?'已停止本页示例等待。预设示例不调用模型；原编号保留，请仅核对原结果。':'已停止本页等待；服务端可能继续执行并产生费用。原编号保留，请仅核对原结果。'});}
  resume(){this.update({paused:false});void this.check();}
  dispose(){this.active=false;this.epoch++;this.controller?.abort();}
}
