import {updateFailure} from './errors.js';

const ROOT_KEYS=['channel','components','foundry','system','protocol','dataSchema'];
const COMPONENT_KEYS=['connector','module','dashboard','edgePackage'];
const SYSTEM_KEYS=['id','version'];
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const invalidVersion=()=>{throw updateFailure('invalid-version','Version is invalid.');};
const invalidInstalled=()=>{throw updateFailure('invalid-installed-state','Installed component state is invalid.');};

function parseSemver(value){
  if(typeof value!=='string'||value.length>128)invalidVersion();
  const match=SEMVER.exec(value);if(!match)invalidVersion();
  return {core:match.slice(1,4).map(BigInt),prerelease:match[4]?.split('.')??null};
}

function lexical(left,right){return left<right?-1:left>right?1:0;}

export function compareSemver(left,right){
  const a=parseSemver(left),b=parseSemver(right);
  for(let index=0;index<3;index++)if(a.core[index]!==b.core[index])return a.core[index]<b.core[index]?-1:1;
  if(a.prerelease===null||b.prerelease===null)return a.prerelease===b.prerelease?0:a.prerelease===null?1:-1;
  for(let index=0;index<Math.max(a.prerelease.length,b.prerelease.length);index++){
    const leftId=a.prerelease[index],rightId=b.prerelease[index];
    if(leftId===undefined||rightId===undefined)return leftId===rightId?0:leftId===undefined?-1:1;
    if(leftId===rightId)continue;
    const leftNumeric=/^\d+$/.test(leftId),rightNumeric=/^\d+$/.test(rightId);
    if(leftNumeric&&rightNumeric)return BigInt(leftId)<BigInt(rightId)?-1:1;
    if(leftNumeric!==rightNumeric)return leftNumeric?-1:1;
    return lexical(leftId,rightId);
  }
  return 0;
}

function parseDotted(value){
  if(typeof value!=='string'||value.length>64||!/^\d+(?:\.\d+){1,2}$/.test(value))invalidVersion();
  const parts=value.split('.');
  if(parts.some(part=>part.length>1&&part.startsWith('0')))invalidVersion();
  return parts.map(BigInt);
}

export function compareDottedVersion(left,right){
  const a=parseDotted(left),b=parseDotted(right);
  for(let index=0;index<Math.max(a.length,b.length);index++){
    const leftPart=a[index]??0n,rightPart=b[index]??0n;
    if(leftPart!==rightPart)return leftPart<rightPart?-1:1;
  }
  return 0;
}

function validateInstalled(value){
  try{
    if(!exact(value,ROOT_KEYS)||!['stable','test'].includes(value.channel)||!exact(value.components,COMPONENT_KEYS)
      ||!exact(value.system,SYSTEM_KEYS)||value.system.id!=='dnd5e'||!Number.isSafeInteger(value.protocol)||value.protocol<1
      ||!Number.isSafeInteger(value.dataSchema)||value.dataSchema<1)invalidInstalled();
    for(const key of COMPONENT_KEYS){
      const parsed=parseSemver(value.components[key]);
      if(value.channel==='stable'&&parsed.prerelease!==null)invalidInstalled();
    }
    parseDotted(value.foundry);parseDotted(value.system.version);
  }catch(error){
    if(error?.code==='invalid-installed-state')throw error;
    invalidInstalled();
  }
}

const inDottedRange=(value,range)=>compareDottedVersion(value,range.minimum)>=0&&compareDottedVersion(value,range.maximum)<=0;
const inNumericRange=(value,range)=>Number.isSafeInteger(value)&&value>=range.minimum&&value<=range.maximum;

export function evaluateRelease(manifest,installed){
  validateInstalled(installed);
  const reasons=[];
  if(manifest.channel!==installed.channel)reasons.push('channel-mismatch');
  if(compareSemver(manifest.components.connector.version,installed.components.connector)<0)reasons.push('connector-downgrade');
  if(compareSemver(manifest.components.module.version,installed.components.module)<0)reasons.push('module-downgrade');
  if(compareSemver(manifest.components.dashboard.version,installed.components.dashboard)<0)reasons.push('dashboard-downgrade');
  if(compareSemver(manifest.components.edgePackage.version,installed.components.edgePackage)<0)reasons.push('edge-package-downgrade');
  if(!inDottedRange(installed.foundry,manifest.compatibility.foundry))reasons.push('foundry-incompatible');
  if(installed.system.id!==manifest.compatibility.system.id
    ||!inDottedRange(installed.system.version,manifest.compatibility.system))reasons.push('system-incompatible');
  if(!inNumericRange(installed.protocol,manifest.compatibility.protocol))reasons.push('protocol-incompatible');
  if(!inNumericRange(installed.dataSchema,manifest.compatibility.dataSchema))reasons.push('data-schema-incompatible');
  return Object.freeze({compatible:reasons.length===0,reasons:Object.freeze(reasons)});
}
