import {failure,sameScope} from './protocol.js';

const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const freeze=value=>{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};

export class ActivityLeases{
 #leases=new Map();
 #revision=0;
 constructor({maximumLeaseMs=45000,minimumLeaseMs=5000,maximumPerOwner=4,now=Date.now}={}){
  if(!Number.isSafeInteger(maximumLeaseMs)||!Number.isSafeInteger(minimumLeaseMs)
    ||minimumLeaseMs<1||maximumLeaseMs<minimumLeaseMs||!Number.isSafeInteger(maximumPerOwner)||maximumPerOwner<1
    ||typeof now!=='function')throw new TypeError('Invalid activity lease options.');
  this.maximumLeaseMs=maximumLeaseMs;this.minimumLeaseMs=minimumLeaseMs;this.maximumPerOwner=maximumPerOwner;this.now=now;
 }
 #purge(now){
  if(!Number.isSafeInteger(now)||now<0)throw failure('invalid-activity','Activity lease is invalid.');
  let changed=false;for(const [key,value]of this.#leases)if(value.expiresAt<=now){this.#leases.delete(key);changed=true;}
  if(changed)this.#revision++;
 }
 continuity(){return this.#revision;}
 #validate(owner,raw,currentScope,now){
  this.#purge(now);
  if(!identifier(owner)||!exact(raw,['leaseId','kind','scope','ttlMs'])||!identifier(raw.leaseId)
    ||raw.kind!=='confirmation'||!sameScope(raw.scope,currentScope)
    ||!Number.isSafeInteger(raw.ttlMs)||raw.ttlMs<this.minimumLeaseMs||raw.ttlMs>this.maximumLeaseMs
    ||now>Number.MAX_SAFE_INTEGER-raw.ttlMs)throw failure('invalid-activity','Activity lease is invalid.');
 }
 open(owner,raw,currentScope,now=this.now()){
  this.#validate(owner,raw,currentScope,now);
  const key=owner+'\0'+raw.leaseId;
  if(this.#leases.has(key))throw failure('activity-conflict','Activity lease already exists.');
  if([...this.#leases.values()].filter(value=>value.owner===owner).length>=this.maximumPerOwner)
    throw failure('activity-limit','Too many open confirmations.');
  this.#leases.set(key,{owner,leaseId:raw.leaseId,kind:raw.kind,scope:{...raw.scope},expiresAt:now+raw.ttlMs});
  this.#revision++;
  return this.#public(this.#leases.get(key));
 }
 renew(owner,raw,currentScope,now=this.now()){
  this.#validate(owner,raw,currentScope,now);
  const key=owner+'\0'+raw.leaseId;
  if(!this.#leases.has(key))throw failure('activity-not-found','Activity lease is no longer active.');
  this.#leases.set(key,{owner,leaseId:raw.leaseId,kind:raw.kind,scope:{...raw.scope},expiresAt:now+raw.ttlMs});
  return this.#public(this.#leases.get(key));
 }
 close(owner,leaseId,now=this.now()){
  this.#purge(now);
  if(!identifier(owner)||!identifier(leaseId))throw failure('invalid-activity','Activity lease is invalid.');
  const deleted=this.#leases.delete(owner+'\0'+leaseId);if(deleted)this.#revision++;return deleted;
 }
 active(now=this.now()){
  this.#purge(now);
  return freeze([...this.#leases.values()].map(value=>this.#public(value))
    .sort((a,b)=>a.leaseId.localeCompare(b.leaseId)||a.expiresAt-b.expiresAt));
 }
 #public(value){return freeze({leaseId:value.leaseId,kind:value.kind,scope:{...value.scope},expiresAt:value.expiresAt});}
}
