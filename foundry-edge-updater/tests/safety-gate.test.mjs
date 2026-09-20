import test from 'node:test';
import assert from 'node:assert/strict';
import {UpdateSafetyGate} from '../src/safety-gate.js';

const scope={instanceId:'instance',worldId:'world',generation:'generation'};
const known=(users=[{id:'service',role:2}],seenScope=scope)=>({state:'known',scope:{...seenScope},serviceUserId:'service',users,receivedAt:0});
function fixture(){
 let presenceValue={state:'unknown',reason:'not-observed'},activityValue=[],unresolved=0,requestRevision=0;
 const presence={revision:0,get value(){return presenceValue;},set value(value){presenceValue=value;this.revision++;},snapshot(){return presenceValue;},continuity(){return this.revision;}};
 const activity={revision:0,get value(){return activityValue;},set value(value){activityValue=value;this.revision++;},active(){return activityValue;},continuity(){return this.revision;}};
 const gate=new UpdateSafetyGate({presence,activity,unresolvedRequests:()=>unresolved,requestContinuity:()=>requestRevision,quietPeriodMs:300000,makeToken:()=> 'token-1'});
 return {gate,presence,activity,setUnresolved:value=>{if(value!==unresolved)requestRevision++;unresolved=value;}};
}

test('service-only presence must remain continuously quiet for five minutes',()=>{
 const {gate,presence}=fixture();
 assert.deepEqual(gate.status(1000),{phase:'open',eligible:false,quietSince:null,eligibleAt:null,blockers:['presence-unknown']});
 presence.value=known();
 assert.deepEqual(gate.status(1000),{phase:'open',eligible:false,quietSince:1000,eligibleAt:301000,blockers:['quiet-period']});
 assert.equal(gate.status(300999).eligible,false);
 const eligible=gate.status(301000);
 assert.deepEqual(eligible,{phase:'open',eligible:true,quietSince:1000,eligibleAt:301000,blockers:[]});
 assert.equal(Object.isFrozen(eligible),true);assert.equal(Object.isFrozen(eligible.blockers),true);
});

test('blockers are complete and ordered without treating the service user as interactive',()=>{
 const {gate,presence,activity,setUnresolved}=fixture();
 presence.value=known([{id:'service',role:2},{id:'player',role:1},{id:'gm',role:4}]);
 activity.value=[{leaseId:'lease'}];setUnresolved(3);
 assert.deepEqual(gate.status(1000).blockers,['users-connected','edge-activity','unresolved-requests']);
 presence.value={state:'unknown',reason:'stale'};
 assert.deepEqual(gate.status(1001).blockers,['presence-unknown','edge-activity','unresolved-requests']);
});

test('every blocker and world scope change restarts quiet time',()=>{
 const {gate,presence,activity,setUnresolved}=fixture();presence.value=known();
 gate.status(1000);assert.equal(gate.status(200000).quietSince,1000);
 for(const block of [
  ()=>presence.value=known([{id:'service',role:2},{id:'player',role:1}]),
  ()=>presence.value=known([{id:'service',role:2},{id:'gm',role:4}]),
  ()=>activity.value=[{leaseId:'lease'}],
  ()=>setUnresolved(1),
  ()=>presence.value={state:'unknown',reason:'disconnected'},
  ()=>presence.value={state:'unknown',reason:'stale'}
 ]){
  block();assert.equal(gate.status(200001).quietSince,null);
  presence.value=known();activity.value=[];setUnresolved(0);
  assert.equal(gate.status(200002).quietSince,200002);
 }
 presence.value=known(undefined,{...scope,generation:'new'});
 assert.equal(gate.status(250000).quietSince,250000);
 assert.equal(gate.status(250001).quietSince,250000);
});

test('expired activity starts a new quiet interval and clock rollback cannot preserve elapsed time',()=>{
 const {gate,presence,activity}=fixture();presence.value=known();activity.value=[{leaseId:'lease'}];
 assert.equal(gate.status(1000).quietSince,null);
 activity.value=[];assert.equal(gate.status(2000).quietSince,2000);
 assert.equal(gate.status(302000).eligible,true);
 assert.deepEqual(gate.status(1500),{phase:'open',eligible:false,quietSince:1500,eligibleAt:301500,blockers:['quiet-period']});
});

test('blockers that start and finish between evaluations reset the quiet interval',()=>{
 const f=fixture();f.presence.value=known();f.gate.status(1000);
 f.presence.value=known([{id:'service',role:2},{id:'player',role:1}]);f.presence.value=known();
 f.activity.value=[{leaseId:'lease'}];f.activity.value=[];
 f.setUnresolved(1);f.setUnresolved(0);
 assert.deepEqual(f.gate.status(301000),{phase:'open',eligible:false,quietSince:301000,eligibleAt:601000,blockers:['quiet-period']});
});

