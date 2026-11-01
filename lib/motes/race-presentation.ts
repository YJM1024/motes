import type {RaceState} from './race-controller';
export type RacePreviewChoice={key:string;slot:number|null};
/** Projects a receipt into the workbench without creating or replacing a saved app. */
export function racePresentation(state:RaceState,scope:string,choice:RacePreviewChoice|null,appId?:string){
  const descriptor=state.group||state.pending||state.submitted;
  const id=state.group?.id||state.pending?.requestId||state.retry?.groupId||state.submitted?.requestId;
  const key=scope+':'+(id||'recovery');
  const workbench=!!descriptor||!!state.retry||!!state.error;
  const count=descriptor?.count||2;
  const adopted=!!appId&&!!state.group?.candidates.some(c=>c.adoptedAppId===appId);
  const slot=choice?.key===key?choice.slot:adopted?null:0;
  const candidate=slot===null?null:state.group?.candidates.find(c=>c.slot===slot)||null;
  return{key,workbench,count,slot,candidate,showCandidate:workbench&&slot!==null,prompt:descriptor?.prompt||'',slots:Array.from({length:count},(_,slot)=>({slot,candidate:state.group?.candidates.find(c=>c.slot===slot)||null}))};
}
