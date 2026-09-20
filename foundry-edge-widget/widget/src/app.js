import {preferencesKey,readPreferences,savePreferences,toggleFavorite,moveFavorite} from './preferences.js';
import {reduce} from './state.js';
const $=id=>document.getElementById(id),storageKey='foundry-edge-preview:'+location.origin;
let token=localStorage.getItem(storageKey),state={scope:null,characters:[],selected:null,snapshot:null},tab='abilities',busy=false,polling=false,epoch=0,dialogAction=null,lastRequest=null;
let filterText='',spellFilter='all',schoolFilter='',prefs={},portraitKey='',portraitAt=0,lastTurn='';
const names={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma',acr:'Acrobatics',ani:'Animal Handling',arc:'Arcana',ath:'Athletics',dec:'Deception',his:'History',ins:'Insight',itm:'Intimidation',inv:'Investigation',med:'Medicine',nat:'Nature',prc:'Perception',prf:'Performance',per:'Persuasion',rel:'Religion',slt:'Sleight of Hand',ste:'Stealth',sur:'Survival'};
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value??'—';if(className)e.className=className;return e;};
const signed=value=>value==null?'—':`${value>=0?'+':''}${value}`;
const message=value=>$('status').textContent=value;
async function api(path,data){
 const response=await fetch(path,{method:data?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error?.message??'Connection failed.'),{code:value.error?.code});return value;
}
function clear(){epoch++;state=reduce(state,{type:'clear'});$('dashboard').hidden=true;$('sheet').replaceChildren();$('characters').replaceChildren();$('action-dialog').close();dialogAction=null;portraitKey='';$('portrait-image').hidden=true;$('portrait-image').removeAttribute('src');}
const selectionKey=()=>storageKey+':'+state.scope.instanceId+':'+state.scope.worldId;
async function refresh(){
 if(!token||polling)return;polling=true;const version=epoch;
 try{
  const world=await api('/v1/world');if(version!==epoch)return;
  if(JSON.stringify(state.scope)!==JSON.stringify(world.scope)){$('dashboard').hidden=true;$('sheet').replaceChildren();$('action-dialog').close();}
  state=reduce(state,{type:'world',scope:world.scope});
  if(!world.scope){clear();message('Waiting for a configured Foundry world.');return;}
  const list=await api('/v1/characters');if(version!==epoch||JSON.stringify(list.scope)!==JSON.stringify(state.scope))return;
  state.characters=list.characters;
  if(!state.characters.some(c=>c.id===state.selected)){
   $('dashboard').hidden=true;$('sheet').replaceChildren();$('action-dialog').close();dialogAction=null;
   state.selected=state.characters.find(c=>c.id===localStorage.getItem(selectionKey()))?.id??state.characters[0]?.id??null;state.snapshot=null;
  }
  $('characters').replaceChildren(...state.characters.map(c=>{const o=text('option',c.name);o.value=c.id;return o;}));$('characters').value=state.selected??'';
  $('pairing').hidden=true;$('forget').hidden=false;$('connection').textContent='Connected · live test world';$('world').textContent=state.scope.worldId;
  if(!state.selected){$('dashboard').hidden=true;message('No owned player characters are available in this world.');return;}
  const snapshot=await api('/v1/characters/'+encodeURIComponent(state.selected));if(version!==epoch)return;
  state=reduce(state,{type:'snapshot',snapshot});void loadPortrait(snapshot);render();if($('status').textContent==='Ready to pair.'||$('status').textContent==='Paired. Loading your character…')message('Live character sheet · changes sync with Foundry.');
 }catch(error){if(version===epoch){clear();$('connection').textContent='Disconnected';message(error.message);if(error.code==='unauthorized'){localStorage.removeItem(storageKey);token=null;$('pairing').hidden=false;}}}
 finally{polling=false;}
}
function actionButton(label,operation,input){const b=text('button',label);b.disabled=busy||!state.snapshot?.capabilities.includes(operation);b.onclick=()=>openAction({operation,input,label});return b;}
async function loadPortrait(snapshot){
 const key=JSON.stringify([snapshot.scope,snapshot.actorId]);if(key===portraitKey&&Date.now()-portraitAt<60000)return;
 const version=epoch;portraitKey=key;portraitAt=Date.now();$('portrait-image').hidden=true;$('portrait-image').removeAttribute('src');
 try{const value=await api('/v1/characters/'+snapshot.actorId+'/portrait');if(epoch!==version||portraitKey!==key||state.selected!==snapshot.actorId)return;if(value.dataUrl){$('portrait-image').src=value.dataUrl;$('portrait-image').hidden=false;}}catch{}
}
function savePrefs(next){prefs=next;savePreferences(localStorage,preferencesKey(state.scope,state.selected),prefs);render();}
function quickCatalog(s){
 const actions=[];const add=(id,label,operation,input,extra={})=>actions.push({id,label,operation,input,...extra});
 for(const [key]of Object.entries(s.abilities??{})){add('check:'+key,(names[key]??key)+' check','roll.ability',{ability:key});add('save:'+key,(names[key]??key)+' save','roll.save',{ability:key});}
 for(const [key]of Object.entries(s.skills??{}))add('skill:'+key,names[key]??key,'roll.skill',{skill:key});
 for(const w of s.attacks??[])for(const [kind,op]of [['Attack','roll.attack'],['Damage','roll.damage']])if(kind==='Attack'||w.hasDamage)add(op+':'+w.itemId+':'+w.activityId,w.name+' '+kind,op,{itemId:w.itemId,activityId:w.activityId},{weapon:w});
 for(const item of [...(s.spells??[]),...(s.features??[]),...(s.inventory??[])])for(const a of item.activities??[])if(a.supported&&(item.type==='spell'||['feat','consumable','equipment','tool'].includes(item.type))&&(item.type!=='spell'||item.level===0||item.preparationState!==0))add('use:'+item.id+':'+a.id,item.name+' - '+a.name,item.type==='spell'?'spell.cast':'activity.use',{itemId:item.id,activityId:a.id,concentration:s.concentration??''},{requiresSlot:a.requiresSlot,level:item.level??0});
 return actions;
}
function presetButton(action){const b=actionButton(action.label,action.operation,action.input);b.onclick=()=>openAction(action);return b;}
const isRoll=operation=>operation.startsWith('roll.')||['spell.attack','spell.damage'].includes(operation);
function openAction(action){
 if(busy||!state.snapshot)return;
 dialogAction={...action,scope:{...state.scope},actorId:state.selected};
 $('action-title').textContent=action.label;
 const roll=isRoll(action.operation),cast=['spell.cast','activity.use'].includes(action.operation),edit=action.edit;
 $('amount-label').hidden=roll||cast||edit==='text'||edit==='toggle'||edit==='none'||edit==='select';
 $('amount').required=!$('amount-label').hidden;$('amount').value=action.input?.expected??'';
 $('choice-label').hidden=edit!=='select';if(edit==='select')$('choice').replaceChildren(...action.options.map(v=>{const o=text('option',v.label);o.value=v.value;return o;}));
 $('dc-label').hidden=action.operation!=='roll.concentration';$('dc').value='10';
 $('text-label').hidden=edit!=='text';$('text-value').value=edit==='text'?action.input.expected:'';
 $('mode-label').hidden=!roll||action.operation==='roll.hitDie';
 const modes=['roll.damage','spell.damage'].includes(action.operation)?(action.healing?['normal']:['normal','critical']):['normal','advantage','disadvantage'];
 $('mode').replaceChildren(...modes.map(value=>{const o=text('option',value[0].toUpperCase()+value.slice(1));o.value=value;return o;}));
 for(const [id,options] of [['attack-mode',action.weapon?.attackModes],['ammunition',action.weapon?.ammunition]]){
  $(id+'-label').hidden=!action.weapon;$(id).replaceChildren(...(options?.length?options:[{value:'',label:'None'}]).map(value=>{const o=text('option',value.label);o.value=value.value;return o;}));
 }
 $('slot-label').hidden=!cast;
 if(cast){const options=action.requiresSlot?Object.entries(state.snapshot.spellSlots).filter(([,v])=>v.value>0&&v.level>=action.level).map(([key,v])=>({value:key,label:`Level ${v.level} ${key==='pact'?'pact ':''}(${v.value} remaining)`})):[{value:'',label:'No slot required'}];$('slot').replaceChildren(...options.map(v=>{const o=text('option',v.label);o.value=v.value;return o;}));$('confirm').disabled=!options.length;}else $('confirm').disabled=false;
 $('action-note').textContent=cast?'Casting consumes the selected slot and configured resources. Concentration may replace your current spell. Resolve targets and templates in Foundry.':action.weapon?'Attack modes may consume ammunition or thrown weapons. Damage rolls do not change target HP.':action.operation==='roll.initiative'?'Updates existing combat entries for this character. Outside combat, posts an initiative roll to chat.':edit?'Saves this value to Foundry if it has not changed since you opened this control.':roll?'Posts a native roll to Foundry chat.':'Changes are applied to the live Foundry character.';
 if(action.note)$('action-note').textContent=action.note;
 $('action-dialog').showModal();
}
function editButton(label,operation,input,edit='number'){const b=actionButton(label,operation,input);b.onclick=()=>openAction({label,operation,input,edit});return b;}
function render(){
 const s=state.snapshot;if(!s)return;prefs=readPreferences(localStorage,preferencesKey(state.scope,state.selected));document.documentElement.dataset.theme=prefs.theme;document.documentElement.dataset.fontSize=prefs.fontSize;
 const turn=s.combat?`${s.combat.id}:${s.combat.round}:${s.combat.turn}`:'';$('combat-status').textContent=s.combat?`Round ${s.combat.round??0} - ${s.combat.yourTurn?'Your turn':s.combat.currentName||'Waiting'} - Initiative ${s.combat.initiative??'-'}`:'Outside combat';if(turn!==lastTurn&&lastTurn&&s.combat?.yourTurn&&prefs.turnAlert){$('combat-status').classList.add('turn-alert');setTimeout(()=>$('combat-status').classList.remove('turn-alert'),5000);}lastTurn=turn;
 $('sheet-search').hidden=!['quick','spells','inventory','features'].includes(tab);$('spell-filter').hidden=tab!=='spells';$('school-filter').hidden=tab!=='spells';$('dashboard').hidden=false;$('name').textContent=s.name;$('hp').textContent=`${s.hp.value} / ${s.hp.max}`;$('ac').textContent=s.ac??'—';$('temp').textContent=`${s.hp.temp} temporary HP`;
 $('speed').textContent=Object.entries(s.speed).filter(([,v])=>typeof v==='number'&&v>0).map(([k,v])=>`${k} ${v}`).join(' · ');
 for(const b of document.querySelectorAll('[data-hp]'))b.disabled=busy||!s.capabilities.includes(b.dataset.hp==='temp'?'hp.temp.set':'hp.adjust');
 const fragment=document.createDocumentFragment();
 if(['quick','spells','features','inventory'].includes(tab)){
  for(const cast of s.recentCasts??[]){const card=text('div','','card');card.append(text('h3',`${cast.name} - cast at level ${cast.level}`));
   if(cast.attack)card.append(actionButton('Spell attack','spell.attack',{castId:cast.castId}));
   if(cast.damage){const b=actionButton(cast.healing?'Roll healing':'Spell damage','spell.damage',{castId:cast.castId});b.onclick=()=>openAction({label:cast.healing?'Roll healing':'Spell damage',operation:'spell.damage',input:{castId:cast.castId},healing:cast.healing});card.append(b);}fragment.append(card);
  }
 }

 if(tab==='quick'){
  const catalog=quickCatalog(s),pinned=prefs.favorites.map(id=>catalog.find(a=>a.id===id)).filter(Boolean);
  const grid=text('div','','grid quick-grid');for(const action of pinned){const card=text('div','','card');card.append(presetButton(action));for(const [label,delta]of [['Move earlier',-1],['Move later',1]]){const b=text('button',label);b.onclick=()=>savePrefs(moveFavorite(prefs,action.id,delta));card.append(b);}const remove=text('button','Unpin');remove.onclick=()=>savePrefs(toggleFavorite(prefs,action.id));card.append(remove);grid.append(card);}fragment.append(grid);
  fragment.append(text('h3','Available actions'));for(const action of catalog.filter(a=>a.label.toLowerCase().includes(filterText.toLowerCase()))){const row=text('div','','row'),b=text('button',prefs.favorites.includes(action.id)?'Unpin':'Pin');b.onclick=()=>savePrefs(toggleFavorite(prefs,action.id));row.append(text('span',action.label),b);fragment.append(row);}
 }else if(tab==='display'){
  for(const [key,options]of [['theme',['violet','blue','green','amber']],['fontSize',['normal','large']]]){const label=text('label',key==='theme'?'Character color':'Text size');const select=document.createElement('select');select.id='pref-'+key;for(const v of options){const o=text('option',v);o.value=v;select.append(o);}select.value=prefs[key];select.onchange=()=>savePrefs({...prefs,[key]:select.value});label.append(select);fragment.append(label);}
  const b=text('button',prefs.turnAlert?'Turn alert: on':'Turn alert: off');b.onclick=()=>savePrefs({...prefs,turnAlert:!prefs.turnAlert});fragment.append(b);
 }else if(tab==='session'){
  fragment.append(presetButton({label:'Short rest',operation:'rest.short',input:{},edit:'none',note:'Recover short-rest resources using Foundry. Spend any Hit Dice below. World time is not advanced.'}),presetButton({label:'Long rest',operation:'rest.long',input:{},edit:'none',note:'Recover HP, Hit Dice, spell slots and resources using Foundry. World time is not advanced.'}));
  for(const hd of s.hitDice??[])if(hd.value>0)fragment.append(presetButton({label:`Spend ${hd.denomination} (${hd.value} left)`,operation:'roll.hitDie',input:{denomination:hd.denomination},edit:'none',note:'Spend one Hit Die and apply native healing to this character.'}));
  fragment.append(editButton(s.inspiration?'Remove inspiration':'Grant inspiration','inspiration.set',{value:!s.inspiration,expected:s.inspiration},'toggle'));
  if(s.hp.value===0){fragment.append(text('p',`Death saves: ${s.death?.success??0} successes / ${s.death?.failure??0} failures`));if((s.death?.success??0)<3&&(s.death?.failure??0)<3)fragment.append(actionButton('Death saving throw','roll.death',{}));}
  if(s.concentration){fragment.append(actionButton('Concentration save','roll.concentration',{}),presetButton({label:'End concentration',operation:'concentration.end',input:{expected:s.concentration},edit:'none'}));}
  fragment.append(text('h3','Conditions'));for(const c of s.conditions??[]){fragment.append(editButton((c.active?'Remove ':'Add ')+c.name,'condition.set',{id:c.id,active:!c.active,expected:c.active},'toggle'));}
 }else if(tab==='details'){
  for(const [field,value]of Object.entries(s.details??{})){const row=text('div','','row');row.append(text('span',`${field}: ${value||'Not set'}`),editButton(`Edit ${field}`,'details.set',{field,expected:value},'text'));fragment.append(row);}
 }else if(tab==='abilities'){
  const grid=text('div','','grid');for(const [key,a]of Object.entries(s.abilities)){const card=text('div','','card');card.append(text('h3',names[key]??key),text('strong',`${a.value} (${signed(a.mod)})`,'score'),actionButton('Check','roll.ability',{ability:key}),actionButton(`Save ${signed(a.save)}`,'roll.save',{ability:key}));grid.append(card);}fragment.append(grid);
 }else if(tab==='attacks'){
  fragment.append(actionButton('Roll initiative','roll.initiative',{combatId:s.combatId??''}));
  if(!s.attacks?.length)fragment.append(text('p','No weapon attack activities are available.','muted'));
  for(const attack of s.attacks??[]){const card=text('div','','card');card.append(text('h3',attack.name),text('p',`${attack.activityName} ${attack.toHit}`));
   for(const [label,operation] of [['Attack','roll.attack'],['Damage','roll.damage']]){const button=actionButton(label,operation,{itemId:attack.itemId,activityId:attack.activityId});button.onclick=()=>openAction({label:`${attack.name}: ${label}`,operation,input:{itemId:attack.itemId,activityId:attack.activityId},weapon:attack});button.disabled ||= operation==='roll.damage'&&!attack.hasDamage;card.append(button);}fragment.append(card);
  }
 }else if(tab==='skills'){
  for(const [key,value]of Object.entries(s.skills)){const row=text('div','','row');row.append(text('span',`${names[key]??key} · passive ${value.passive??'—'}`),actionButton(signed(value.total),'roll.skill',{skill:key}));fragment.append(row);}
 }else if(tab==='spells'){
  if(!s.spells?.length)fragment.append(text('p','No spells listed.','muted'));
  for(const item of (s.spells??[]).filter(i=>i.name.toLowerCase().includes(filterText.toLowerCase())&&(schoolFilter===''||i.school===schoolFilter)&&(spellFilter==='all'||spellFilter==='prepared'&&i.prepared||spellFilter==='concentration'&&i.concentration||spellFilter==='ritual'&&i.ritual||String(i.level)===spellFilter))){const card=text('div','','card');card.append(text('h3',`${item.name} - ${item.level===0?'Cantrip':'Level '+item.level}${item.prepared?' - prepared':''}`));
   if([0,1].includes(item.preparationState))card.append(presetButton({label:item.prepared?'Unprepare':'Prepare',operation:'spell.prepare',input:{itemId:item.id,expected:item.preparationState,value:item.prepared?0:1},edit:'none'}));
   for(const activity of item.activities??[]){const b=actionButton(`Cast ${activity.name}`,'spell.cast',{});b.disabled ||= !activity.supported||(item.level>0&&item.preparationState===0);b.onclick=()=>openAction({label:`Cast ${item.name}: ${activity.name}`,operation:'spell.cast',input:{itemId:item.id,activityId:activity.id,concentration:s.concentration??''},requiresSlot:activity.requiresSlot,level:item.level});card.append(b);if(!activity.supported)card.append(text('p','Use this activity in Foundry.','muted'));}
   const detail=document.createElement('details');detail.dataset.itemId=item.id;detail.append(text('summary','Description'),text('p',new DOMParser().parseFromString(item.description??'','text/html').body.textContent,'item-detail'));card.append(detail);fragment.append(card);
  }
 }else if(tab==='resources'){
  for(const [key,value]of Object.entries(s.currency??{})){const row=text('div','','row');row.append(text('span',`${key}: ${value}`),editButton('Set '+key,'currency.set',{key,expected:value}));fragment.append(row);}
  for(const [group,values] of [['resource',s.resources],['slots',s.spellSlots]])for(const [key,value]of Object.entries(values??{})){const row=text('div','','row');row.append(text('span',value.label||key),text('strong',`${value.value??'-'} / ${value.max??'-'}`));if(Number.isInteger(value.value)&&Number.isFinite(value.max))row.append(editButton('Set remaining',group+'.set',{key,expected:value.value}));fragment.append(row);}
  for(const item of [...(s.inventory??[]),...(s.features??[]),...(s.spells??[])].filter(i=>i.uses?.max>0&&Number.isInteger(i.uses.value))){const row=text('div','','row');row.append(text('span',`${item.name}: ${item.uses.value} / ${item.uses.max}`),editButton('Set uses','uses.set',{itemId:item.id,expected:item.uses.value}));fragment.append(row);}
 }else{
  const items=(s[tab]??[]).filter(i=>i.name.toLowerCase().includes(filterText.toLowerCase()));if(!items.length)fragment.append(text('p','Nothing listed for this character.','muted'));
  for(const item of items){const details=document.createElement('details');details.dataset.itemId=item.id;details.append(text('summary',`${item.name}${item.quantity!=null?' ×'+item.quantity:''}${item.prepared?' · prepared':''}`));const plain=new DOMParser().parseFromString(item.description??'','text/html').body.textContent;details.append(text('p',plain||'No description.','item-detail'));for(const a of item.activities??[])if(a.supported&&['feat','consumable','equipment','tool'].includes(item.type))details.append(presetButton({label:'Use '+a.name,operation:'activity.use',input:{itemId:item.id,activityId:a.id,slot:'',concentration:s.concentration??''},requiresSlot:a.requiresSlot,level:item.level??0}));if(tab==='inventory'){if(item.canEquip)details.append(editButton(item.equipped?'Unequip':'Equip','item.equip',{itemId:item.id,expected:item.equipped,value:!item.equipped},'toggle'));if(Number.isInteger(item.quantity))details.append(editButton('Set quantity','item.quantity',{itemId:item.id,expected:item.quantity}));if(item.attunement)details.append(editButton(item.attuned?'Unattune':'Attune','item.attune',{itemId:item.id,value:!item.attuned,expected:item.attuned},'toggle'));const parent=s.inventory.find(i=>i.id===item.container);if(parent)details.append(text('p','Container: '+parent.name));details.append(presetButton({label:'Move to container',operation:'item.container',input:{itemId:item.id,expected:item.container??''},edit:'select',options:[{value:'',label:'Carried directly'},...s.inventory.filter(i=>i.type==='container'&&i.id!==item.id).map(i=>({value:i.id,label:i.name}))]}));}fragment.append(details);}
 }
 const sheet=$('sheet'),scroll=sheet.scrollTop,opened=new Set([...sheet.querySelectorAll('details[open]')].map(e=>e.dataset.itemId));sheet.replaceChildren(fragment);for(const e of sheet.querySelectorAll('details'))e.open=opened.has(e.dataset.itemId);sheet.scrollTop=scroll;
}
$('pair-form').onsubmit=async event=>{event.preventDefault();try{const result=await api('/v1/pair',{code:$('code').value.trim()});token=result.token;localStorage.setItem(storageKey,token);$('code').value='';message('Paired. Loading your character…');await refresh();}catch(error){message(error.message);}};
$('forget').onclick=()=>{token=null;localStorage.removeItem(storageKey);clear();$('pairing').hidden=false;$('forget').hidden=true;$('connection').textContent='Not paired';message('Device credential removed from this browser.');};
$('characters').onchange=()=>{epoch++;state.selected=$('characters').value;state.snapshot=null;localStorage.setItem(selectionKey(),state.selected);$('dashboard').hidden=true;$('sheet').replaceChildren();$('action-dialog').close();void refresh();};
$('refresh').onclick=()=>{portraitAt=0;void refresh();};
$('sheet-search').oninput=()=>{filterText=$('sheet-search').value;render();};$('spell-filter').onchange=()=>{spellFilter=$('spell-filter').value;render();};$('school-filter').onchange=()=>{schoolFilter=$('school-filter').value;render();};
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{tab=button.dataset.tab;document.querySelector('nav .active')?.classList.remove('active');button.classList.add('active');render();};
for(const button of document.querySelectorAll('[data-hp]'))button.onclick=()=>openAction({operation:button.dataset.hp==='temp'?'hp.temp.set':'hp.adjust',input:{},sign:button.dataset.hp==='damage'?-1:1,label:button.dataset.hp==='temp'?'Replace temporary HP':button.dataset.hp==='damage'?'Apply damage':'Heal character'});
$('cancel').onclick=()=>$('action-dialog').close();
$('action-form').onsubmit=async event=>{
 event.preventDefault();if(busy||!dialogAction)return;const action=dialogAction;
 if(JSON.stringify(action.scope)!==JSON.stringify(state.scope)||action.actorId!==state.selected){$('action-dialog').close();message('The selected character or world changed. Open the action again.');return;}
 const amount=Number($('amount').value);let input;
 if(action.operation==='roll.hitDie')input={...action.input};
 else if(isRoll(action.operation))input={...action.input,mode:$('mode').value,...(action.operation==='roll.concentration'?{dc:Number($('dc').value)}:{})};
 else if(['spell.cast','activity.use'].includes(action.operation))input={...action.input,slot:$('slot').value};
 else if(action.edit==='text')input={...action.input,value:$('text-value').value};
 else if(action.edit==='select')input={...action.input,value:$('choice').value};
 else if(action.edit==='toggle'||action.edit==='none')input={...action.input};
 else{if(!Number.isInteger(amount)||amount<0||amount>100000)return;input=action.edit?{...action.input,value:amount}:action.operation==='hp.temp.set'?{value:amount}:{amount:amount*action.sign};}
 if(action.weapon){input.attackMode=$('attack-mode').value;input.ammunitionId=$('ammunition').value;}
 const command={requestId:crypto.randomUUID(),scope:action.scope,actorId:action.actorId,operation:action.operation,input};
 busy=true;lastRequest=command.requestId;$('action-dialog').close();render();message('Waiting for Foundry…');
 try{const result=await api('/v1/commands',command);message(result.status==='completed'?'Action confirmed by Foundry.':result.error?.message??'Outcome unknown. Check Foundry before acting again.');$('check-status').hidden=result.status!=='unknown';}
 catch{message('The action may have completed. Check its status before taking another action.');$('check-status').hidden=false;}
 finally{busy=false;await refresh();render();}
};
$('check-status').onclick=async()=>{try{const result=await api('/v1/requests/'+lastRequest);message(result.status==='completed'?'Action confirmed by Foundry.':result.error?.message??result.status);$('check-status').hidden=result.status!=='unknown';}catch(error){message(error.message);}};
void refresh();setInterval(()=>void refresh(),3000);
