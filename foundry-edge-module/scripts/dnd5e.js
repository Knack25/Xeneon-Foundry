import { failure, sameScope, validateCommand, OPERATIONS } from './protocol.js';
import { canReadCharacter, requireCharacter, requirePlayer } from './authorization.js';

const number = value => Number.isFinite(value) ? value : null;
const text = value => typeof value === 'string' ? value : '';
const mapValues = (value, project) => Object.fromEntries(Object.entries(value ?? {}).map(([key,item]) => [key,project(item)]));

export function createAdapter({game, getScope, getRollMode}) {
  let revision = 0;
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
      preparationState:number(item.system?.prepared),
      equipped:item.system?.equipped === true,uses:{value:number(item.system?.uses?.value),max:number(item.system?.uses?.max)}}));
    return {scope:{...scope},revision:++revision,actorId:actor.id,name:actor.name,portraitRef:null,
      hp:{value:number(data.attributes?.hp?.value),max:number(data.attributes?.hp?.max),temp:number(data.attributes?.hp?.temp) ?? 0},
      ac:number(data.attributes?.ac?.value),
      speed:mapValues(data.attributes?.movement, value => typeof value === 'number' ? number(value) : text(value)),
      abilities:mapValues(data.abilities, value => ({value:number(value.value),mod:number(value.mod),save:number(value.save?.value)})),
      skills:mapValues(data.skills, value => ({total:number(value.total),passive:number(value.passive),ability:text(value.ability)})),
      resources:mapValues(data.resources, value => ({label:text(value.label),value:number(value.value),max:number(value.max)})),
      spellSlots:mapValues(data.spells, value => ({value:number(value.value),max:number(value.max)})),
      features:items.filter(item => !['weapon','equipment','consumable','tool','loot','container','spell'].includes(item.type)),
      spells:items.filter(item => item.type === 'spell'),
      inventory:items.filter(item => ['weapon','equipment','consumable','tool','loot','container'].includes(item.type)),
      capabilities:OPERATIONS.filter(op => !op.startsWith('roll.') || getRollMode() === 'public')};
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
      if (!Object.hasOwn(skill ? actor.system.skills ?? {} : actor.system.abilities ?? {}, input[key]))
        throw failure('unsupported-action', 'This character does not have the selected skill or ability.');
      const config = {[key]:input[key]};
      // Normal preserves system effects; selected advantage/disadvantage participates in native cancellation rules.
      if (input.mode === 'advantage') config.advantage = true;
      if (input.mode === 'disadvantage') config.disadvantage = true;
      const message = {create:true,rollMode:'public',data:{
        speaker:{actor:actor.id,alias:actor.name,scene:null,token:null},
        flags:{'foundry-edge':{requestingUserId:user.id,requestingPlayerName:user.name,
          requestId:command.requestId,scope:{...command.scope}}}
      }};
      const method = skill ? 'rollSkill' : operation === 'roll.save' ? 'rollSavingThrow' : 'rollAbilityCheck';
      rolls = await actor[method](config,{configure:false},message);
      if (!rolls?.length) throw failure('action-cancelled', 'Foundry cancelled the roll.');
    } else if (operation === 'hp.adjust') {
      await actor.applyDamage(-input.amount);
    } else {
      await actor.update({'system.attributes.hp.temp':input.value});
    }
    // A scope or permission change after execution must not reveal the resulting sheet.
    // The coordinator must classify any post-dispatch failure as an uncertain result, never auto-replay.
    const snapshot = readCharacter(userId,actor.id,command.scope);
    return {requestId:command.requestId,status:'completed',snapshot,
      ...(rolls ? {totals:rolls.map(roll => number(roll.total))} : {})};
  }
  return {listCharacters,readCharacter,executeAction};
}
