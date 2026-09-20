import test from 'node:test';import assert from 'node:assert/strict';
import {gameplayAction} from '../scripts/gameplay.js';
test('rests preserve world time and attribute native result; conditions and inspiration reject stale states',async()=>{
 const calls=[];const actor={system:{attributes:{inspiration:false}},statuses:new Set(),concentration:{effects:[]},shortRest:async config=>{calls.push(config);return {message:{update:async data=>calls.push(data)}};},toggleStatusEffect:async(...args)=>calls.push(args),update:async data=>calls.push(data)};
 const message={data:{speaker:{actor:'a'},flags:{'foundry-edge':{requestingUserId:'u'}}}};
 await gameplayAction({actor,operation:'rest.short',input:{},message,statusEffects:[]});assert.equal(calls[0].advanceTime,false);assert.equal(calls[0].autoHD,false);assert.equal(calls[0].dialog,false);assert.equal(calls[1].speaker.actor,'a');
 await gameplayAction({actor,operation:'condition.set',input:{id:'prone',active:true,expected:false},message,statusEffects:[{id:'prone'}]});assert.deepEqual(calls[2],['prone',{active:true}]);
 await assert.rejects(()=>gameplayAction({actor,operation:'inspiration.set',input:{value:false,expected:true},message}),{code:'stale-value'});
});
