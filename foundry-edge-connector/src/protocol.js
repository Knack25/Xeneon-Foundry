// Shared by the connector, module and widget; keep this module browser-safe.
export const PROTOCOL_VERSION = 1;
export const OPERATIONS = Object.freeze(['hp.adjust', 'hp.temp.set', 'roll.ability', 'roll.save', 'roll.skill', 'roll.attack', 'roll.damage','roll.initiative','item.equip','item.quantity','uses.set','slots.set','resource.set','details.set','spell.cast','spell.attack','spell.damage']);
export const DETAIL_FIELDS=Object.freeze(['name','alignment','appearance','trait','ideal','bond','flaw','age','gender','faith','height','weight','eyes','hair','skin']);
export const ABILITIES = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export const SKILLS = Object.freeze(['acr', 'ani', 'arc', 'ath', 'dec', 'his', 'ins', 'itm', 'inv', 'med', 'nat', 'prc', 'prf', 'per', 'rel', 'slt', 'ste', 'sur']);

export function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const fields = (value, keys) => record(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const validScope = scope => fields(scope, ['instanceId', 'worldId', 'generation'])
  && Object.values(scope).every(identifier);

export function sameScope(a, b) {
  return validScope(a) && validScope(b)
    && ['instanceId', 'worldId', 'generation'].every(key => a[key] === b[key]);
}

export function validateCommand(raw) {
  const invalid = () => { throw failure('invalid-command', 'The character action is invalid.'); };
  if (!fields(raw, ['requestId', 'scope', 'actorId', 'operation', 'input'])
    || !identifier(raw.requestId) || !identifier(raw.actorId) || !validScope(raw.scope)
    || !OPERATIONS.includes(raw.operation)) invalid();
  const input = raw.input;
  if(raw.operation==='details.set'){
    if(!fields(input,['field','value','expected'])||!DETAIL_FIELDS.includes(input.field)||!['value','expected'].every(k=>typeof input[k]==='string'&&input[k].length<=2000)||(input.field==='name'&&!input.value.trim()))invalid();
  }else if(['item.equip','item.quantity','uses.set','slots.set','resource.set'].includes(raw.operation)){
    const item=raw.operation.startsWith('item.')||raw.operation==='uses.set';const key=item?'itemId':'key';
    if(!fields(input,[key,'value','expected'])||!identifier(input[key]))invalid();
    if(raw.operation==='slots.set'&&!/^spell[1-9]$|^pact$/.test(input.key))invalid();
    if(raw.operation==='resource.set'&&!['primary','secondary','tertiary'].includes(input.key))invalid();
    if(raw.operation==='item.equip'){if(typeof input.value!=='boolean'||typeof input.expected!=='boolean')invalid();}
    else if(!['value','expected'].every(k=>Number.isSafeInteger(input[k])&&input[k]>=0&&input[k]<=100000))invalid();
  }else if(raw.operation==='roll.initiative'){
    if(!fields(input,['mode','combatId'])||!(input.combatId===''||identifier(input.combatId))||!['normal','advantage','disadvantage'].includes(input.mode))invalid();
  }else if(raw.operation==='spell.cast'){
    if(!fields(input,['itemId','activityId','slot','concentration'])||!identifier(input.itemId)||!identifier(input.activityId)||typeof input.slot!=='string'||!/^$|^spell[1-9]$|^pact$/.test(input.slot)||typeof input.concentration!=='string'||input.concentration.length>2000)invalid();
  }else if(['spell.attack','spell.damage'].includes(raw.operation)){
    if(!fields(input,['castId','mode'])||!identifier(input.castId)||!(raw.operation==='spell.attack'?['normal','advantage','disadvantage']:['normal','critical']).includes(input.mode))invalid();
  }else if (raw.operation === 'hp.adjust') {
    if (!fields(input, ['amount']) || !Number.isSafeInteger(input.amount) || Math.abs(input.amount) > 100000) invalid();
  } else if (raw.operation === 'hp.temp.set') {
    if (!fields(input, ['value']) || !Number.isSafeInteger(input.value) || input.value < 0 || input.value > 100000) invalid();
  } else if (['roll.attack','roll.damage'].includes(raw.operation)) {
    if (!fields(input,['itemId','activityId','attackMode','ammunitionId','mode'])
      || !identifier(input.itemId) || !identifier(input.activityId)
      || !(input.attackMode === '' || identifier(input.attackMode))
      || !(input.ammunitionId === '' || identifier(input.ammunitionId))
      || !(raw.operation === 'roll.attack' ? ['normal','advantage','disadvantage'] : ['normal','critical']).includes(input.mode)) invalid();
  } else {
    const skill = raw.operation === 'roll.skill';
    const key = skill ? 'skill' : 'ability';
    if (!fields(input, [key, 'mode']) || !(skill ? SKILLS : ABILITIES).includes(input[key])
      || !['normal', 'advantage', 'disadvantage'].includes(input.mode)) invalid();
  }
  return { requestId: raw.requestId, scope: { ...raw.scope }, actorId: raw.actorId,
    operation: raw.operation, input: { ...input } };
}

export function validateConnectorUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error();
    return url.href.replace(/\/+$/, '');
  } catch {
    throw failure('invalid-url', 'Enter an HTTPS connector address without a username, password, query or fragment.');
  }
}
