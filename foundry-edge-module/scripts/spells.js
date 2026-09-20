import {failure,sameScope} from './protocol.js';
const supported=['attack','damage','heal','save','utility'];
export const concentrationKey=actor=>[...(actor.concentration?.effects??[])].map(e=>e.id).sort().join(',');
export function spellActivities(item){return [...(item.system.activities?.values()??[])].map(a=>({id:a.id,name:a.name,type:a.type,
 supported:supported.includes(a.type)&&a.canUse!==false,requiresSlot:a.requiresSpellSlot===true,concentration:a.requiresConcentration===true}));}
export function createSpellControls({getScope}){
 const casts=new Map();
 const castKey=(actor,userId,castId)=>JSON.stringify([actor.id,userId,castId]);
 const prune=()=>{for(const [key,value]of casts)if(value.expires<Date.now()||!sameScope(value.scope,getScope()))casts.delete(key);};
 function recent(actor,userId){prune();return [...casts.values()].filter(c=>c.actorId===actor.id&&c.userId===userId&&actor.items.some(i=>i.id===c.itemId)).map(c=>({castId:c.castId,name:c.name,level:c.level,attack:c.activity.type==='attack',damage:typeof c.activity.rollDamage==='function'&&!!(c.activity.damage?.parts?.length||c.activity.healing),healing:c.activity.type==='heal'}));}
 async function cast(actor,userId,command,message){
  const scope={...command.scope};
  if(!sameScope(scope,getScope()))throw failure('stale-world','The active world changed.');
  const input=command.input;const item=[...actor.items].find(i=>i.id===input.itemId&&i.type==='spell');const activity=item?.system.activities?.get(input.activityId);
  if(!activity||!supported.includes(activity.type)||activity.canUse===false||(item.system.level>0&&item.system.prepared===0))throw failure('unsupported-action','Prepare this spell or use its supported activity in Foundry.');
  if(input.concentration!==concentrationKey(actor))throw failure('stale-value','Concentration changed. Refresh before casting.');
  const slot=actor.system.spells?.[input.slot];
  if(activity.requiresSpellSlot){if(!slot||slot.value<1||(slot.level??Number(input.slot.slice(-1)))<item.system.level)throw failure('invalid-value','No suitable spell slot remains.');}
  else if(input.slot!=='')throw failure('invalid-value','This spell does not use a spell slot.');
  const result=await activity.use({spell:{slot:input.slot},create:{measuredTemplate:false},subsequentActions:false},{configure:false},message);
  if(!result?.message)throw failure('action-cancelled','Foundry cancelled this cast.');
  const scaling=result.message.system?.scaling??0;
  const consumed=activity.createConsumedFlag?.(actor,result.message.system?.deltas);
  const clone=item.clone({'flags.dnd5e.scaling':scaling,...(consumed?{'flags.dnd5e.consumed':consumed}:{})},{keepId:true});
  clone.prepareFinalAttributes?.();
  if(!sameScope(scope,getScope()))throw failure('stale-world','The world changed during casting. Check Foundry before acting again.');
  prune();if(casts.size>=100)casts.delete(casts.keys().next().value);
  casts.set(castKey(actor,userId,command.requestId),{castId:command.requestId,userId,actorId:actor.id,itemId:item.id,messageId:result.message.id,name:item.name,level:item.system.level+scaling,activity:clone.system.activities.get(activity.id),scope,expires:Date.now()+600000});
 }
 async function roll(actor,userId,operation,input,message){
  prune();const cast=casts.get(castKey(actor,userId,input.castId));
  if(!cast||cast.userId!==userId||cast.actorId!==actor.id||!actor.items.some(i=>i.id===cast.itemId))throw failure('expired-cast','This cast is no longer available. Use its Foundry chat card.');
  const activity=cast.activity;let config={};
  if(operation==='spell.attack'){
   if(activity.type!=='attack')throw failure('unsupported-action','This cast has no attack roll.');
   if(input.mode==='advantage')config.advantage=true;if(input.mode==='disadvantage')config.disadvantage=true;
  }else {if(typeof activity.rollDamage!=='function'||(!activity.damage?.parts?.length&&!activity.healing))throw failure('unsupported-action','This cast has no damage or healing roll.');config.isCritical=input.mode==='critical';if(activity.type==='heal'&&config.isCritical)throw failure('unsupported-action','Healing cannot critically hit.');}
  message={...message,data:{...message.data,flags:{...message.data?.flags,dnd5e:{...message.data?.flags?.dnd5e,originatingMessage:cast.messageId}}}};
  const rolls=await activity[operation==='spell.attack'?'rollAttack':'rollDamage'](config,{configure:false},message);
  if(!rolls?.length)throw failure('action-cancelled','Foundry cancelled the roll.');return rolls;
 }
 return {recent,cast,roll};
}
