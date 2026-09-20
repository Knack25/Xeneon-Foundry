import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter } from '../scripts/dnd5e.js';

const scope = {instanceId:'test-server',worldId:'test-world',generation:'test-connection'};
const makeCommand = (operation = 'roll.skill', input = {skill:'prc',mode:'normal'}) => ({
  requestId:'request-1',scope:{...scope},actorId:'pc',operation,input
});

test('weapon activities use native attack and critical damage with explicit options and attribution',async()=>{
 const {adapter,pc,effects}=fixture();const item=pc.items[0];
 item.system.attackModes=[{value:'oneHanded',label:'One handed'}];
 item.system.activities=new Map([['attack1',{id:'attack1',type:'attack',name:'Strike',damage:{parts:[{}]},labels:{toHit:'+3'},
 async rollAttack(config,dialog,message){effects.push({config,dialog,message});return [{total:18}];},
 async rollDamage(config,dialog,message){effects.push({config,dialog,message});return [{total:9}];}}]]);
 const input={itemId:item.id,activityId:'attack1',attackMode:'oneHanded',ammunitionId:'',mode:'advantage'};
 assert.equal(adapter.readCharacter('player','pc',scope).attacks[0].activityId,'attack1');
 await adapter.executeAction('player',makeCommand('roll.attack',input));
 assert.equal(effects[0].config.advantage,true);assert.equal(effects[0].config.attackMode,'oneHanded');assert.equal(effects[0].config.ammunition,'');
 assert.equal(effects[0].message.data.flags['foundry-edge'].requestingUserId,'player');
 await adapter.executeAction('player',makeCommand('roll.damage',{...input,mode:'critical'}));
 assert.equal(effects[1].config.isCritical,true);assert.equal(effects[1].dialog.configure,false);
 for(const patch of [{itemId:'missing'},{activityId:'missing'},{attackMode:'forged'},{ammunitionId:'foreign'}])await assert.rejects(()=>adapter.executeAction('player',makeCommand('roll.attack',{...input,...patch})),{code:'unsupported-action'});
 assert.equal(effects.length,2);
 item.system.properties=new Set(['amm']);
 await assert.rejects(()=>adapter.executeAction('player',makeCommand('roll.attack',input)),{code:'unsupported-action'});
 const ammo={id:'ammo',type:'consumable',system:{quantity:2}};pc.items.push(ammo);item.system.ammunitionOptions=[{value:'ammo',label:'Arrows'}];
 await adapter.executeAction('player',makeCommand('roll.attack',{...input,ammunitionId:'ammo'}));assert.equal(effects[2].config.ammunition,'ammo');
 await adapter.executeAction('player',makeCommand('roll.damage',{...input,mode:'normal',ammunitionId:'ammo'}));assert.equal(effects[3].config.ammunition,ammo);
 ammo.system.quantity=0;await assert.rejects(()=>adapter.executeAction('player',makeCommand('roll.attack',{...input,ammunitionId:'ammo'})),{code:'unsupported-action'});
 item.system.attackModes.push({rule:true});assert.equal(adapter.readCharacter('player','pc',scope).attacks[0].attackModes.length,1);
 const activity=item.system.activities.get('attack1');activity.damage.parts=[];
 assert.equal(adapter.readCharacter('player','pc',scope).attacks[0].hasDamage,true);
 ammo.system.quantity=1;ammo.clone=()=>({...ammo,system:{...ammo.system}});
 activity.rollAttack=async()=>{pc.items=pc.items.filter(i=>i!==ammo);item.system.ammunitionOptions=[];return [{total:12}];};
 await adapter.executeAction('player',makeCommand('roll.attack',{...input,ammunitionId:'ammo'}));
 assert.equal(adapter.readCharacter('player','pc',scope).attacks[0].ammunition[0].value,'ammo');
 await adapter.executeAction('player',makeCommand('roll.damage',{...input,mode:'normal',ammunitionId:'ammo'}));
 assert.equal(effects.at(-1).config.ammunition.id,'ammo');
 await assert.rejects(()=>adapter.executeAction('player',makeCommand('roll.attack',{...input,ammunitionId:'ammo'})),{code:'unsupported-action'});
});

