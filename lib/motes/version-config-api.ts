import {database,json} from '../forma/server';
import {owner,HttpError} from '../forma/security';
import {configChanges,parseVersionSettings,type VersionConfig,type VersionOperation} from './version-config';
export async function getVersionConfig(request:Request,appId:string,versionId:string){
 const who=await owner(request),db=database();if(appId.length>128||versionId.length>128)throw new HttpError(400,'版本编号无效。');
 const version=await db.prepare('SELECT v.id FROM forma_versions v JOIN forma_projects p ON p.id=v.project_id WHERE p.id=? AND p.owner=? AND v.id=?').bind(appId,who,versionId).first();if(!version)throw new HttpError(404,'应用版本不存在或不属于当前访客。');
 const record=await db.prepare('SELECT operation,base_version_id,settings_json,created_at FROM motes_version_config WHERE version_id=?').bind(versionId).first<{operation:VersionOperation;base_version_id:string|null;settings_json:string|null;created_at:string}>();
 const result:VersionConfig={versionId,recorded:!!record,changes:null,limits:{apps:100,versions:60},note:'只记录非敏感配置；不含或恢复密钥、访问权限、临时输入。旧版本未记录的配置不会推测回填。'};
 if(record){const settings=parseVersionSettings(record.settings_json);Object.assign(result,{operation:record.operation,baseVersionId:record.base_version_id,settings,recordedAt:record.created_at});if(record.base_version_id){const base=await db.prepare('SELECT c.settings_json FROM motes_version_config c JOIN forma_versions v ON v.id=c.version_id JOIN forma_projects p ON p.id=v.project_id WHERE c.version_id=? AND p.id=? AND p.owner=?').bind(record.base_version_id,appId,who).first<{settings_json:string|null}>();result.changes=configChanges(parseVersionSettings(base?.settings_json??null),settings);}}
 return json(result);
}
