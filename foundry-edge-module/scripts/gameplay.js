import {failure} from './protocol.js';
import {concentrationKey} from './spells.js';
export async function gameplayAction({actor,operation,input,message,statusEffects=[]}){
 if(operation.startsWith('rest.')){
  const result=await actor[operation==='rest.short'?'shortRest':'longRest']({dialog:false,chat:true,autoHD:false,advanceTime:false,advanceBastionTurn:false});
  if(!result)throw failure('action-cancelled','Foundry did not allow this rest.');
  await result.message?.update(message.data);return;
 }
 if(operation==='condition.set'){
  if(['concentrating','encumbered','heavilyEncumbered','exceedingCarryingCapacity'].includes(input.id)||!statusEffects.some(s=>s.id===input.id))throw failure('unsupported-action','This condition is not configured in Foundry.');
  if(actor.statuses.has(input.id)!==input.expected)throw failure('stale-value','This condition changed. Refresh before editing.');
  await actor.toggleStatusEffect(input.id,{active:input.active});return;
 }
 if(operation==='inspiration.set'){
  if(actor.system.attributes.inspiration!==input.expected)throw failure('stale-value','Inspiration changed. Refresh before editing.');
  await actor.update({'system.attributes.inspiration':input.value});return;
 }
 if(operation==='concentration.end'){
  if(concentrationKey(actor)!==input.expected)throw failure('stale-value','Concentration changed. Refresh before ending it.');
  await actor.endConcentration();return;
 }
 throw failure('unsupported-action','Unsupported gameplay action.');
}
