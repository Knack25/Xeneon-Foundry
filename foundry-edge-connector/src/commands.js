import {digest} from './store.js';
import {failure,sameScope,validateCommand} from './protocol.js';

const canonical=value=>JSON.stringify(value&&typeof value==='object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])) : value);
const unknown=requestId=>({requestId,status:'unknown',error:{code:'outcome-unknown',message:'The action may have completed. Check Foundry before taking another action.'}});

export class Coordinator {
  constructor({store,bridge,gate,maxQueued=100}){
    this.store=store;this.bridge=bridge;this.gate=gate;this.maxQueued=maxQueued;this.queues=new Map();this.pending=0;
    // A new process cannot know whether a previous dispatch reached Foundry.
    store.db.prepare("UPDATE requests SET status='unknown',result=NULL WHERE status IN ('accepted','dispatched')").run();
  }
  getRequest(deviceId,requestId){
    this.store.requireDevice(deviceId);
    const row=this.store.db.prepare('SELECT status,result FROM requests WHERE device=? AND id=?').get(deviceId,requestId);
    if(!row)throw failure('request-not-found','No action with this ID exists for this device.');
    return row.result?JSON.parse(row.result):unknown(requestId);
  }
  async dispatch(deviceId,raw){
    const command=validateCommand(raw),hash=digest(canonical(command));
    this.store.requireDevice(deviceId);
    const old=this.store.db.prepare('SELECT digest FROM requests WHERE device=? AND id=?').get(deviceId,command.requestId);
    if(old){
      if(old.digest!==hash)throw failure('request-conflict','This request ID was already used for a different action.');
      return this.getRequest(deviceId,command.requestId);
    }
    this.gate.assertActionAdmission();
    const acceptedUser=this.check(deviceId,command.scope),acceptedRevision=this.store.mappingRevision(deviceId,command.scope);
    if(this.pending>=this.maxQueued)throw failure('busy','Too many pending actions. Wait before trying again.');
    this.store.db.prepare("INSERT INTO requests(device,id,digest,status) VALUES(?,?,?,'accepted')").run(deviceId,command.requestId,hash);
    this.store.markRequestContinuity();
    const key=canonical({...command.scope,actorId:command.actorId});
    const previous=this.queues.get(key)??Promise.resolve();
    this.pending++;
    const work=previous.catch(()=>{}).then(async()=>{
      let result;
      try{
        const userId=this.check(deviceId,command.scope);
        if(userId!==acceptedUser||this.store.mappingRevision(deviceId,command.scope)!==acceptedRevision)
          throw failure('mapping-changed','Player mapping changed while this action was queued.');
        this.store.db.prepare("UPDATE requests SET status='dispatched' WHERE device=? AND id=?").run(deviceId,command.requestId);
        try{
          const reply=await this.bridge.executeAction(userId,command);
          // Snapshots are deliberately fetched separately with fresh authorization.
          result=reply?.status==='completed'?{requestId:command.requestId,status:'completed'}
            :reply?.status==='rejected'?{requestId:command.requestId,status:'rejected',error:{code:'action-rejected',message:'Foundry rejected this action. Refresh the sheet.'}}
            :unknown(command.requestId);
        }catch{result=unknown(command.requestId);}
      }catch{
        result={requestId:command.requestId,status:'rejected',error:{code:'access-changed',message:'World or device access changed before this action could run.'}};
      }
      this.store.db.prepare('UPDATE requests SET status=?,result=? WHERE device=? AND id=?').run(result.status,JSON.stringify(result),deviceId,command.requestId);
      if(['completed','rejected'].includes(result.status))this.store.markRequestContinuity();
      return result;
    });
    this.queues.set(key,work);
    try{return await work;}finally{
      this.pending--;if(this.queues.get(key)===work)this.queues.delete(key);
    }
  }
  check(deviceId,scope){
    if(!sameScope(scope,this.bridge.scope))throw failure('stale-world','The active world changed. Refresh the sheet.');
    return this.store.resolveUser(deviceId,scope);
  }
}
