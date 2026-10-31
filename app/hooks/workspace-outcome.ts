export type WorkspaceOutcome = {workspaceId:string;appId:string;versionId?:string;versionNumber?:number;source:'build'|'manual'|'copy'|'seed'|'restore'|'recovery'|'import';appCount?:number;projectCount?:number};
export function outcomeIsCurrent(outcome:WorkspaceOutcome|null,workspaceId:string|null,appId:string|undefined):outcome is WorkspaceOutcome {
  return !!outcome&&!!workspaceId&&outcome.workspaceId===workspaceId&&(outcome.source==='import'||outcome.appId===appId);
}
/** Only a generated result inherits the next draft from its own creation context. */
export function transferCreationDraft(hasApp:boolean,source:'result'|'navigation'):boolean {return !hasApp&&source==='result';}

/** Finish optional linkage before consuming the outbox; applying may then invalidate the old poll. */
export async function finishRecoveredView(value:{isCurrent:()=>boolean;prepare:()=>Promise<unknown>;apply:()=>void}):Promise<boolean>{if(!value.isCurrent())return false;await value.prepare();if(!value.isCurrent())return false;value.apply();return true;}
