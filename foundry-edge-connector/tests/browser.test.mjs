import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserBridge} from '../src/browser.js';
import {startBrowser} from '../src/runtime-session.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('disconnect clears scope immediately and stale reads are never returned',async()=>{
 let release;const scope={instanceId:'i',worldId:'w',generation:'g'};
 const bridge=new BrowserBridge();
 bridge.attach({scope,call:()=>new Promise(r=>release=r)});
 const read=bridge.readCharacter('p','a');bridge.disconnect();release({name:'private sheet'});
 await assert.rejects(()=>read,{code:'stale-world'});assert.equal(bridge.scope,null);
});
test('new sessions require a new generation and commands cannot target a stale scope',async()=>{
 const bridge=new BrowserBridge();let calls=0;
 bridge.attach({scope:{instanceId:'i',worldId:'w',generation:'new'},call:async()=>{calls++;}});
 await assert.rejects(()=>bridge.executeAction('p',{scope:{instanceId:'i',worldId:'w',generation:'old'}}),{code:'stale-world'});
 assert.equal(calls,0);
});

test('presence reads reject a reply from a disconnected session',async()=>{
 let release;const scope={instanceId:'i',worldId:'w',generation:'g'};
 const bridge=new BrowserBridge();
 bridge.attach({scope,call:()=>new Promise(resolve=>release=resolve)});
 const read=bridge.readPresence();bridge.disconnect();release({scope,serviceUserId:'service',users:[{id:'service',role:2}]});
 await assert.rejects(()=>read,{code:'stale-world'});
});

test('service connection and heartbeats record presence while disconnect and stop clear it',async()=>{
 const scope={instanceId:'i',worldId:'w',generation:'g'};
 const reports=[];let clears=0,disconnect,scheduled,closed=0;
 const presence={record:(report,seenScope,receivedAt)=>reports.push({report,seenScope,receivedAt}),clear:()=>clears++};
 const report={scope,serviceUserId:'service',users:[{id:'service',role:2}]};
 const session={scope,call:async method=>method==='readPresence'?report:true,close:async()=>closed++};
 const bridge=new BrowserBridge();
 const controller=startBrowser({bridge,config:{},presence,now:()=>1000,
   connect:async(config,onDisconnect)=>{disconnect=onDisconnect;return session;},
   setTimer:(fn,ms)=>{scheduled={fn,ms};return 1;},clearTimer:()=>{}});
 await flush();
 assert.deepEqual(reports,[{report,seenScope:scope,receivedAt:1000}]);
 assert.deepEqual(bridge.scope,scope);assert.equal(scheduled.ms,3000);
 scheduled.fn();await flush();
 assert.equal(reports.length,2);assert.equal(scheduled.ms,3000);
 disconnect();assert.equal(bridge.scope,null);assert.equal(clears,1);
 await controller.stop();
 assert.equal(clears,2);assert.equal(closed,1);
});

test('a failed presence heartbeat clears trusted state and enters reconnect flow',async()=>{
 const scope={instanceId:'i',worldId:'w',generation:'g'};
 let scheduled,reads=0,clears=0;
 const session={scope,call:async method=>{
   if(method==='readPresence'&&++reads>1)throw Error('presence failed');
   return method==='readPresence'?{scope,serviceUserId:'service',users:[{id:'service',role:2}]}:true;
 },close:async()=>{}};
 const bridge=new BrowserBridge();
 const controller=startBrowser({bridge,config:{},presence:{record:()=>{},clear:()=>clears++},connect:async()=>session,
   setTimer:(fn,ms)=>{scheduled={fn,ms};return 1;},clearTimer:()=>{}});
 await flush();scheduled.fn();await flush();
 assert.equal(bridge.scope,null);assert.equal(clears,1);assert.equal(scheduled.ms,5000);
 await controller.stop();
});
