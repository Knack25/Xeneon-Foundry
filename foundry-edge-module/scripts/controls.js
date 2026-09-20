import {failure,DETAIL_FIELDS} from './protocol.js';
const physical=['weapon','equipment','consumable','tool','loot','container'];
export async function editCharacter(actor,operation,input){
 const stale=current=>{if(current!==input.expected)throw failure('stale-value','This value changed in Foundry. Refresh before editing.');};
 const bounded=(value,max)=>{if(!Number.isSafeInteger(value)||value<0||!Number.isFinite(max)||value>max)throw failure('invalid-value','The value exceeds the current allowed range.');};
 if(operation==='currency.set'){stale(actor.system.currency?.[input.key]);bounded(input.value,100000000);return actor.update({[`system.currency.${input.key}`]:input.value});}
 if(operation==='details.set'){
  if(!DETAIL_FIELDS.includes(input.field))throw failure('unsupported-action','Unsupported character field.');
  const key=input.field==='name'?'name':`system.details.${input.field}`;
  stale(input.field==='name'?actor.name:actor.system.details?.[input.field]??'');
  if(typeof input.value!=='string'||input.value.length>2000||(input.field==='name'&&!input.value.trim()))throw failure('invalid-value','Enter a valid character detail.');
  return actor.update({[key]:input.value});
 }
 if(operation==='slots.set'||operation==='resource.set'){
  const group=operation==='slots.set'?'spells':'resources';const resource=actor.system[group]?.[input.key];
  if(!resource)throw failure('unsupported-action','This resource is no longer available.');
  stale(resource.value);bounded(input.value,resource.max);return actor.update({[`system.${group}.${input.key}.value`]:input.value});
 }
 const item=[...actor.items].find(i=>i.id===input.itemId);
 if(!item)throw failure('unsupported-action','This item is no longer available.');
 if(operation==='spell.prepare'){
  if(item.type!=='spell'||![0,1].includes(item.system.prepared))throw failure('unsupported-action','Always-prepared spells cannot be changed here.');
  stale(item.system.prepared);return item.update({'system.prepared':input.value});
 }
 if(operation==='uses.set'){
  stale(item.system.uses?.value);bounded(input.value,Number(item.system.uses?.max));
  return item.update({'system.uses.spent':Number(item.system.uses.max)-input.value});
 }
 if(!physical.includes(item.type))throw failure('unsupported-action','Only inventory items support this edit.');
 if(operation==='item.attune'){
  if(!item.system.attunement)throw failure('unsupported-action','This item does not require attunement.');
  stale(item.system.attuned);const attunement=actor.system.attributes?.attunement;
  if(input.value&&attunement?.value>=attunement?.max)throw failure('invalid-value','No attunement slots remain.');
  return item.update({'system.attuned':input.value});
 }
 if(operation==='item.container'){
  stale(item.system.container??'');let target=input.value,visited=new Set([item.id]);
  while(target){if(visited.has(target))throw failure('invalid-value','Containers cannot contain themselves or form a cycle.');visited.add(target);const parent=[...actor.items].find(i=>i.id===target&&i.type==='container');if(!parent)throw failure('unsupported-action','Select a container belonging to this character.');target=parent.system.container;}
  return item.update({'system.container':input.value||null});
 }
 if(operation==='item.equip'){
  if(typeof item.system.equipped!=='boolean'||typeof input.value!=='boolean')throw failure('unsupported-action','This item cannot be equipped.');
  stale(item.system.equipped);return item.update({'system.equipped':input.value});
 }
 if(operation==='item.quantity'){stale(item.system.quantity);bounded(input.value,100000);return item.update({'system.quantity':input.value});}
 throw failure('unsupported-action','Unsupported character edit.');
}
