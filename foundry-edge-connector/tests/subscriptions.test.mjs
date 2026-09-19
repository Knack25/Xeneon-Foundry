import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.js';
import {Store} from '../src/store.js';
test('authorized polling discards replies after mapping or world changes',async()=>{
 const scope={instanceId:'i',worldId:'w',generation:'g'};const store=new Store(':memory:');
 const {token,deviceId}=store.redeemInvite(store.createInvite({scope,userId:'p'}));
 const bridge={scope,async readCharacter(){store.setMapping(deviceId,scope,'other');return {name:'secret'};}};
 const server=createServer({store,bridge,adminSecret:'x'.repeat(40),publicUrl:'https://example.com'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/characters/a`,{headers:{Authorization:`Bearer ${token}`}});
 assert.equal(response.status,403);assert.equal((await response.text()).includes('secret'),false);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
