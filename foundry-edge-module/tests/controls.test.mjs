import test from 'node:test';
import assert from 'node:assert/strict';
import {editCharacter} from '../scripts/controls.js';
test('explicit edits reject stale values and update only intended native fields',async()=>{
 const calls=[];const actor={name:'Hero',system:{details:{alignment:'Good'},spells:{spell1:{value:2,max:3}},resources:{primary:{value:1,max:2}}},items:[],update:async data=>calls.push(data)};
 await editCharacter(actor,'slots.set',{key:'spell1',value:1,expected:2});assert.deepEqual(calls.pop(),{'system.spells.spell1.value':1});
 await assert.rejects(()=>editCharacter(actor,'slots.set',{key:'spell1',value:4,expected:2}),{code:'invalid-value'});
 await assert.rejects(()=>editCharacter(actor,'slots.set',{key:'spell1',value:1,expected:0}),{code:'stale-value'});
 const item={id:'item',type:'weapon',system:{equipped:false,quantity:1,uses:{value:2,max:3,spent:1}},update:async data=>calls.push(data)};actor.items.push(item);
 await editCharacter(actor,'item.equip',{itemId:'item',value:true,expected:false});assert.deepEqual(calls.pop(),{'system.equipped':true});
 await editCharacter(actor,'uses.set',{itemId:'item',value:1,expected:2});assert.deepEqual(calls.pop(),{'system.uses.spent':2});
 await editCharacter(actor,'details.set',{field:'name',value:'New Hero',expected:'Hero'});assert.deepEqual(calls.pop(),{name:'New Hero'});
 await assert.rejects(()=>editCharacter(actor,'item.quantity',{itemId:'foreign',value:5,expected:1}),{code:'unsupported-action'});
});

test('container edits reject cycles and foreign containers; preparation preserves always-prepared spells',async()=>{
 const calls=[];const pack={id:'pack',type:'container',system:{container:''},update:async c=>calls.push(c)},nested={id:'nested',type:'container',system:{container:'pack'},update:async c=>calls.push(c)};
 const spell={id:'spell',type:'spell',system:{prepared:2},update:async c=>calls.push(c)};const actor={items:[pack,nested,spell],system:{currency:{gp:3}}};
 await assert.rejects(()=>editCharacter(actor,'item.container',{itemId:'pack',expected:'',value:'nested'}),{code:'invalid-value'});
 await assert.rejects(()=>editCharacter(actor,'item.container',{itemId:'nested',expected:'pack',value:'foreign'}),{code:'unsupported-action'});
 await editCharacter(actor,'item.container',{itemId:'nested',expected:'pack',value:''});assert.deepEqual(calls.pop(),{'system.container':null});
 await assert.rejects(()=>editCharacter(actor,'spell.prepare',{itemId:'spell',expected:2,value:0}),{code:'unsupported-action'});
});
