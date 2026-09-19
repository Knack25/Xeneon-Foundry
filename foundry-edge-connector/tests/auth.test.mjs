import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
const scope={instanceId:'server',worldId:'world',generation:'first'};
test('invitation redemption is single-use and persistent tokens are stored only as hashes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'edge-auth-'));const file=join(dir,'state.sqlite');
  let store=new Store(file);
  try{
    const code=store.createInvite({scope,userId:'player'},100);
    const attempts=await Promise.allSettled([Promise.resolve().then(()=>store.redeemInvite(code,101)),Promise.resolve().then(()=>store.redeemInvite(code,101))]);
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
    const device=attempts.find(x=>x.status==='fulfilled').value;
    assert.equal(store.authenticateDevice(device.token).deviceId,device.deviceId);
    assert.equal(store.resolveUser(device.deviceId,scope),'player');
    assert.equal(store.resolveUser(device.deviceId,{...scope,generation:'new'}),'player');
    assert.throws(()=>store.resolveUser(device.deviceId,{...scope,worldId:'another'}),{code:'no-mapping'});
    store.close();store=new Store(file);
    assert.equal(store.authenticateDevice(device.token).deviceId,device.deviceId);
    store.revokeDevice(device.deviceId);
    assert.throws(()=>store.authenticateDevice(device.token),{code:'unauthorized'});
    assert.throws(()=>store.resolveUser(device.deviceId,scope),{code:'unauthorized'});
    assert.equal((await readFile(file)).includes(Buffer.from(device.token)),false);
  }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('expired invites and invalid mappings fail without consuming a valid invitation',()=>{
  const store=new Store(':memory:');
  try{
    const code=store.createInvite({scope,userId:'p'},0);
    assert.throws(()=>store.redeemInvite(code,600000),{code:'invalid-invite'});
    assert.throws(()=>store.createInvite({scope:{},userId:'p'},0),{code:'invalid-mapping'});
    const device=store.redeemInvite(store.createInvite({scope,userId:'p'},0),1);
    assert.throws(()=>store.setMapping(device.deviceId,scope,'__bad id'),{code:'invalid-mapping'});
    store.setMapping(device.deviceId,{...scope,worldId:'two'},'p2');
    assert.equal(store.resolveUser(device.deviceId,scope),'p');
    assert.equal(store.resolveUser(device.deviceId,{...scope,worldId:'two'}),'p2');
  }finally{store.close();}
});
