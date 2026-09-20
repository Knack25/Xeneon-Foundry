import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../src/application.js';
import {Store} from '../src/store.js';
import {Coordinator} from '../src/commands.js';
import {createUpdateSafety} from '../src/update-safety.js';
test('application serves dashboard and separates readiness from liveness',async()=>{
 const store=new Store(':memory:'),bridge={scope:null};
 const server=createApplication({store,bridge,adminSecret:'x'.repeat(40),publicUrl:'https://edge.example'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(url)).text(),/Character dashboard/);
  const unavailable=await fetch(url+'/ready');assert.equal(unavailable.status,503);
  const release={releaseId:'development',components:{connector:'0.1.0',dashboard:'0.1.0'},protocol:{minimum:1,maximum:1},dataSchema:1,
   automaticInstall:{enabled:false,reason:'release-source-not-configured'}};
  assert.deepEqual(await unavailable.json(),{ready:false,release});
  assert.equal((await fetch(url+'/health')).status,200);
  bridge.scope={instanceId:'i',worldId:'w',generation:'g'};
  const ready=await fetch(url+'/ready');assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{ready:true,release});
  assert.equal((await fetch(url+'/src/store.js')).status,404);
 }finally{await new Promise(r=>server.close(r));store.close();}
});

test('startup safety is unknown until fresh presence and maintenance returns retry-later without insertion',async()=>{
 const scope={instanceId:'i',worldId:'w',generation:'g'},store=new Store(':memory:'),bridge={scope,executeAction:async()=>({status:'completed'})};
 const safety=createUpdateSafety(store,{makeToken:()=> 'maintenance-token'});
 const coordinator=new Coordinator({store,bridge,gate:safety.gate});
 const device=store.redeemInvite(store.createInvite({scope,userId:'player'}));
 const report={scope,serviceUserId:'service',users:[{id:'service',role:2}]};
 assert.deepEqual(safety.gate.status(1000).blockers,['presence-unknown']);
 safety.presence.record(report,scope,1000);safety.gate.status(1000);safety.presence.record(report,scope,301000);
 const token=safety.gate.acquireMaintenance(301000);
 const server=createApplication({store,bridge,coordinator,activity:safety.activity,adminSecret:'x'.repeat(40),publicUrl:'https://edge.example'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/commands`,{method:'POST',headers:{Authorization:`Bearer ${device.token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:'blocked',scope,actorId:'hero',operation:'hp.adjust',input:{amount:-1}})});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:{code:'maintenance',message:'Maintenance is starting. Retry shortly.'}});
  assert.equal(store.db.prepare("SELECT count(*) AS count FROM requests WHERE id='blocked'").get().count,0);
  safety.gate.releaseMaintenance(token);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
