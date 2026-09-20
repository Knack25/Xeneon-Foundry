import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../src/application.js';
import {Store} from '../src/store.js';
test('application serves dashboard and separates readiness from liveness',async()=>{
 const store=new Store(':memory:'),bridge={scope:null};
 const server=createApplication({store,bridge,adminSecret:'x'.repeat(40),publicUrl:'https://edge.example'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(url)).text(),/Character dashboard/);
  assert.equal((await fetch(url+'/ready')).status,503);
  assert.equal((await fetch(url+'/health')).status,200);
  bridge.scope={instanceId:'i',worldId:'w',generation:'g'};
  assert.equal((await fetch(url+'/ready')).status,200);
  assert.equal((await fetch(url+'/src/store.js')).status,404);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
