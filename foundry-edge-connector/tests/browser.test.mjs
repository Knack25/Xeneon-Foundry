import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserBridge} from '../src/browser.js';
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
