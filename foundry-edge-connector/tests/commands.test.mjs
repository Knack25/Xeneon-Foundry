import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {Coordinator} from '../src/commands.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PresenceMonitor} from '../src/presence.js';
import {ActivityLeases} from '../src/activity.js';
import {UpdateSafetyGate} from '../../foundry-edge-updater/src/safety-gate.js';
const scope={instanceId:'i',worldId:'w',generation:'g'};
const command={requestId:'r',scope,actorId:'hero',operation:'hp.adjust',input:{amount:-1}};
function safety(store){
  let currentTime=1000;
  const presence=new PresenceMonitor({now:()=>currentTime}),activity=new ActivityLeases({now:()=>currentTime});
  presence.record({scope,serviceUserId:'service',users:[{id:'service',role:2}]},scope,1000);
  const gate=new UpdateSafetyGate({presence,activity,unresolvedRequests:()=>store.countUnresolvedRequests(),requestContinuity:()=>store.requestContinuity(),makeToken:()=> 'maintenance-token'});
  gate.status(1000);
  return {presence,activity,gate,refreshPresence(time){
    for(let at=currentTime+3000;at<time;at+=3000){currentTime=at;presence.record({scope,serviceUserId:'service',users:[{id:'service',role:2}]},scope,at);}
    currentTime=time;presence.record({scope,serviceUserId:'service',users:[{id:'service',role:2}]},scope,time);
  }};
}
function fixture(executeAction){
  const store=new Store(':memory:');
  const pair=()=>store.redeemInvite(store.createInvite({scope,userId:'player'}));
  const device=pair();
  const bridge={scope,executeAction};
  const controls=safety(store);
  return {store,device,bridge,pair,...controls,coordinator:new Coordinator({store,bridge,gate:controls.gate})};
}
test('lost acknowledgment stays unknown across retries and coordinator restart',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;throw Error('secret transport detail');});
  try{
    const result=await f.coordinator.dispatch(f.device.deviceId,command);
    assert.equal(result.status,'unknown');assert.equal(JSON.stringify(result).includes('secret'),false);
    f.coordinator=new Coordinator({store:f.store,bridge:f.bridge,gate:f.gate});
    assert.deepEqual(await f.coordinator.dispatch(f.device.deviceId,command),result);
    assert.equal(calls,1);
    await assert.rejects(()=>f.coordinator.dispatch(f.device.deviceId,{...command,input:{amount:2}}),{code:'request-conflict'});
    assert.throws(()=>f.coordinator.getRequest(f.pair().deviceId,'r'),{code:'request-not-found'});
  }finally{f.store.close();}
});
test('serializes devices per actor and rechecks revocation and generation before dispatch',async()=>{
  let release;let calls=0;
  const f=fixture(async()=>{calls++;await new Promise(r=>release=r);return {status:'completed'};});
  try{
    const second=f.pair();
    const first=f.coordinator.dispatch(f.device.deviceId,command);
    await new Promise(r=>setImmediate(r));
    const queued=f.coordinator.dispatch(second.deviceId,{...command,requestId:'second'});
    await new Promise(r=>setImmediate(r));assert.equal(calls,1);
    f.store.revokeDevice(second.deviceId);release();await first;
    assert.equal((await queued).status,'rejected');assert.equal(calls,1);
    f.bridge.scope={...scope,generation:'new'};
    await assert.rejects(()=>f.coordinator.dispatch(f.device.deviceId,{...command,requestId:'stale'}),{code:'stale-world'});
  }finally{f.store.close();}
});
test('concurrent duplicate delivery dispatches once and persists a completed result',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;await new Promise(r=>setImmediate(r));return {status:'completed',snapshot:{actorId:'hero'}};});
  try{
    const results=await Promise.all([f.coordinator.dispatch(f.device.deviceId,command),f.coordinator.dispatch(f.device.deviceId,command)]);
    assert.equal(calls,1);assert.equal(results[0].status,'completed');
    assert.equal(f.coordinator.getRequest(f.device.deviceId,'r').status,'completed');
  }finally{f.store.close();}
});

