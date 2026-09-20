import {updateFailure} from './errors.js';

const ROOT_KEYS=['schemaVersion','releaseId','channel','publishedAt','notes','components','compatibility'];
const COMPONENT_KEYS=['connector','dashboard','module','edgePackage'];
const CONNECTOR_KEYS=['version','image'];
const DASHBOARD_KEYS=['version','bundledIn'];
const MODULE_KEYS=['version','url','sha256','size'];
const EDGE_KEYS=['version','installation','url','sha256','size'];
const COMPATIBILITY_KEYS=['foundry','system','protocol','dataSchema'];
const RANGE_KEYS=['minimum','maximum'];
const SYSTEM_KEYS=['id','minimum','maximum'];
const DANGEROUS_KEYS=new Set(['__proto__','prototype','constructor']);
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const RELEASE_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const IMAGE=/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;
const MAX_NOTES_BYTES=16*1024;
const MAX_MODULE_BYTES=64*1024*1024;
const MAX_EDGE_BYTES=256*1024*1024;

const invalid=()=>{throw updateFailure('invalid-release-manifest','Release manifest is invalid.');};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const positiveInteger=value=>Number.isSafeInteger(value)&&value>=1;

function rejectDangerous(value){
  if(value===null||typeof value!=='object')return;
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||DANGEROUS_KEYS.has(key))invalid();
    rejectDangerous(value[key]);
  }
}

function parseDotted(value){
  if(typeof value!=='string'||value.length>64||!/^\d+(?:\.\d+){1,2}$/.test(value))invalid();
  const parts=value.split('.');
  if(parts.some(part=>(part.length>1&&part.startsWith('0'))||!Number.isSafeInteger(Number(part))))invalid();
  return parts.map(Number);
}

function compareDotted(left,right){
  const a=parseDotted(left),b=parseDotted(right);
  for(let index=0;index<Math.max(a.length,b.length);index++){
    const difference=(a[index]??0)-(b[index]??0);
    if(difference)return Math.sign(difference);
  }
  return 0;
}

function version(value,channel){
  if(typeof value!=='string'||value.length>128||!SEMVER.test(value)||channel==='stable'&&value.includes('-'))invalid();
  return value;
}

function numericRange(value){
  if(!exact(value,RANGE_KEYS)||!positiveInteger(value.minimum)||!positiveInteger(value.maximum)||value.minimum>value.maximum)invalid();
  return {minimum:value.minimum,maximum:value.maximum};
}

function versionRange(value){
  if(!exact(value,RANGE_KEYS)||compareDotted(value.minimum,value.maximum)>0)invalid();
  return {minimum:value.minimum,maximum:value.maximum};
}

function assetUrl(value,allowedAssetOrigins){
  if(typeof value!=='string'||value.length>2048)invalid();
  let url;
  try{url=new URL(value);}catch{invalid();}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!allowedAssetOrigins.has(url.origin))invalid();
  return url.href;
}

function archive(value,keys,maxBytes,allowedAssetOrigins,channel,extra={}){
  if(!exact(value,keys)||!DIGEST.test(value.sha256)||!positiveInteger(value.size)||value.size>maxBytes)invalid();
  return {version:version(value.version,channel),...extra,url:assetUrl(value.url,allowedAssetOrigins),sha256:value.sha256,size:value.size};
}

function deepFreeze(value){
  if(value&&typeof value==='object')for(const child of Object.values(value))deepFreeze(child);
  return value&&typeof value==='object'?Object.freeze(value):value;
}

export function parseReleaseManifest(bytes,{allowedAssetOrigins,maxBytes=131072}={}){
  if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(maxBytes)||maxBytes<1)invalid();
  if(bytes.byteLength>maxBytes)throw updateFailure('release-manifest-too-large','Release manifest is too large.');
  try{
    if(!(allowedAssetOrigins instanceof Set)||allowedAssetOrigins.size===0)invalid();
    for(const origin of allowedAssetOrigins){
      const url=new URL(origin);
      if(typeof origin!=='string'||url.origin!==origin||url.protocol!=='https:'||url.href!==origin+'/')invalid();
    }
    const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const value=JSON.parse(decoded);
    rejectDangerous(value);
    if(!exact(value,ROOT_KEYS)||value.schemaVersion!==1||!RELEASE_ID.test(value.releaseId)
      ||!['stable','test'].includes(value.channel)||typeof value.notes!=='string'
      ||new TextEncoder().encode(value.notes).byteLength>MAX_NOTES_BYTES
      ||typeof value.publishedAt!=='string'||new Date(value.publishedAt).toISOString()!==value.publishedAt
      ||!exact(value.components,COMPONENT_KEYS)||!exact(value.compatibility,COMPATIBILITY_KEYS))invalid();
    const channel=value.channel;
    const connector=value.components.connector;
    const dashboard=value.components.dashboard;
    const edge=value.components.edgePackage;
    if(!exact(connector,CONNECTOR_KEYS)||!IMAGE.test(connector.image))invalid();
    if(!exact(dashboard,DASHBOARD_KEYS)||dashboard.bundledIn!=='connector')invalid();
    if(!exact(edge,EDGE_KEYS)||edge.installation!=='manual')invalid();
    const system=value.compatibility.system;
    if(!exact(system,SYSTEM_KEYS)||system.id!=='dnd5e'||compareDotted(system.minimum,system.maximum)>0)invalid();
    return deepFreeze({schemaVersion:1,releaseId:value.releaseId,channel,publishedAt:value.publishedAt,notes:value.notes,
      components:{connector:{version:version(connector.version,channel),image:connector.image},
        dashboard:{version:version(dashboard.version,channel),bundledIn:'connector'},
        module:archive(value.components.module,MODULE_KEYS,MAX_MODULE_BYTES,allowedAssetOrigins,channel),
        edgePackage:archive(edge,EDGE_KEYS,MAX_EDGE_BYTES,allowedAssetOrigins,channel,{installation:'manual'})},
      compatibility:{foundry:versionRange(value.compatibility.foundry),
        system:{id:'dnd5e',minimum:system.minimum,maximum:system.maximum},
        protocol:numericRange(value.compatibility.protocol),dataSchema:numericRange(value.compatibility.dataSchema)}});
  }catch(error){
    if(error?.code==='release-manifest-too-large'||error?.code==='invalid-release-manifest')throw error;
    throw updateFailure('invalid-release-manifest','Release manifest is invalid.');
  }
}
