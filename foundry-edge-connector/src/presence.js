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
const unknown=reason=>freeze({state:'unknown',reason});
const safetyState=value=>value&&JSON.stringify([value.scope.instanceId,value.scope.worldId,value.scope.generation,
  value.serviceUserId,value.users.some(user=>user.id!==value.serviceUserId)]);

export class PresenceMonitor{
  #revision=0;
  constructor({maxAgeMs=15000,now=Date.now}={}){
    if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1||typeof now!=='function')throw new TypeError('Invalid presence monitor options.');
    this.maxAgeMs=maxAgeMs;this.now=now;this.value=null;this.reason='not-observed';
  }
  clear(){this.value=null;this.reason='disconnected';this.#revision++;}
  continuity(){return this.#revision;}
  record(report,currentScope,receivedAt=this.now()){
    const invalid=()=>{this.value=null;this.reason='invalid';this.#revision++;throw failure('invalid-presence','Foundry presence is invalid.');};
    const currentTime=this.now();
    if(!Number.isSafeInteger(receivedAt)||receivedAt<0||receivedAt>currentTime
      ||(this.value&&receivedAt<this.value.receivedAt)
      ||!exact(report,['scope','serviceUserId','users'])
      ||!sameScope(report.scope,currentScope)||!identifier(report.serviceUserId)
      ||!Array.isArray(report.users)||report.users.length<1||report.users.length>100)invalid();
    const ids=new Set();
    for(const user of report.users){
      if(!exact(user,['id','role'])||!identifier(user.id)||!Number.isInteger(user.role)||user.role<1||user.role>4||ids.has(user.id))invalid();
      ids.add(user.id);
    }
    if(!ids.has(report.serviceUserId))invalid();
    const previous=this.value;
    const next=freeze({state:'known',scope:{...report.scope},serviceUserId:report.serviceUserId,
      users:report.users.map(user=>({id:user.id,role:user.role})),receivedAt});
    if(!previous||receivedAt-previous.receivedAt>this.maxAgeMs||safetyState(previous)!==safetyState(next))this.#revision++;
    this.value=next;
    this.reason=null;
    return this.value;
  }
  snapshot(now=this.now()){
    if(!this.value)return unknown(this.reason);
    if(!Number.isSafeInteger(now)||now<this.value.receivedAt)return unknown('invalid');
    if(now-this.value.receivedAt>this.maxAgeMs)return unknown('stale');
    return this.value;
  }
}