test('a queued action is rejected when its player mapping changes',async()=>{
 let release;const users=[];
 const f=fixture(async user=>{users.push(user);await new Promise(r=>release=r);return {status:'completed'};});
 try{
  const first=f.coordinator.dispatch(f.device.deviceId,command);await new Promise(r=>setImmediate(r));
  const second=f.pair();const queued=f.coordinator.dispatch(second.deviceId,{...command,requestId:'queued'});
  f.store.setMapping(second.deviceId,scope,'different-player');release();await first;
  // An incorrect implementation enters the executor a second time; release it to expose the assertion.
  await new Promise(r=>setImmediate(r));if(users.length>1)release();
  assert.equal((await queued).status,'rejected');assert.deepEqual(users,['player']);
 }finally{f.store.close();}
});

test('a dispatched request in a reopened SQLite file stays unknown and is never replayed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'edge-restart-')),filename=join(dir,'state.sqlite');
 let store=new Store(filename),calls=0;
 const device=store.redeemInvite(store.createInvite({scope,userId:'player'}));
 const bridge={scope,executeAction:()=>{calls++;return new Promise(()=>{});}};
 let controls=safety(store);const before=new Coordinator({store,bridge,gate:controls.gate});void before.dispatch(device.deviceId,command);
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);
 store.close();store=new Store(filename);
 try{
  controls=safety(store);const after=new Coordinator({store,bridge,gate:controls.gate});
  assert.equal(after.getRequest(device.deviceId,command.requestId).status,'unknown');
  assert.equal(store.countUnresolvedRequests(),1);
  assert.equal((await after.dispatch(device.deviceId,command)).status,'unknown');assert.equal(calls,1);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});

test('durable unresolved count includes only accepted, dispatched and unknown work',()=>{
 const store=new Store(':memory:');
 try{
  assert.equal(store.countUnresolvedRequests(),0);
  for(const [index,status]of ['accepted','dispatched','unknown','completed','rejected'].entries())
   store.db.prepare('INSERT INTO requests(device,id,digest,status) VALUES(?,?,?,?)').run('device',`request-${index}`,'digest',status);
  assert.equal(store.countUnresolvedRequests(),3);
  store.db.prepare("DELETE FROM requests WHERE status IN ('accepted','dispatched','unknown')").run();
  assert.equal(store.countUnresolvedRequests(),0);
 }finally{store.close();}
});

test('maintenance rejects new commands before insertion but preserves completed idempotent retries',async()=>{
 const f=fixture(async()=>({status:'completed'}));
 try{
  assert.equal((await f.coordinator.dispatch(f.device.deviceId,command)).status,'completed');
  f.refreshPresence(301000);f.gate.status(301000);f.refreshPresence(601000);
  const token=f.gate.acquireMaintenance(601000);
  await assert.rejects(()=>f.coordinator.dispatch(f.device.deviceId,{...command,requestId:'new'}),{code:'maintenance'});
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM requests WHERE id='new'").get().n,0);
  assert.equal((await f.coordinator.dispatch(f.device.deviceId,command)).status,'completed');
  f.gate.releaseMaintenance(token);
 }finally{f.store.close();}
});

test('command insertion and maintenance acquisition have deterministic race ordering',async()=>{
 let release;const f=fixture(async()=>{await new Promise(resolve=>release=resolve);return {status:'completed'};});
 try{
  const pending=f.coordinator.dispatch(f.device.deviceId,command);
  assert.equal(f.store.countUnresolvedRequests(),1);
  assert.throws(()=>f.gate.acquireMaintenance(301000),error=>error.code==='update-not-safe'&&error.blockers.includes('unresolved-requests'));
  await new Promise(resolve=>setImmediate(resolve));
  release();await pending;
  assert.equal(f.store.countUnresolvedRequests(),0);
  f.refreshPresence(301001);f.gate.status(301001);f.refreshPresence(601001);const token=f.gate.acquireMaintenance(601001);
  await assert.rejects(()=>f.coordinator.dispatch(f.device.deviceId,{...command,requestId:'after-lock'}),{code:'maintenance'});
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM requests WHERE id='after-lock'").get().n,0);
  f.gate.releaseMaintenance(token);
 }finally{f.store.close();}
});

test('unknown outcome remains a maintenance blocker after in-memory pending work drains',async()=>{
 const f=fixture(async()=>{throw Error('ack lost');});
 try{
  assert.equal((await f.coordinator.dispatch(f.device.deviceId,command)).status,'unknown');
  assert.equal(f.coordinator.pending,0);assert.equal(f.store.countUnresolvedRequests(),1);
  assert.throws(()=>f.gate.acquireMaintenance(301000),error=>error.code==='update-not-safe'&&error.blockers.includes('unresolved-requests'));
 }finally{f.store.close();}
});
