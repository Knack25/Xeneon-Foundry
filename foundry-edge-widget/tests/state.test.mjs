import test from 'node:test';
import assert from 'node:assert/strict';
import {reduce} from '../widget/src/state.js';
const scope={instanceId:'i',worldId:'w',generation:'g'};
test('world changes and access loss clear all character data',()=>{
 const old={scope,snapshot:{name:'Private'},characters:[{id:'a'}],selected:'a'};
 const next=reduce(old,{type:'world',scope:{...scope,worldId:'other'}});
 assert.equal(next.snapshot,null);assert.deepEqual(next.characters,[]);assert.equal(next.selected,null);
 assert.equal(reduce(old,{type:'clear'}).snapshot,null);
});
test('stale scopes and revisions cannot replace the current sheet',()=>{
 const old={scope,selected:'a',snapshot:{actorId:'a',revision:3}};
 assert.equal(reduce(old,{type:'snapshot',snapshot:{scope:{...scope,generation:'old'},actorId:'a',revision:9}}),old);
 assert.equal(reduce(old,{type:'snapshot',snapshot:{scope,actorId:'a',revision:2}}),old);
 assert.equal(reduce(old,{type:'snapshot',snapshot:{scope,actorId:'b',revision:9}}),old);
});
