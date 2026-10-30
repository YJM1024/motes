export type Candidate = { id:string; attemptId:string; slot:number; strategy:string; status:'running'|'ready'|'failed'|'unresolved'|'save_pending'; html:string|null; errorCode:string|null; updatedAt:string; adoptedAppId:string|null; adoptedVersionId:string|null; adoptKind:'current'|'new'|null };
export type CandidateGroup = { id:string; prompt:string; mode:'demo'|'model'; model:string|null; appId:string|null; baseVersionId:string|null; managedProjectId:string; createdAt:string; count:2|3|4; reservedModelCalls:number; candidates:Candidate[] };
export type CandidateSummary = Omit<CandidateGroup,'candidates'>;
export type CreateCandidates = { requestId:string; prompt:string; mode:'demo'|'model'; model?:string; appId?:string; baseVersionId?:string; managedProjectId?:string; count?:2|3|4; confirmCalls?:2|3|4; confirmTwoCalls?:true };
export type AdoptCandidate = { candidateId:string; asNew?:boolean };
