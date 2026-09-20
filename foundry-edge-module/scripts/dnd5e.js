import { failure, sameScope, validateCommand, OPERATIONS, DETAIL_FIELDS } from './protocol.js';
import {editCharacter} from './controls.js';
import {createSpellControls,spellActivities,concentrationKey} from './spells.js';
import { canReadCharacter, requireCharacter, requirePlayer } from './authorization.js';

const number = value => Number.isFinite(value) ? value : null;
const text = value => typeof value === 'string' ? value : '';
const mapValues = (value, project) => Object.fromEntries(Object.entries(value ?? {}).map(([key,item]) => [key,project(item)]));

export function createAdapter({game, getScope, getRollMode}) {
  let revision = 0;
  const spellControls=createSpellControls({getScope});
  // Keep deleted final-shot ammunition briefly for a separate damage roll, scoped to its requesting player.
  const spentAmmo=new Map();
  const ammoKey=(userId,actorId,itemId,ammoId)=>JSON.stringify([getScope(),userId,actorId,itemId,ammoId]);
  function pruneAmmo(){for(const [key,entry]of spentAmmo)if(entry.expires<Date.now()||!sameScope(entry.scope,getScope()))spentAmmo.delete(key);}
  function ammunitionOptions(userId,actor,item){
    pruneAmmo();const options=(item.system.ammunitionOptions??[]).filter(o=>o.value).map(o=>({value:text(o.value),label:text(o.label)}));
    for(const entry of spentAmmo.values())if(entry.userId===userId&&entry.actorId===actor.id&&entry.itemId===item.id&&!actor.items.some(i=>i.id===entry.ammo.id)&&!options.some(o=>o.value===entry.ammo.id))options.push({value:entry.ammo.id,label:`${entry.ammo.name??'Ammunition'} (spent; damage only)`});
    return options;
  }
  function requireVersion() {
    if (Number(game.release?.generation) !== 14 || game.system?.id !== 'dnd5e' || game.system.version !== '5.3.3')
      throw failure('unsupported-version', 'This adapter targets Foundry 14 and D&D 5e 5.3.3 only.');
  }
  function requireScope(scope) {
    if (!sameScope(scope, getScope())) throw failure('stale-world', 'The active world changed. Refresh before acting.');
  }
  function listCharacters(userId) {
    requireVersion();
    const user = requirePlayer(game, userId);
    return [...game.actors.values()].filter(actor => canReadCharacter(actor,user))
      .map(actor => ({id:actor.id,name:actor.name}));
  }
  function readCharacter(userId, actorId, scope) {
    requireVersion();
    requireScope(scope);
    const {actor} = requireCharacter(game,userId,actorId);
    const data = actor.system;
    const items = [...actor.items].map(item => ({id:item.id,name:text(item.name),type:item.type,
      quantity:number(item.system?.quantity),description:text(item.system?.description?.value),
      level:number(item.system?.level),prepared:[1,2].includes(item.system?.prepared),
      preparationState:number(item.system?.prepared),activities:item.type==='spell'?spellActivities(item):[],
      equipped:item.system?.equipped === true,canEquip:typeof item.system?.equipped==='boolean',uses:{value:number(item.system?.uses?.value),max:number(Number(item.system?.uses?.max))}}));
    const attacks=[...actor.items].filter(item=>item.type==='weapon').flatMap(item=>[...(item.system.activities?.values()??[])].filter(a=>a.type==='attack').map(a=>({
      itemId:item.id,activityId:a.id,name:item.name,activityName:text(a.name),toHit:text(a.labels?.toHit),
      hasDamage:!!a.damage?.parts?.length||item.system.properties?.has('amm')===true,quantity:number(item.system.quantity),
      attackModes:(item.system.attackModes??[]).filter(o=>typeof o.value==='string').map(o=>({value:text(o.value),label:text(o.label)})),
      ammunition:ammunitionOptions(userId,actor,item),
      requiresAmmunition:item.system.properties?.has('amm')===true
    })));
    return {scope:{...scope},revision:++revision,actorId:actor.id,name:actor.name,portraitRef:null,attacks,
      hp:{value:number(data.attributes?.hp?.value),max:number(data.attributes?.hp?.max),temp:number(data.attributes?.hp?.temp) ?? 0},
      ac:number(data.attributes?.ac?.value),combatId:game.combat?.id??'',details:Object.fromEntries(DETAIL_FIELDS.map(key=>[key,key==='name'?actor.name:text(data.details?.[key])])),
      speed:mapValues(data.attributes?.movement, value => typeof value === 'number' ? number(value) : text(value)),
      abilities:mapValues(data.abilities, value => ({value:number(value.value),mod:number(value.mod),save:number(value.save?.value)})),
      skills:mapValues(data.skills, value => ({total:number(value.total),passive:number(value.passive),ability:text(value.ability)})),
      resources:mapValues(data.resources, value => ({label:text(value.label),value:number(value.value),max:number(value.max)})),
      spellSlots:mapValues(data.spells, value => ({value:number(value.value),max:number(value.max),level:number(value.level)})),
      concentration:concentrationKey(actor),recentCasts:spellControls.recent(actor,userId),
      features:items.filter(item => !['weapon','equipment','consumable','tool','loot','container','spell'].includes(item.type)),
      spells:items.filter(item => item.type === 'spell'),
      inventory:items.filter(item => ['weapon','equipment','consumable','tool','loot','container'].includes(item.type)),
      capabilities:OPERATIONS.filter(op => !(op.startsWith('roll.')||op.startsWith('spell.')) || getRollMode() === 'public')};
  }
  async function executeAction(userId, rawCommand) {
    const command = validateCommand(rawCommand);
    requireVersion();
    requireScope(command.scope);
    const {actor,user} = requireCharacter(game,userId,command.actorId);
    const {operation,input} = command;
    let rolls;
    if (operation.startsWith('roll.')) {
      if (getRollMode() !== 'public')
        throw failure('unsupported-roll-mode', 'Private rolls are not supported by this connector yet.');
      const skill = operation === 'roll.skill';
      const key = skill ? 'skill' : 'ability';
      const initiative=operation==='roll.initiative';
      const weaponRoll=['roll.attack','roll.damage'].includes(operation);
      if (!weaponRoll && !initiative && !Object.hasOwn(skill ? actor.system.skills ?? {} : actor.system.abilities ?? {}, input[key]))
        throw failure('unsupported-action', 'This character does not have the selected skill or ability.');
      const config = weaponRoll||initiative ? {} : {[key]:input[key]};
      // Normal preserves system effects; selected advantage/disadvantage participates in native cancellation rules.
      if (input.mode === 'advantage') config.advantage = true;
      if (input.mode === 'disadvantage') config.disadvantage = true;
      const message = {create:true,rollMode:'public',data:{
        speaker:{actor:actor.id,alias:actor.name,scene:null,token:null},
        flags:{'foundry-edge':{requestingUserId:user.id,requestingPlayerName:user.name,
          requestId:command.requestId,scope:{...command.scope}}}
      }};
      const method = skill ? 'rollSkill' : operation === 'roll.save' ? 'rollSavingThrow' : 'rollAbilityCheck';
      if(initiative){
        if(input.combatId!==(game.combat?.id??''))throw failure('stale-combat','The active encounter changed. Refresh before rolling initiative.');
        const combatants=game.combat?.combatants?.filter(c=>c.actor?.id===actor.id)??[];
        if(combatants.length){
          const combat=await actor.rollInitiative({createCombatants:false,rerollInitiative:true,initiativeOptions:{messageMode:'public',messageOptions:message.data}},config);
          if(!combat)throw failure('action-cancelled','Foundry cancelled initiative.');
          rolls=combatants.map(c=>({total:c.initiative}));
        }else{const roll=await actor.getInitiativeRoll(config).evaluate();await roll.toMessage(message.data,{messageMode:'public'});rolls=[roll];}
      }else if(weaponRoll){
        const item=[...actor.items].find(i=>i.id===input.itemId&&i.type==='weapon');
        const activity=item?.system.activities?.get(input.activityId);
        const modes=(item?.system.attackModes??[]).filter(o=>typeof o.value==='string');
        pruneAmmo();
        const liveAmmo=input.ammunitionId ? [...actor.items].find(i=>i.id===input.ammunitionId) : null;
        const retained=operation==='roll.damage'&&!liveAmmo ? spentAmmo.get(ammoKey(userId,actor.id,input.itemId,input.ammunitionId)) : null;
        const ammo=liveAmmo??retained?.ammo;
        if(!activity||activity.type!=='attack'||(operation==='roll.attack'&&item.system.quantity===0)
          || (modes.length ? !modes.some(o=>o.value===input.attackMode) : input.attackMode!=='')
          || (input.ammunitionId && (!ammo||(!retained&&!(item.system.ammunitionOptions??[]).some(o=>o.value===input.ammunitionId))))
          || (item.system.properties?.has('amm') && !ammo)
          || (operation==='roll.attack'&&ammo?.system.quantity===0)
          || (operation==='roll.damage'&&!activity.damage?.parts?.length&&!ammo))
          throw failure('unsupported-action','This weapon, attack mode or ammunition is no longer available. Refresh the sheet.');
        config.attackMode=input.attackMode;
        config.ammunition=operation==='roll.attack'?input.ammunitionId:ammo;
        if(operation==='roll.damage')config.isCritical=input.mode==='critical';
        const ammoCopy=operation==='roll.attack'?ammo?.clone?.({}, {keepId:true}):null;
        rolls=await activity[operation==='roll.attack'?'rollAttack':'rollDamage'](config,{configure:false},message);
        if(rolls?.length&&ammoCopy&&!actor.items.some(i=>i.id===ammoCopy.id)){
          if(spentAmmo.size>=100)spentAmmo.delete(spentAmmo.keys().next().value);
          spentAmmo.set(ammoKey(userId,actor.id,item.id,ammoCopy.id),{ammo:ammoCopy,userId,actorId:actor.id,itemId:item.id,scope:{...command.scope},expires:Date.now()+600000});
        }
      }else rolls = await actor[method](config,{configure:false},message);
      if (!rolls?.length) throw failure('action-cancelled', 'Foundry cancelled the roll.');
    } else if (operation === 'hp.adjust') {
      await actor.applyDamage(-input.amount);
    } else if(operation.startsWith('spell.')){
      if(getRollMode()!=='public')throw failure('unsupported-roll-mode','Only public spellcasting is supported.');
      const message={create:true,rollMode:'public',data:{speaker:{actor:actor.id,alias:actor.name,scene:null,token:null},flags:{'foundry-edge':{requestingUserId:user.id,requestingPlayerName:user.name,requestId:command.requestId,scope:{...command.scope}}}}};
      if(operation==='spell.cast')await spellControls.cast(actor,userId,command,message);
      else rolls=await spellControls.roll(actor,userId,operation,input,message);
    } else if(operation==='hp.temp.set') {
      await actor.update({'system.attributes.hp.temp':input.value});
    } else await editCharacter(actor,operation,input);
    // A scope or permission change after execution must not reveal the resulting sheet.
    // The coordinator must classify any post-dispatch failure as an uncertain result, never auto-replay.
    const snapshot = readCharacter(userId,actor.id,command.scope);
    return {requestId:command.requestId,status:'completed',snapshot,
      ...(rolls ? {totals:rolls.map(roll => number(roll.total))} : {})};
  }
  return {listCharacters,readCharacter,executeAction};
}
