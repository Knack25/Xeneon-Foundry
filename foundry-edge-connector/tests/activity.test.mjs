import test from 'node:test';
import assert from 'node:assert/strict';
import {ActivityLeases} from '../src/activity.js';

const scope={instanceId:'instance',worldId:'world',generation:'generation'};
const lease=(leaseId='lease-1',ttlMs=45000)=>({leaseId,kind:'confirmation',scope:{...scope},ttlMs});

test('confirmation leases block only until their connector-local expiry',()=>{
 const leases=new ActivityLeases({maximumLeaseMs:45000});
 leases.open('device-a',lease(),scope,1000);
 const active=leases.active(45999);
 assert.deepEqual(active,[{leaseId:'lease-1',kind:'confirmation',scope,expiresAt:46000}]);
 assert.equal(Object.isFrozen(active),true);assert.equal(Object.isFrozen(active[0]),true);assert.equal(Object.isFrozen(active[0].scope),true);
 assert.equal(JSON.stringify(active).includes('device-a'),false);
 assert.deepEqual(leases.active(46000),[]);
});

test('lease input is exact, bounded and scoped to the current world',()=>{
 const invalid=[
  null,[],{},
  {...lease(),extra:true},
  {...lease(),leaseId:'bad id'},
  {...lease(),kind:'polling'},
  {...lease(),scope:{...scope,generation:'old'}},
  {...lease(),ttlMs:4999},
  {...lease(),ttlMs:45001},
  {...lease(),ttlMs:5000.5}
 ];
 for(const value of invalid){
  const leases=new ActivityLeases();
  assert.throws(()=>leases.open('device-a',value,scope,1000),{code:'invalid-activity'});
  assert.deepEqual(leases.active(1000),[]);
 }
 assert.throws(()=>new ActivityLeases().open('bad owner',lease(),scope,1000),{code:'invalid-activity'});
});

test('leases renew before expiry but cannot be duplicated or resurrected',()=>{
 const leases=new ActivityLeases();
 leases.open('device-a',lease(),scope,1000);
 assert.throws(()=>leases.open('device-a',lease(),scope,1001),{code:'activity-conflict'});
 leases.renew('device-a',lease('lease-1',10000),scope,2000);
 assert.deepEqual(leases.active(11999),[{leaseId:'lease-1',kind:'confirmation',scope,expiresAt:12000}]);
 assert.deepEqual(leases.active(12000),[]);
 assert.throws(()=>leases.renew('device-a',lease(),scope,12000),{code:'activity-not-found'});
});

test('lease ownership is isolated, close is idempotent, and each device is capped at four',()=>{
 const leases=new ActivityLeases();
 leases.open('device-a',lease('a'),scope,1000);
 assert.throws(()=>leases.renew('device-b',lease('a'),scope,1001),{code:'activity-not-found'});
 assert.equal(leases.close('device-b','a',1001),false);
 assert.equal(leases.active(1001).length,1);
 assert.equal(leases.close('device-a','a',1001),true);
 assert.equal(leases.close('device-a','a',1001),false);
 for(let index=0;index<4;index++)leases.open('device-a',lease(`lease-${index}`),scope,2000);
 assert.throws(()=>leases.open('device-a',lease('lease-4'),scope,2000),{code:'activity-limit'});
 leases.open('device-b',lease('lease-4'),scope,2000);
 assert.deepEqual(leases.active(2000).map(value=>value.leaseId),['lease-0','lease-1','lease-2','lease-3','lease-4']);
});
