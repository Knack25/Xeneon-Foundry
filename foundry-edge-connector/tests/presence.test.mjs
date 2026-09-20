import test from 'node:test';
import assert from 'node:assert/strict';
import {PresenceMonitor} from '../src/presence.js';

const scope={instanceId:'instance',worldId:'world',generation:'generation'};
const report=(users=[{id:'service',role:2}])=>({scope:{...scope},serviceUserId:'service',users});

test('presence is unknown until a fresh exact report arrives and disconnect clears it',()=>{
  let currentTime=1000;
  const monitor=new PresenceMonitor({maxAgeMs:15000,now:()=>currentTime});
  assert.deepEqual(monitor.snapshot(1000),{state:'unknown',reason:'not-observed'});
  monitor.record(report(),scope,1000);
  const known=monitor.snapshot(15999);
  assert.deepEqual(known,{state:'known',scope,serviceUserId:'service',users:[{id:'service',role:2}],receivedAt:1000});
  assert.equal(Object.isFrozen(known),true);
  assert.equal(Object.isFrozen(known.scope),true);
  assert.equal(Object.isFrozen(known.users),true);
  assert.equal(Object.isFrozen(known.users[0]),true);
  assert.deepEqual(monitor.snapshot(16001),{state:'unknown',reason:'stale'});
  monitor.clear();
  assert.deepEqual(monitor.snapshot(16001),{state:'unknown',reason:'disconnected'});
});

test('invalid presence clears the last trusted report instead of looking empty',()=>{
  let currentTime=2000;
  const invalidReports=[
    null,
    [],
    {scope,serviceUserId:'service'},
    {...report(),extra:true},
    {...report(),scope:{...scope,generation:'other'}},
    report([{id:'player',role:1}]),
    report([{id:'service',role:2},{id:'service',role:2}]),
    report([{id:'bad id',role:2}]),
    report([{id:'service',role:0}]),
    report([{id:'service',role:5}]),
    report([{id:'service',role:1.5}]),
    report([{id:'service',role:2,active:true}]),
    report([{id:'service',role:2},...Array.from({length:100},(_,index)=>({id:`user-${index}`,role:1}))])
  ];
  for(const invalid of invalidReports){
    const monitor=new PresenceMonitor({now:()=>currentTime});
    monitor.record(report(),scope,currentTime);
    assert.throws(()=>monitor.record(invalid,scope,currentTime),{code:'invalid-presence'});
    assert.deepEqual(monitor.snapshot(currentTime),{state:'unknown',reason:'invalid'});
  }
});

test('presence rejects untrusted receive times and out-of-order reports',()=>{
  let currentTime=2000;
  const monitor=new PresenceMonitor({now:()=>currentTime});
  for(const receivedAt of [NaN,1.5,-1,2001]){
    assert.throws(()=>monitor.record(report(),scope,receivedAt),{code:'invalid-presence'});
    assert.deepEqual(monitor.snapshot(currentTime),{state:'unknown',reason:'invalid'});
  }
  monitor.record(report(),scope,2000);
  currentTime=3000;
  assert.throws(()=>monitor.record(report(),scope,1999),{code:'invalid-presence'});
  assert.deepEqual(monitor.snapshot(currentTime),{state:'unknown',reason:'invalid'});
});

test('presence snapshots are defensive copies detached from report mutation',()=>{
  const monitor=new PresenceMonitor({now:()=>1000});
  const source=report([{id:'service',role:2},{id:'player',role:1}]);
  monitor.record(source,scope,1000);
  source.scope.worldId='changed';source.users[1].id='changed';
  assert.deepEqual(monitor.snapshot(1000),{
    state:'known',scope,serviceUserId:'service',users:[{id:'service',role:2},{id:'player',role:1}],receivedAt:1000
  });
});
