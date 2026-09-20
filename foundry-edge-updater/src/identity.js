import {readFile} from 'node:fs/promises';
import {updateFailure} from './errors.js';

const COMPONENT_KEYS = ['connector','module','dashboard','edgePackage'];
const ROOT_KEYS = ['components','protocol','dataSchema','foundry','system'];
const RANGE_KEYS = ['minimum','maximum'];
const SYSTEM_KEYS = ['id','minimum','maximum'];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DOTTED_VERSION = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){1,2}$/;

const invalid = () => { throw updateFailure('invalid-component-identity','Component identity is invalid.'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value)
  && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value,key));
const integer = value => Number.isSafeInteger(value) && value >= 1;

function compareDotted(left, right) {
  const a=left.split('.').map(Number),b=right.split('.').map(Number);
  for(let index=0;index<Math.max(a.length,b.length);index++){
    const comparison=(a[index]??0)-(b[index]??0);
    if(comparison)return Math.sign(comparison);
  }
  return 0;
}

function numericRange(value) {
  if(!exact(value,RANGE_KEYS)||!integer(value.minimum)||!integer(value.maximum)||value.minimum>value.maximum)invalid();
  return Object.freeze({minimum:value.minimum,maximum:value.maximum});
}

function versionRange(value) {
  if(!exact(value,RANGE_KEYS)||!DOTTED_VERSION.test(value.minimum)||!DOTTED_VERSION.test(value.maximum)
    ||compareDotted(value.minimum,value.maximum)>0)invalid();
  return Object.freeze({minimum:value.minimum,maximum:value.maximum});
}

export function parseComponentIdentity(value) {
  if(!exact(value,ROOT_KEYS)||!exact(value.components,COMPONENT_KEYS)||!integer(value.dataSchema))invalid();
  for(const key of COMPONENT_KEYS)if(typeof value.components[key]!=='string'||!SEMVER.test(value.components[key]))invalid();
  if(!exact(value.system,SYSTEM_KEYS)||value.system.id!=='dnd5e'
    ||!DOTTED_VERSION.test(value.system.minimum)||!DOTTED_VERSION.test(value.system.maximum)
    ||compareDotted(value.system.minimum,value.system.maximum)>0)invalid();
  const components=Object.freeze(Object.fromEntries(COMPONENT_KEYS.map(key=>[key,value.components[key]])));
  const system=Object.freeze({id:value.system.id,minimum:value.system.minimum,maximum:value.system.maximum});
  return Object.freeze({components,protocol:numericRange(value.protocol),dataSchema:value.dataSchema,
    foundry:versionRange(value.foundry),system});
}

export async function loadComponentIdentity(filename) {
  try {
    return parseComponentIdentity(JSON.parse(await readFile(filename,'utf8')));
  } catch (error) {
    if(error?.code==='invalid-component-identity')throw error;
    throw updateFailure('invalid-component-identity','Component identity is invalid.');
  }
}
