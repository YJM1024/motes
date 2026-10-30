export type Version = {id:string;number:number;prompt:string;summary:string;html:string;createdAt:string;mode:'demo'|'model';model?:string};
export type Project = {id:string;title:string;createdAt:string;updatedAt:string;currentVersionId:string;versions:Version[]};
export type Summary = Omit<Project,'versions'>;
