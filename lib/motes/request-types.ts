export type SavedRequestResult = {
  projectId:string; title:string; versionId:string; number:number; html:string; createdAt:string;
};
export type RequestStatus =
  | {requestId:string;status:'done';projectId:string;resultVersionId:string;result:SavedRequestResult}
  | {requestId:string;status:'save_pending';retry:'save'}
  | {requestId:string;status:'running';leaseExpiresAt:number}
  | {requestId:string;status:'failed'|'expired';retry:'new'}
  | {requestId:string;status:'not-found'};
