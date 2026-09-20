import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import {Store} from '../src/store.js';
import {ActivityLeases} from '../src/activity.js';

test('health is readable cross-origin without credentials and unknown routes do not expose data', async () => {
  const server = createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/health`);
    assert.deepEqual(await response.json(),{service:'foundry-edge-connector',protocol:1,status:'diagnostic',release:{
      releaseId:'development',components:{connector:'0.1.0',dashboard:'0.1.0'},protocol:{minimum:1,maximum:1},dataSchema:1,
      automaticInstall:{enabled:false,reason:'release-source-not-configured'}
    }});
    assert.equal(response.headers.get('access-control-allow-origin'),'*');
    assert.equal(response.headers.get('access-control-allow-credentials'),null);
    assert.equal((await fetch(`${base}/v1/characters`)).status,404);
    assert.equal((await fetch(`${base}/health`,{method:'POST'})).status,405);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('activity lease routes require a paired device and preserve lease ownership',async()=>{
  const scope={instanceId:'instance',worldId:'world',generation:'generation'};
  const store=new Store(':memory:'),activity=new ActivityLeases();
  const pair=()=>store.redeemInvite(store.createInvite({scope,userId:'player'}));
  const first=pair(),second=pair();
  const server=createServer({store,activity,bridge:{scope},adminSecret:'x'.repeat(40),publicUrl:'https://edge.example'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    const payload={leaseId:'lease-1',kind:'confirmation',scope,ttlMs:45000};
    const send=(method,body,token=first.token)=>fetch(base+'/v1/activity-leases',{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await fetch(base+'/v1/activity-leases')).status,401);
    assert.equal((await send('POST',payload,'invalid')).status,401);
    assert.equal((await send('POST',payload)).status,201);
    assert.equal((await fetch(base+'/v1/activity-leases',{headers:{Authorization:`Bearer ${first.token}`}})).status,404);
    assert.equal((await send('PUT',payload,second.token)).status,404);
    assert.equal((await send('DELETE',{leaseId:'lease-1'},second.token)).status,204);
    assert.equal((await send('PUT',payload)).status,200);
    const invalid=await send('POST',{...payload,owner:'forged'});
    assert.equal(invalid.status,400);assert.deepEqual(await invalid.json(),{error:{code:'invalid-activity',message:'Activity lease is invalid.'}});
    assert.equal((await send('DELETE',{leaseId:'lease-1'})).status,204);
    assert.deepEqual(activity.active(),[]);
    const options=await fetch(base+'/v1/activity-leases',{method:'OPTIONS'});
    assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-methods'),'GET, POST, PUT, DELETE, OPTIONS');
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});

test('configured server creates an activity registry when startup does not inject one',async()=>{
  const scope={instanceId:'instance',worldId:'world',generation:'generation'},store=new Store(':memory:');
  const device=store.redeemInvite(store.createInvite({scope,userId:'player'}));
  const server=createServer({store,bridge:{scope},adminSecret:'x'.repeat(40),publicUrl:'https://edge.example'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/activity-leases`,{method:'POST',
      headers:{Authorization:`Bearer ${device.token}`,'Content-Type':'application/json'},
      body:JSON.stringify({leaseId:'lease-1',kind:'confirmation',scope,ttlMs:45000})});
    assert.equal(response.status,201);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