test('accepted, dispatched and unknown work all block through the same durable count',()=>{
 for(const status of ['accepted','dispatched','unknown']){
  const {gate,presence,setUnresolved}=fixture();presence.value=known();gate.status(1000);setUnresolved(1);
  assert.deepEqual(gate.status(301000).blockers,['unresolved-requests'],status);
  setUnresolved(0);assert.equal(gate.status(301001).quietSince,301001);
 }
});

test('maintenance acquisition closes admission atomically and only its token controls the phase',()=>{
 const {gate,presence}=fixture();presence.value=known();gate.status(1000);
 const token=gate.acquireMaintenance(301000);
 assert.equal(token,'token-1');
 assert.throws(()=>gate.assertActionAdmission(),{code:'maintenance',message:'Maintenance is starting. Retry shortly.'});
 assert.throws(()=>gate.acquireMaintenance(301000),{code:'update-not-safe'});
 assert.throws(()=>gate.recheckMaintenance('wrong',301000),{code:'update-lock'});
 assert.throws(()=>gate.releaseMaintenance('wrong'),{code:'update-lock'});
 assert.deepEqual(gate.recheckMaintenance(token,301000),{safe:true,blockers:[]});
 assert.equal(gate.releaseMaintenance(token),true);
 assert.doesNotThrow(()=>gate.assertActionAdmission());
 assert.deepEqual(gate.status(301001),{phase:'open',eligible:false,quietSince:301001,eligibleAt:601001,blockers:['quiet-period']});
});

test('maintenance recheck detects every safety change before commit',()=>{
 for(const [name,change,want]of [
  ['player joined',({presence})=>presence.value=known([{id:'service',role:2},{id:'player',role:1}]),['users-connected']],
  ['GM joined',({presence})=>presence.value=known([{id:'service',role:2},{id:'gm',role:4}]),['users-connected']],
  ['presence stale',({presence})=>presence.value={state:'unknown',reason:'stale'},['presence-unknown']],
  ['activity opened',({activity})=>activity.value=[{leaseId:'lease'}],['edge-activity']],
  ['request appeared',({setUnresolved})=>setUnresolved(1),['unresolved-requests']]
 ]){
  const f=fixture();f.presence.value=known();f.gate.status(1000);const token=f.gate.acquireMaintenance(301000);
  change(f);assert.deepEqual(f.gate.recheckMaintenance(token,301001),{safe:false,blockers:want},name);
  assert.throws(()=>f.gate.commitMaintenance(token),{code:'update-not-safe'},name);
  f.gate.releaseMaintenance(token);
 }
});

test('maintenance is invalidated when the world generation changes after acquisition',()=>{
 const f=fixture();f.presence.value=known();f.gate.status(1000);const token=f.gate.acquireMaintenance(301000);
 f.presence.value=known(undefined,{...scope,generation:'new'});
 assert.deepEqual(f.gate.recheckMaintenance(token,301001),{safe:false,blockers:['quiet-period']});
 assert.throws(()=>f.gate.commitMaintenance(token,301001),{code:'update-not-safe'});
});

test('commit synchronously rejects safety changes after a successful recheck',()=>{
 const f=fixture();f.presence.value=known();f.gate.status(1000);const token=f.gate.acquireMaintenance(301000);
 assert.deepEqual(f.gate.recheckMaintenance(token,301000),{safe:true,blockers:[]});
 f.presence.value=known([{id:'service',role:2},{id:'gm',role:4}]);
 assert.deepEqual(f.gate.status(301001).blockers,['maintenance-active','users-connected']);
 assert.throws(()=>f.gate.commitMaintenance(token,301001),error=>{
  assert.equal(error.code,'update-not-safe');assert.deepEqual(error.blockers,['users-connected']);return true;
 });
});

test('committed maintenance remains closed and cannot be reopened by the Phase 2 gate',()=>{
 const {gate,presence}=fixture();presence.value=known();gate.status(1000);const token=gate.acquireMaintenance(301000);
 assert.deepEqual(gate.recheckMaintenance(token,301000),{safe:true,blockers:[]});
 assert.equal(gate.commitMaintenance(token),true);
 assert.equal(gate.status(301001).phase,'committed');
 assert.throws(()=>gate.assertActionAdmission(),{code:'maintenance'});
 assert.throws(()=>gate.releaseMaintenance(token),{code:'update-lock'});
 assert.throws(()=>gate.commitMaintenance(token),{code:'update-lock'});
});

test('unsafe acquisition reports a frozen public blocker list',()=>{
 const {gate}=fixture();
 assert.throws(()=>gate.acquireMaintenance(1000),error=>{
  assert.equal(error.code,'update-not-safe');assert.deepEqual(error.blockers,['presence-unknown']);assert.equal(Object.isFrozen(error.blockers),true);return true;
 });
});
