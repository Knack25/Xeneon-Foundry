import {reduce} from './state.js';
const $=id=>document.getElementById(id),storageKey='foundry-edge-preview:'+location.origin;
let token=localStorage.getItem(storageKey),state={scope:null,characters:[],selected:null,snapshot:null},tab='abilities',busy=false,polling=false,epoch=0,dialogAction=null,lastRequest=null;
const names={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma',acr:'Acrobatics',ani:'Animal Handling',arc:'Arcana',ath:'Athletics',dec:'Deception',his:'History',ins:'Insight',itm:'Intimidation',inv:'Investigation',med:'Medicine',nat:'Nature',prc:'Perception',prf:'Performance',per:'Persuasion',rel:'Religion',slt:'Sleight of Hand',ste:'Stealth',sur:'Survival'};
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value??'—';if(className)e.className=className;return e;};
const signed=value=>value==null?'—':`${value>=0?'+':''}${value}`;
const message=value=>$('status').textContent=value;
async function api(path,data){
 const response=await fetch(path,{method:data?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error?.message??'Connection failed.'),{code:value.error?.code});return value;
}
function clear(){epoch++;state=reduce(state,{type:'clear'});$('dashboard').hidden=true;$('sheet').replaceChildren();$('characters').replaceChildren();$('action-dialog').close();dialogAction=null;}
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
  state=reduce(state,{type:'snapshot',snapshot});render();if($('status').textContent==='Ready to pair.'||$('status').textContent==='Paired. Loading your character…')message('Live character sheet · changes sync with Foundry.');
 }catch(error){if(version===epoch){clear();$('connection').textContent='Disconnected';message(error.message);if(error.code==='unauthorized'){localStorage.removeItem(storageKey);token=null;$('pairing').hidden=false;}}}
 finally{polling=false;}
}
function actionButton(label,operation,input){const b=text('button',label);b.disabled=busy||!state.snapshot?.capabilities.includes(operation);b.onclick=()=>openAction({operation,input,label});return b;}
function openAction(action){if(busy||!state.snapshot)return;dialogAction={...action,scope:{...state.scope},actorId:state.selected};$('action-title').textContent=action.label;$('amount-label').hidden=action.operation.startsWith('roll.');$('mode-label').hidden=!action.operation.startsWith('roll.');$('amount').value='';$('amount').required=!action.operation.startsWith('roll.');$('action-note').textContent=action.operation==='hp.temp.set'?'Replaces the current temporary HP total.':'Changes are applied to the live Foundry character.';$('action-dialog').showModal();}
function render(){
 const s=state.snapshot;if(!s)return;$('dashboard').hidden=false;$('name').textContent=s.name;$('hp').textContent=`${s.hp.value} / ${s.hp.max}`;$('ac').textContent=s.ac??'—';$('temp').textContent=`${s.hp.temp} temporary HP`;
 $('speed').textContent=Object.entries(s.speed).filter(([,v])=>typeof v==='number'&&v>0).map(([k,v])=>`${k} ${v}`).join(' · ');
 for(const b of document.querySelectorAll('[data-hp]'))b.disabled=busy||!s.capabilities.includes(b.dataset.hp==='temp'?'hp.temp.set':'hp.adjust');
 const fragment=document.createDocumentFragment();
 if(tab==='abilities'){
  const grid=text('div','','grid');for(const [key,a]of Object.entries(s.abilities)){const card=text('div','','card');card.append(text('h3',names[key]??key),text('strong',`${a.value} (${signed(a.mod)})`,'score'),actionButton('Check','roll.ability',{ability:key}),actionButton(`Save ${signed(a.save)}`,'roll.save',{ability:key}));grid.append(card);}fragment.append(grid);
 }else if(tab==='skills'){
  for(const [key,value]of Object.entries(s.skills)){const row=text('div','','row');row.append(text('span',`${names[key]??key} · passive ${value.passive??'—'}`),actionButton(signed(value.total),'roll.skill',{skill:key}));fragment.append(row);}
 }else if(tab==='resources'){
  for(const [key,value]of Object.entries({...s.resources,...s.spellSlots})){const row=text('div','','row');row.append(text('span',value.label||key),text('strong',`${value.value??'—'} / ${value.max??'—'}`));fragment.append(row);}
 }else{
  const items=s[tab]??[];if(!items.length)fragment.append(text('p','Nothing listed for this character.','muted'));
  for(const item of items){const details=document.createElement('details');details.append(text('summary',`${item.name}${item.quantity!=null?' ×'+item.quantity:''}${item.prepared?' · prepared':''}`));const plain=new DOMParser().parseFromString(item.description??'','text/html').body.textContent;details.append(text('p',plain||'No description.','item-detail'));fragment.append(details);}
 }
 const sheet=$('sheet'),scroll=sheet.scrollTop;sheet.replaceChildren(fragment);sheet.scrollTop=scroll;
}
$('pair-form').onsubmit=async event=>{event.preventDefault();try{const result=await api('/v1/pair',{code:$('code').value.trim()});token=result.token;localStorage.setItem(storageKey,token);$('code').value='';message('Paired. Loading your character…');await refresh();}catch(error){message(error.message);}};
$('forget').onclick=()=>{token=null;localStorage.removeItem(storageKey);clear();$('pairing').hidden=false;$('forget').hidden=true;$('connection').textContent='Not paired';message('Device credential removed from this browser.');};
$('characters').onchange=()=>{epoch++;state.selected=$('characters').value;state.snapshot=null;localStorage.setItem(selectionKey(),state.selected);$('dashboard').hidden=true;$('sheet').replaceChildren();$('action-dialog').close();void refresh();};
$('refresh').onclick=()=>void refresh();
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{tab=button.dataset.tab;document.querySelector('nav .active')?.classList.remove('active');button.classList.add('active');render();};
for(const button of document.querySelectorAll('[data-hp]'))button.onclick=()=>openAction({operation:button.dataset.hp==='temp'?'hp.temp.set':'hp.adjust',input:{},sign:button.dataset.hp==='damage'?-1:1,label:button.dataset.hp==='temp'?'Replace temporary HP':button.dataset.hp==='damage'?'Apply damage':'Heal character'});
$('cancel').onclick=()=>$('action-dialog').close();
$('action-form').onsubmit=async event=>{
 event.preventDefault();if(busy||!dialogAction)return;const action=dialogAction;
 if(JSON.stringify(action.scope)!==JSON.stringify(state.scope)||action.actorId!==state.selected){$('action-dialog').close();message('The selected character or world changed. Open the action again.');return;}
 const amount=Number($('amount').value);if(!action.operation.startsWith('roll.')&&(!Number.isInteger(amount)||amount<0||amount>100000))return;
 const input=action.operation.startsWith('roll.')?{...action.input,mode:$('mode').value}:action.operation==='hp.temp.set'?{value:amount}:{amount:amount*action.sign};
 const command={requestId:crypto.randomUUID(),scope:action.scope,actorId:action.actorId,operation:action.operation,input};
 busy=true;lastRequest=command.requestId;$('action-dialog').close();render();message('Waiting for Foundry…');
 try{const result=await api('/v1/commands',command);message(result.status==='completed'?'Action confirmed by Foundry.':result.error?.message??'Outcome unknown. Check Foundry before acting again.');$('check-status').hidden=result.status!=='unknown';}
 catch{message('The action may have completed. Check its status before taking another action.');$('check-status').hidden=false;}
 finally{busy=false;await refresh();render();}
};
$('check-status').onclick=async()=>{try{const result=await api('/v1/requests/'+lastRequest);message(result.status==='completed'?'Action confirmed by Foundry.':result.error?.message??result.status);$('check-status').hidden=result.status!=='unknown';}catch(error){message(error.message);}};
void refresh();setInterval(()=>void refresh(),3000);
