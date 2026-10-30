export type AppTemplateSummary={id:string;name:string;description:string;sourceAppId:string;sourceVersionId:string;createdAt:string;updatedAt:string};
export type AppTemplate=AppTemplateSummary&{html:string};
export type AppTemplateLibrary={workspaceId:string;templates:AppTemplateSummary[];limit:number};
