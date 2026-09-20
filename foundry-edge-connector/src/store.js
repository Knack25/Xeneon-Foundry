import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {failure,sameScope} from './protocol.js';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const id=value=>typeof value==='string'&&/^[\w-]{1,128}$/.test(value);

export class Store {
  constructor(filename){
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,revoked INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS mappings(device TEXT NOT NULL REFERENCES devices(id),instance TEXT NOT NULL,world TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(device,instance,world));
      CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,instance TEXT NOT NULL,world TEXT NOT NULL,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(device TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,status TEXT NOT NULL,result TEXT,PRIMARY KEY(device,id));`);
    if(!this.db.prepare('PRAGMA table_info(mappings)').all().some(column=>column.name==='revision'))
      this.db.exec('ALTER TABLE mappings ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
    const columns=this.db.prepare('PRAGMA table_info(devices)').all();
    if(!columns.some(column=>column.name==='label'))this.db.exec('ALTER TABLE devices ADD COLUMN label TEXT');
    if(!columns.some(column=>column.name==='last_seen'))this.db.exec('ALTER TABLE devices ADD COLUMN last_seen INTEGER');
    this.requestRevision=0;
  }
  close(){this.db.close();}
  requireDevice(deviceId){
    const row=this.db.prepare('SELECT id,created FROM devices WHERE id=? AND revoked=0').get(deviceId);
    if(!row)throw failure('unauthorized','Pair this device again.');
    return {deviceId:row.id,created:row.created};
  }
  authenticateDevice(token,now=Date.now()){
    if(typeof token!=='string'||token.length>128)throw failure('unauthorized','Pair this device again.');
    const row=this.db.prepare('SELECT id FROM devices WHERE token_hash=? AND revoked=0').get(digest(token));
    if(!row)throw failure('unauthorized','Pair this device again.');
    this.db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(now,row.id);
    return this.requireDevice(row.id);
  }
  createInvite({scope,userId},now=Date.now()){
    if(!sameScope(scope,scope)||!id(userId))throw failure('invalid-mapping','Select an active world and player.');
    const code=randomBytes(9).toString('base64url');
    this.db.prepare('DELETE FROM invites WHERE expires<=?').run(now);
    this.db.prepare('INSERT INTO invites VALUES(?,?,?,?,?)').run(digest(code),scope.instanceId,scope.worldId,userId,now+600000);
    return code;
  }
  redeemInvite(code,now=Date.now()){
    if(typeof code!=='string'||code.length>128)throw failure('invalid-invite','Invitation is invalid or expired.');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const row=this.db.prepare('SELECT * FROM invites WHERE hash=? AND expires>?').get(digest(code),now);
      if(!row)throw failure('invalid-invite','Invitation is invalid or expired.');
      const deviceId=randomUUID(),token=randomBytes(32).toString('base64url');
      this.db.prepare('INSERT INTO devices(id,token_hash,created) VALUES(?,?,?)').run(deviceId,digest(token),now);
      this.db.prepare('INSERT INTO mappings(device,instance,world,user_id) VALUES(?,?,?,?)').run(deviceId,row.instance,row.world,row.user_id);
      this.db.prepare('DELETE FROM invites WHERE hash=?').run(digest(code));
      this.db.exec('COMMIT');return {deviceId,token};
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  resolveUser(deviceId,scope){
    this.requireDevice(deviceId);
    if(!sameScope(scope,scope))throw failure('no-world','No active world is connected.');
    const row=this.db.prepare('SELECT user_id FROM mappings WHERE device=? AND instance=? AND world=?').get(deviceId,scope.instanceId,scope.worldId);
    if(!row)throw failure('no-mapping','This device has no player mapping in the active world.');
    return row.user_id;
  }
  setMapping(deviceId,scope,userId){
    this.requireDevice(deviceId);
    if(!sameScope(scope,scope)||!id(userId))throw failure('invalid-mapping','Select an active world and player.');
    this.db.prepare('INSERT INTO mappings(device,instance,world,user_id) VALUES(?,?,?,?) ON CONFLICT(device,instance,world) DO UPDATE SET user_id=excluded.user_id,revision=mappings.revision+1').run(deviceId,scope.instanceId,scope.worldId,userId);
  }
  mappingRevision(deviceId,scope){this.resolveUser(deviceId,scope);return this.db.prepare('SELECT revision FROM mappings WHERE device=? AND instance=? AND world=?').get(deviceId,scope.instanceId,scope.worldId).revision;}
  countUnresolvedRequests(){return this.db.prepare("SELECT count(*) AS count FROM requests WHERE status IN ('accepted','dispatched','unknown')").get().count;}
  requestContinuity(){return this.requestRevision;}
  markRequestContinuity(){this.requestRevision++;}
  revokeDevice(deviceId){this.db.prepare('UPDATE devices SET revoked=1 WHERE id=?').run(deviceId);}
  renameDevice(deviceId,label){
    if(typeof label!=='string'||label.length<1||label.length>80||label!==label.trim()||/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label))
      throw failure('invalid-label','Use a device name of 1–80 characters without leading or trailing spaces or control characters.');
    this.requireDevice(deviceId);
    this.db.prepare('UPDATE devices SET label=? WHERE id=?').run(label,deviceId);
  }
  listDevices(){return this.db.prepare('SELECT id AS deviceId,label,last_seen AS lastSeen,created,revoked FROM devices ORDER BY created DESC').all().map(device=>({...device,mappings:this.db.prepare('SELECT instance AS instanceId,world AS worldId,user_id AS userId FROM mappings WHERE device=?').all(device.deviceId)}));}
}
