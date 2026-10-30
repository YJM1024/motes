export type Candidate = { id:string; slot:number; strategy:string; status:'running'|'ready'|'failed'|'unresolved'; html:string|null; errorCode:string|null; updatedAt:string; adoptedAppId:string|null; adoptedVersionId:string|null; adoptKind:'current'|'new'|null };
export type CandidateGroup = { id:string; prompt:string; mode:'demo'|'model'; model:string|null; appId:string|null; baseVersionId:string|null; managedProjectId:string; createdAt:string; reservedModelCalls:number; candidates:Candidate[] };
export type CandidateSummary = Omit<CandidateGroup,'candidates'>;
export type CreateCandidates = { requestId:string; prompt:string; mode:'demo'|'model'; model?:string; appId?:string; baseVersionId?:string; managedProjectId?:string; confirmTwoCalls:true };
export type AdoptCandidate = { candidateId:string; asNew?:boolean };
