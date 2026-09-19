import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {Coordinator} from '../src/commands.js';
const scope={instanceId:'i',worldId:'w',generation:'g'};
const command={requestId:'r',scope,actorId:'hero',operation:'hp.adjust',input:{amount:-1}};
function fixture(executeAction){
  const store=new Store(':memory:');
  const pair=()=>store.redeemInvite(store.createInvite({scope,userId:'player'}));
  const device=pair();
  const bridge={scope,executeAction};
  return {store,device,bridge,pair,coordinator:new Coordinator({store,bridge})};
}
test('lost acknowledgment stays unknown across retries and coordinator restart',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;throw Error('secret transport detail');});
  try{
    const result=await f.coordinator.dispatch(f.device.deviceId,command);
    assert.equal(result.status,'unknown');assert.equal(JSON.stringify(result).includes('secret'),false);
    f.coordinator=new Coordinator({store:f.store,bridge:f.bridge});
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