function fixture({roleMode = 'public', generation = 14, version = '5.3.3'} = {}) {
  const effects = [];
  const player = {id:'player',name:'Nathan <img src=x onerror=alert(1)>'};
  const service = {id:'service',name:'Edge Service'};
  let owned = true;
  const pc = {id:'pc',name:'Tharivol',type:'character',img:'actors/portrait.webp',isToken:false,pack:null,
    testUserPermission:user => user.id === 'service' || (user.id === 'player' && owned),
    system:{attributes:{hp:{value:12,max:20,temp:4},ac:{value:15},movement:{walk:30,units:'ft'}},
      abilities:{wis:{value:16,mod:3,save:{value:3}}}, skills:{prc:{total:5,passive:15,ability:'wis'}},
      resources:{primary:{label:'Ki',value:2,max:3}},spells:{spell1:{value:2,max:3}}},
    items:[{id:'item1',name:'Quarterstaff',type:'weapon',system:{quantity:1,description:{value:'<p>A staff</p>'}}}],
    async applyDamage(value,options){effects.push({kind:'damage',value,options});},
    async update(changes){effects.push({kind:'update',changes});},
    async rollSkill(config,dialog,message){effects.push({kind:'skill',config,dialog,message});return [{total:19}];},
    async rollAbilityCheck(config,dialog,message){effects.push({kind:'ability',config,dialog,message});return [{total:14}];},
    async rollSavingThrow(config,dialog,message){effects.push({kind:'save',config,dialog,message});return [{total:15}];}
  };
  const npc = {...pc,id:'npc',type:'npc'};
  const packed = {...pc,id:'packed',pack:'some.pack'};
  const synthetic = {...pc,id:'synthetic',isToken:true};
  const users = new Map([[player.id,player],[service.id,service]]);
  const actors = new Map([pc,npc,packed,synthetic].map(actor => [actor.id,actor]));
  const game = {release:{generation},system:{id:'dnd5e',version},user:service,users,actors};
  const adapter = createAdapter({game,getScope:()=>({...scope}),getRollMode:()=>roleMode});
  return {adapter,pc,game,effects,revoke:()=>{owned = false;}};
}

test('selector lists only owned world PCs, rejecting unknown users and synthetic actors', () => {
  const {adapter,revoke} = fixture();
  assert.deepEqual(adapter.listCharacters('player'), [{id:'pc',name:'Tharivol'}]);
  assert.throws(()=>adapter.listCharacters('missing'),{code:'access-denied'});
  revoke();
  assert.deepEqual(adapter.listCharacters('player'), []);
  assert.throws(()=>adapter.readCharacter('player','pc',scope),{code:'access-denied'});
});

test('snapshot projects data rather than serializing complete Foundry documents', () => {
  const {adapter,pc} = fixture();
  pc.system.secretInternal = 'not-for-clients';
  const snapshot = adapter.readCharacter('player','pc',scope);
  assert.deepEqual(snapshot.hp,{value:12,max:20,temp:4});
  assert.equal(snapshot.skills.prc.total,5);
  assert.equal(snapshot.inventory[0].name,'Quarterstaff');
  assert.equal(snapshot.portraitRef,null); // protected image delivery is a later connector capability
  assert.equal(JSON.stringify(snapshot).includes('not-for-clients'),false);
  assert.equal(snapshot.capabilities.includes('actor.update'),false);
});

test('D&D 5.3.3 saving throw modifiers use the derived save.value field',()=>{
  const {adapter,pc}=fixture();pc.system.abilities.wis.save={value:5,roll:{mode:0}};
  assert.equal(adapter.readCharacter('player','pc',scope).abilities.wis.save,5);
});

