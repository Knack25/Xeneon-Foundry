import {updateFailure} from './errors.js';
import {randomUUID} from 'node:crypto';

const freeze=value=>{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
};
const scopeKey=scope=>JSON.stringify([scope.instanceId,scope.worldId,scope.generation]);

export class UpdateSafetyGate{
 #phase='open';#token=null;#quietSince=null;#lastScope=null;#lastTime=null;#lastContinuity=null;
 #safeToCommit=false;#recheckBlockers=[];#maintenanceScope=null;#maintenanceContinuity=null;#maintenanceInvalidated=false;
 constructor({presence,activity,unresolvedRequests,requestContinuity,quietPeriodMs=300000,now=Date.now,makeToken=randomUUID}={}){
  if(!presence||typeof presence.snapshot!=='function'||!activity||typeof activity.active!=='function'
    ||typeof presence.continuity!=='function'||typeof activity.continuity!=='function'
    ||typeof unresolvedRequests!=='function'||typeof requestContinuity!=='function'
    ||!Number.isSafeInteger(quietPeriodMs)||quietPeriodMs<1||typeof now!=='function'||typeof makeToken!=='function')
    throw new TypeError('Invalid update safety gate options.');
  this.presence=presence;this.activity=activity;this.unresolvedRequests=unresolvedRequests;this.requestContinuity=requestContinuity;
  this.quietPeriodMs=quietPeriodMs;this.now=now;this.makeToken=makeToken;
 }
  status(now=this.now()){
  const policy=this.#evaluate(now,true);
  const blockers=this.#phase==='open'?policy.blockers:this.#maintenancePolicy(policy);
  return freeze({phase:this.#phase,eligible:this.#phase==='open'&&policy.blockers.length===0,
    quietSince:this.#quietSince,eligibleAt:this.#quietSince===null?null:this.#quietSince+this.quietPeriodMs,
    blockers:this.#phase==='open'?blockers:['maintenance-active',...blockers]});
 }
 acquireMaintenance(now=this.now()){
  if(this.#phase!=='open')throw this.#unsafe(['maintenance-active']);
  const policy=this.#evaluate(now,true);
  if(policy.blockers.length)throw this.#unsafe(policy.blockers);
  const token=this.makeToken();
  if(typeof token!=='string'||token.length<1||token.length>256)throw updateFailure('update-lock','Maintenance token generation failed.');
  this.#phase='maintenance';this.#token=token;this.#safeToCommit=false;this.#recheckBlockers=[];
  this.#maintenanceScope=policy.scope;this.#maintenanceContinuity=policy.continuity;this.#maintenanceInvalidated=false;
  return token;
 }
 recheckMaintenance(token,now=this.now()){
  this.#requireToken(token);
  const policy=this.#evaluate(now,false);
  const blockers=this.#maintenancePolicy(policy);
  this.#recheckBlockers=blockers;this.#safeToCommit=blockers.length===0;
  return freeze({safe:this.#safeToCommit,blockers:[...blockers]});
 }
 commitMaintenance(token,now=this.now()){
  this.#requireToken(token);
  const blockers=this.#maintenancePolicy(this.#evaluate(now,false));
  if(blockers.length){this.#safeToCommit=false;this.#recheckBlockers=blockers;throw this.#unsafe(blockers);}
  if(!this.#safeToCommit)throw this.#unsafe(this.#recheckBlockers.length?this.#recheckBlockers:['recheck-required']);
  this.#phase='committed';this.#token=null;this.#safeToCommit=false;this.#recheckBlockers=[];return true;
 }
 releaseMaintenance(token){
  this.#requireToken(token);
  this.#phase='open';this.#token=null;this.#safeToCommit=false;this.#recheckBlockers=[];this.#quietSince=null;return true;
 }
 assertActionAdmission(){
  if(this.#phase!=='open')throw updateFailure('maintenance','Maintenance is starting. Retry shortly.');
 }
 #requireToken(token){
  if(this.#phase!=='maintenance'||typeof token!=='string'||token!==this.#token)
    throw updateFailure('update-lock','Maintenance lock is not held by this caller.');
 }
 #unsafe(blockers){
  const error=updateFailure('update-not-safe','Maintenance safety conditions are not satisfied.');
  error.blockers=freeze([...blockers]);return error;
 }
 #maintenancePolicy(policy){
  const changed=policy.scope!==this.#maintenanceScope||policy.continuity!==this.#maintenanceContinuity||policy.continuityBroken;
  if(changed)this.#maintenanceInvalidated=true;
  const blockers=[...policy.blockers];
  if(this.#maintenanceInvalidated&&blockers.length===0)blockers.push('quiet-period');
  if(blockers.length)this.#safeToCommit=false;
  return blockers;
 }
 #evaluate(now,includeQuiet){
  if(!Number.isSafeInteger(now)||now<0)throw updateFailure('invalid-time','Update safety time is invalid.');
  const rolledBack=this.#lastTime!==null&&now<this.#lastTime;this.#lastTime=now;
  const blockers=[];const presence=this.presence.snapshot(now);
  let currentScope=null;
  if(!presence||presence.state!=='known')blockers.push('presence-unknown');
  else{
   currentScope=scopeKey(presence.scope);
   if(presence.users.some(user=>user.id!==presence.serviceUserId))blockers.push('users-connected');
  }
  const active=this.activity.active(now);
  if(!Array.isArray(active)||active.length>0)blockers.push('edge-activity');
  const unresolved=this.unresolvedRequests();
  if(!Number.isSafeInteger(unresolved)||unresolved<0||unresolved>0)blockers.push('unresolved-requests');
  const revisions=[this.presence.continuity(),this.activity.continuity(),this.requestContinuity()];
  if(revisions.some(value=>!Number.isSafeInteger(value)||value<0))throw updateFailure('invalid-continuity','Update safety continuity is invalid.');
  const continuity=JSON.stringify(revisions);
  const changed=currentScope!==this.#lastScope,continuityChanged=this.#lastContinuity!==null&&continuity!==this.#lastContinuity;
  this.#lastScope=currentScope;
  this.#lastContinuity=continuity;
  if(blockers.length)this.#quietSince=null;
  else if(rolledBack||changed||continuityChanged||this.#quietSince===null)this.#quietSince=now;
  if(includeQuiet&&blockers.length===0&&now-this.#quietSince<this.quietPeriodMs)blockers.push('quiet-period');
  return {blockers,scope:currentScope,continuity,continuityBroken:rolledBack||changed||continuityChanged};
 }
}
