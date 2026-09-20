import test from 'node:test';
import assert from 'node:assert/strict';
import { sameScope, validateCommand, validateConnectorUrl } from '../src/protocol.js';

const scope = { instanceId: 'server', worldId: 'campaign', generation: 'connection-1' };
const command = (operation = 'hp.adjust', input = { amount: -5 }) => ({
  requestId: 'request-1', scope: { ...scope }, actorId: 'actor-1', operation, input
});

test('weapon commands accept explicit selections and reject formulas or injected options',()=>{
 const input={itemId:'weapon',activityId:'strike',attackMode:'oneHanded',ammunitionId:'',mode:'normal'};
 for(const op of ['roll.attack','roll.damage'])assert.deepEqual(validateCommand(command(op,input)).input,input);
 assert.equal(validateCommand(command('roll.damage',{...input,mode:'critical'})).input.mode,'critical');
 for(const patch of [{formula:'100d20'},{userId:'gm'},{itemId:'Actor.other.Item.weapon'},{activityId:''},{mode:'critical'},{ammunitionId:null}])assert.throws(()=>validateCommand(command('roll.attack',{...input,...patch})),{code:'invalid-command'});
 assert.throws(()=>validateCommand(command('roll.damage',{...input,mode:'advantage'})),{code:'invalid-command'});
});

test('expanded commands constrain edit fields, expected values, slots and cast references',()=>{
 for(const [operation,input] of [
  ['item.equip',{itemId:'item',value:true,expected:false}],['item.quantity',{itemId:'item',value:4,expected:2}],
  ['uses.set',{itemId:'item',value:1,expected:2}],['slots.set',{key:'spell2',value:1,expected:2}],
  ['resource.set',{key:'primary',value:1,expected:2}],['details.set',{field:'alignment',value:'Good',expected:''}],
  ['roll.initiative',{combatId:'',mode:'normal'}],['spell.cast',{itemId:'spell',activityId:'activity',slot:'spell2',concentration:''}],
  ['spell.attack',{castId:'cast',mode:'advantage'}],['spell.damage',{castId:'cast',mode:'critical'}]
 ])assert.deepEqual(validateCommand(command(operation,input)).input,input);
 for(const [operation,input] of [
  ['slots.set',{key:'__proto__',value:1,expected:2}],['details.set',{field:'ownership',value:'gm',expected:''}],
  ['item.equip',{itemId:'item',value:1,expected:false}],['uses.set',{itemId:'item',value:-1,expected:2}],
  ['spell.cast',{itemId:'spell',activityId:'activity',slot:'spell0',concentration:''}],['spell.cast',{itemId:'spell',activityId:'activity',slot:['spell1'],concentration:''}],['spell.damage',{castId:'cast',mode:'advantage'}]
 ])assert.throws(()=>validateCommand(command(operation,input)),{code:'invalid-command'});
});

test('session commands accept explicit options and reject extra rest options and invalid state edits',()=>{
 for(const [op,input]of [['rest.short',{}],['rest.long',{}],['roll.hitDie',{denomination:'d10'}],['roll.death',{mode:'normal'}],['roll.concentration',{mode:'normal',dc:10}],['condition.set',{id:'prone',active:true,expected:false}],['inspiration.set',{value:true,expected:false}],['concentration.end',{expected:'effect'}],['currency.set',{key:'gp',value:42,expected:2}],['item.container',{itemId:'item',value:'pack',expected:''}],['spell.prepare',{itemId:'spell',value:1,expected:0}],['item.attune',{itemId:'item',value:true,expected:false}],['activity.use',{itemId:'item',activityId:'act',slot:'',concentration:''}]])assert.deepEqual(validateCommand(command(op,input)).input,input);
 for(const [op,input]of [['rest.long',{advanceTime:true}],['roll.hitDie',{denomination:'100d20'}],['roll.concentration',{mode:'normal',dc:0}],['item.container',{itemId:'item',value:'Actor.other',expected:''}],['spell.prepare',{itemId:'spell',value:2,expected:0}],['currency.set',{key:'ownership',value:1,expected:0}]])assert.throws(()=>validateCommand(command(op,input)),{code:'invalid-command'});
});

test('scope rejects cross-world, cross-server, stale generation and incomplete identities', () => {
  assert.equal(sameScope(scope, { ...scope }), true);
  for (const key of Object.keys(scope)) assert.equal(sameScope(scope, { ...scope, [key]: 'different' }), false);
  for (const value of [null, {}, {worldId: 'campaign'}]) assert.equal(sameScope(value, value), false);
});

test('accepts only the supported explicit actions and returns a detached command', () => {
  for (const [operation, input] of [
    ['hp.adjust', {amount:-5}], ['hp.temp.set', {value:0}],
    ['roll.ability', {ability:'str',mode:'normal'}],
    ['roll.save', {ability:'dex',mode:'advantage'}],
    ['roll.skill', {skill:'prc',mode:'disadvantage'}]
  ]) assert.deepEqual(validateCommand(command(operation,input)), command(operation,input));
  const original = command();
  const parsed = validateCommand(original);
  original.input.amount = 200;
  original.scope.worldId = 'other';
  assert.equal(parsed.input.amount, -5);
  assert.equal(parsed.scope.worldId, 'campaign');
});

test('rejects user impersonation, generic edits, extra input and invalid identifiers', () => {
  for (const bad of [
    {...command(),userId:'gm'}, command('actor.update', {hp:100}),
    command('hp.adjust', {amount:1,path:'system.hp'}),
    {...command(),scope:{...scope,userId:'gm'}}, {...command(),actorId:''},
    {...command(),requestId:'a'.repeat(129)}, command('roll.skill',{skill:'__proto__',mode:'normal'}),
    command('roll.save',{ability:'str',mode:'blindroll'}),
    command('roll.skill',{skill:'prc',mode:'normal',userId:'gm'})
  ]) assert.throws(() => validateCommand(bad), {code:'invalid-command'});
});

test('rejects non-finite, fractional, coerced, and out-of-range HP inputs', () => {
  for (const amount of [NaN,Infinity,1.2,'5',null,100001,-100001])
    assert.throws(() => validateCommand(command('hp.adjust',{amount})), {code:'invalid-command'});
  for (const value of [-1,100001,'0'])
    assert.throws(() => validateCommand(command('hp.temp.set',{value})), {code:'invalid-command'});
  assert.equal(validateCommand(command('hp.adjust',{amount:-100000})).input.amount,-100000);
});

test('connector URLs require HTTPS without embedded credentials, queries or fragments', () => {
  assert.equal(validateConnectorUrl('https://example.test/'), 'https://example.test');
  assert.equal(validateConnectorUrl('https://example.test/edge/'), 'https://example.test/edge');
  for (const url of ['http://example.test','javascript:alert(1)','https://user:pass@example.test',
    'https://example.test/?token=secret','https://example.test/#token','file:///test','not a url'])
    assert.throws(() => validateConnectorUrl(url), {code:'invalid-url'});
});
