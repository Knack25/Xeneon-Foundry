const $=id=>document.getElementById(id);
let csrf=null,state=null,pending=false,expires=0;
const say=value=>$('status').textContent=value;
const node=(tag,value)=>{const element=document.createElement(tag);element.textContent=value;return element;};
async function api(path,data){
 const response=await fetch('/admin/'+path,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json','X-CSRF-Token':csrf??''}:{},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok){if(response.status===401)lock();throw Error(value.error?.message??'Request failed.');}return value;
}
function lock(){csrf=null;state=null;$('management').hidden=true;$('login-panel').hidden=false;$('devices').replaceChildren();$('player').replaceChildren();$('code').textContent='';$('invitation').hidden=true;}
function players(selected){return state.players.map(player=>{const option=node('option',player.name);option.value=player.id;option.selected=player.id===selected;return option;});}
async function refresh(){
 const next=await api('state');
 if(JSON.stringify(state?.scope)!==JSON.stringify(next.scope)){$('invitation').hidden=true;$('code').textContent='';}
 state=next;$('world').textContent=state.scope?'Loaded world: '+state.scope.worldId:'Foundry is disconnected.';
 $('login-panel').hidden=true;$('management').hidden=false;$('player').replaceChildren(...players());
 $('create-invite').disabled=!state.scope||!state.players.length;
 const fragment=document.createDocumentFragment();
 for(const device of state.devices){
  const section=node('article','');section.className='device';section.append(node('h3',device.label||'Edge '+device.deviceId.slice(0,8)),node('p','Device ID: '+device.deviceId),node('p',device.lastSeen?'Last seen: '+new Date(device.lastSeen).toLocaleString():'Last seen: no authenticated requests yet'),node('p',device.revoked?'Revoked':'Active · paired '+new Date(device.created).toLocaleString()));
  const mappings=node('ul','');for(const mapping of device.mappings)mappings.append(node('li',`${mapping.worldId}: ${state.players.find(p=>p.id===mapping.userId&&state.scope?.worldId===mapping.worldId)?.name??mapping.userId}`));section.append(mappings);
  if(!device.revoked){
   const nameForm=node('form',''),nameLabel=node('label','Device name'),nameInput=node('input','');
   nameInput.type='text';nameInput.required=true;nameInput.maxLength=80;nameInput.value=device.label||'';nameInput.placeholder='e.g. Living room Edge';nameLabel.append(nameInput);
   nameForm.append(nameLabel,node('button','Save device name'));
   nameForm.onsubmit=event=>{event.preventDefault();void mutate(async()=>{await api('devices/rename',{deviceId:device.deviceId,label:nameInput.value});await refresh();say('Device name saved.');});};section.append(nameForm);
   if(state.scope&&state.players.length){
    const form=node('form',''),label=node('label','Player in loaded world'),select=node('select','');
    const current=device.mappings.find(m=>m.instanceId===state.scope.instanceId&&m.worldId===state.scope.worldId);
    select.append(...players(current?.userId));label.append(select);const save=node('button','Save player mapping');form.append(label,save);
    const scope={...state.scope};form.onsubmit=event=>{event.preventDefault();void mutate(async()=>{await api('mappings',{deviceId:device.deviceId,scope,userId:select.value});say('Player mapping saved. Queued actions using the previous mapping are blocked.');await refresh();});};section.append(form);
   }
   const revoke=node('button','Revoke device');revoke.className='revoke';revoke.onclick=()=>{if(confirm('Revoke this device? It will need a new pairing code to reconnect.'))void mutate(async()=>{await api('revoke',{deviceId:device.deviceId});await refresh();say('Device revoked.');});};section.append(revoke);
  }
  fragment.append(section);
 }
 if(!state.devices.length)fragment.append(node('p','No devices paired yet.'));
 $('devices').replaceChildren(fragment);
}
async function mutate(work){if(pending)return;pending=true;for(const button of document.querySelectorAll('button'))button.disabled=true;try{await work();}catch(error){say(error.message);}finally{pending=false;for(const button of document.querySelectorAll('button'))button.disabled=false;$('create-invite').disabled=!state?.scope||!state.players.length;}}
$('login').onsubmit=event=>{event.preventDefault();void mutate(async()=>{const secret=$('secret').value;$('secret').value='';const result=await api('login',{secret});csrf=result.csrf;await refresh();say('Signed in.');});};
$('invite').onsubmit=event=>{event.preventDefault();if(!state?.scope)return;const payload={scope:{...state.scope},userId:$('player').value};void mutate(async()=>{const result=await api('invites',payload);$('code').textContent=result.code;expires=Date.now()+600000;$('invitation').hidden=false;$('expiry').textContent='Single use · expires in 10 minutes.';say('Pairing code created.');});};
$('copy-code').onclick=()=>void navigator.clipboard.writeText($('code').textContent).then(()=>say('Pairing code copied.'),()=>say('Select and copy the code manually.'));
$('refresh').onclick=()=>void mutate(refresh);
$('logout').onclick=()=>void mutate(async()=>{await api('logout',{});lock();say('Signed out.');});
setInterval(()=>{if(expires&&Date.now()>=expires){$('invitation').hidden=true;$('code').textContent='';expires=0;}},1000);
api('session').then(result=>{csrf=result.csrf;return refresh();}).catch(()=>{});
