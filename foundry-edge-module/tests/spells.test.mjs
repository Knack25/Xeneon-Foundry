import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpellControls} from '../scripts/spells.js';
test('casting consumes once and retains scaled follow-up rolls scoped to player and character',async()=>{
 const scope={instanceId:'i',worldId:'w',generation:'g'};const calls=[];
 const activity={id:'act',type:'attack',name:'Bolt',canUse:true,requiresSpellSlot:true,requiresConcentration:false,damage:{parts:[{}]},
  use:async(...args)=>{calls.push(args);return {message:{id:'chat',system:{scaling:1}}};},
  rollAttack:async(...args)=>{calls.push(args);return [{total:18}];},rollDamage:async(...args)=>{calls.push(args);return [{total:10}];}};
 const item={id:'spell',name:'Bolt',type:'spell',system:{level:1,prepared:1,activities:new Map([['act',activity]])},clone:()=>item,prepareFinalAttributes:()=>{}};
 const actor={id:'pc',items:[item],system:{spells:{spell2:{value:2,max:2,level:2}}},concentration:{effects:[]}};
 const spells=createSpellControls({getScope:()=>scope});
 const command={requestId:'cast',scope:{...scope},input:{itemId:'spell',activityId:'act',slot:'spell2',concentration:''}};
 await spells.cast(actor,'player',command,{});assert.equal(calls.length,1);assert.equal(calls[0][0].subsequentActions,false);assert.equal(calls[0][0].spell.slot,'spell2');
 assert.equal(spells.recent(actor,'player')[0].castId,'cast');assert.equal(spells.recent(actor,'other').length,0);
 await spells.roll(actor,'player','spell.damage',{castId:'cast',mode:'critical'},{});assert.equal(calls.length,2);assert.equal(calls[1][0].isCritical,true);
 await assert.rejects(()=>spells.roll(actor,'other','spell.damage',{castId:'cast',mode:'normal'},{}),{code:'expired-cast'});
 await spells.cast(actor,'other',command,{});assert.equal(spells.recent(actor,'player').length,1);assert.equal(spells.recent(actor,'other').length,1);
 await assert.rejects(()=>spells.cast(actor,'player',{...command,input:{...command.input,slot:'spell9'}},{}),{code:'invalid-value'});
 await assert.rejects(()=>spells.cast(actor,'player',{...command,input:{...command.input,concentration:'changed'}},{}),{code:'stale-value'});
 item.system.prepared=0;await assert.rejects(()=>spells.cast(actor,'player',command,{}),{code:'unsupported-action'});
 item.system.prepared=1;activity.use=async()=>{scope.generation='new';return {message:{system:{scaling:1}}};};
 await assert.rejects(()=>spells.cast(actor,'player',command,{}),{code:'stale-world'});assert.equal(spells.recent(actor,'player').length,0);
});