test('roll dispatch uses native method, no dialog, character speaker, and service author', async () => {
  for (const [operation,input,kind] of [
    ['roll.skill',{skill:'prc',mode:'normal'},'skill'],
    ['roll.ability',{ability:'wis',mode:'advantage'},'ability'],
    ['roll.save',{ability:'wis',mode:'disadvantage'},'save']
  ]) {
    const {adapter,effects} = fixture();
    const result = await adapter.executeAction('player',makeCommand(operation,input));
    assert.equal(result.status,'completed');
    const call = effects[0];
    assert.equal(call.kind,kind);
    assert.deepEqual(call.dialog,{configure:false});
    assert.equal(call.message.rollMode,'public');
    assert.deepEqual(call.message.data.speaker,{actor:'pc',alias:'Tharivol',scene:null,token:null});
    assert.deepEqual({...{actor:'service-actor',alias:'Service',scene:'scene-1',token:'service-token'},...call.message.data.speaker},
      {actor:'pc',alias:'Tharivol',scene:null,token:null});
    assert.equal(call.message.data.user,undefined);
    assert.equal(call.message.data.author,undefined);
    assert.equal(call.message.data.flags['foundry-edge'].requestingUserId,'player');
    assert.equal(call.message.data.flags['foundry-edge'].requestId,'request-1');
    if (input.mode === 'normal') assert.equal(Object.hasOwn(call.config,'advantage'),false);
    if (input.mode === 'advantage') assert.equal(call.config.advantage,true);
    if (input.mode === 'disadvantage') assert.equal(call.config.disadvantage,true);
  }
});

test('private mode is rejected before any native roll or mutation', async () => {
  for (const roleMode of ['gmroll','blindroll','selfroll','private','blind','self','publicroll',null]) {
    const {adapter,effects} = fixture({roleMode});
    await assert.rejects(()=>adapter.executeAction('player',makeCommand()),{code:'unsupported-roll-mode'});
    assert.equal(effects.length,0);
  }
});

test('v14 public mode advertises roll capabilities and rejects legacy mode names', () => {
  assert.ok(fixture().adapter.readCharacter('player','pc',scope).capabilities.includes('roll.skill'));
  assert.equal(fixture({roleMode:'publicroll'}).adapter.readCharacter('player','pc',scope).capabilities.includes('roll.skill'),false);
});

test('HP delegates damage/healing and temp replacement through explicit native calls', async () => {
  const {adapter,effects} = fixture();
  await adapter.executeAction('player',makeCommand('hp.adjust',{amount:-5}));
  await adapter.executeAction('player',makeCommand('hp.adjust',{amount:3}));
  await adapter.executeAction('player',makeCommand('hp.temp.set',{value:2}));
  assert.equal(effects[0].value,5);
  assert.equal(effects[1].value,-3);
  assert.deepEqual(effects[2].changes,{'system.attributes.hp.temp':2});
});

test('revoked owner, obsolete scope, and invalid action cannot reach native mutations', async () => {
  const {adapter,effects,revoke} = fixture();
  await assert.rejects(()=>adapter.executeAction('player',{...makeCommand(),scope:{...scope,generation:'old'}}),{code:'stale-world'});
  await assert.rejects(()=>adapter.executeAction('player',makeCommand('actor.update',{path:'anything'})),{code:'invalid-command'});
  revoke();
  await assert.rejects(()=>adapter.executeAction('player',makeCommand('hp.adjust',{amount:3})),{code:'access-denied'});
  assert.equal(effects.length,0);
});

test('unsupported system versions do not advertise or execute character access', () => {
  for (const options of [{generation:13},{version:'6.0.0'}]) {
    const {adapter} = fixture(options);
    assert.throws(()=>adapter.listCharacters('player'),{code:'unsupported-version'});
  }
});

test('cancelled native roll reports cancellation rather than successful execution', async () => {
  const {adapter,pc} = fixture();
  pc.rollSkill = async () => null;
  await assert.rejects(()=>adapter.executeAction('player',makeCommand()),{code:'action-cancelled'});
});

test('prepared and always-prepared spells remain distinguishable from unprepared spells', () => {
  const {adapter,pc} = fixture();
  pc.items = [0,1,2].map(prepared => ({id:`spell${prepared}`,name:`Spell ${prepared}`,type:'spell',system:{prepared,level:1}}));
  const spells = adapter.readCharacter('player','pc',scope).spells;
  assert.deepEqual(spells.map(spell => spell.prepared),[false,true,true]);
  assert.deepEqual(spells.map(spell => spell.preparationState),[0,1,2]);
});
