import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.js';
const scope={instanceId:'i',worldId:'w',generation:'g'};
test('device names are validated, isolated, and authentication alone records last seen',()=>{
 const store=new Store(':memory:');
 try{
  const pair=()=>store.redeemInvite(store.createInvite({scope,userId:'p'},1000),1001);
  const first=pair(),second=pair();
  assert.equal(store.listDevices()[0].lastSeen,null);
  store.renameDevice(first.deviceId,'Living room Edge');
  store.requireDevice(first.deviceId);
  assert.equal(store.listDevices().find(d=>d.deviceId===first.deviceId).lastSeen,null);
  for(const label of ['', ' ', 'a'.repeat(81), 'bad\nname', ' name',null,3])assert.throws(()=>store.renameDevice(first.deviceId,label),{code:'invalid-label'});
  store.authenticateDevice(first.token,2000);
  assert.equal(store.listDevices().find(d=>d.deviceId===first.deviceId).lastSeen,2000);
  assert.equal(store.listDevices().find(d=>d.deviceId===second.deviceId).label,null);
  store.revokeDevice(first.deviceId);
  assert.throws(()=>store.authenticateDevice(first.token,3000),{code:'unauthorized'});
  assert.equal(store.listDevices().find(d=>d.deviceId===first.deviceId).lastSeen,2000);
  assert.throws(()=>store.renameDevice('missing','Unknown'),{code:'unauthorized'});
 }finally{store.close();}
});
test('legacy device migration preserves pairing and persists names across restarts',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'edge-store-')),filename=path.join(directory,'store.sqlite');
 const legacy=new DatabaseSync(filename);
 legacy.exec('CREATE TABLE devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,revoked INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL)');legacy.close();
 let store=new Store(filename);
 try{
  const device=store.redeemInvite(store.createInvite({scope,userId:'p'}));
  store.renameDevice(device.deviceId,'Desk Edge');store.authenticateDevice(device.token,1234);store.close();store=new Store(filename);
  assert.equal(store.listDevices()[0].label,'Desk Edge');assert.equal(store.listDevices()[0].lastSeen,1234);
  assert.equal(store.authenticateDevice(device.token).deviceId,device.deviceId);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
