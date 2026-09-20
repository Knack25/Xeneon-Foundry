import {chromium} from '../../foundry-edge-connector/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1100,height:650}});
await page.clock.install();
page.setDefaultTimeout(10000);
const scope={instanceId:'test',worldId:'world',generation:'test'};
const commands=[],activityRequests=[],events=[];let failActivityMethod=null;
const snapshot={scope,revision:1,actorId:'pc',name:'Hero',hp:{value:20,max:20,temp:0},ac:12,speed:{},abilities:{},skills:{},
 hitDice:[{denomination:'d10',value:2}],conditions:[{id:'prone',name:'Prone',active:false}],inspiration:false,details:{alignment:'Good'},combatId:'',concentration:'',resources:{primary:{value:1,max:3,label:'Ki'}},spellSlots:{spell1:{value:2,max:3,level:1}},spells:[{id:'spell',name:'Bolt',level:1,preparationState:1,prepared:true,activities:[{id:'activity',name:'Bolt',supported:true,requiresSlot:true}]}],inventory:[{id:'sword',name:'Longsword',quantity:2,canEquip:true,equipped:false}],features:[],capabilities:['rest.short','rest.long','roll.hitDie','condition.set','inspiration.set','roll.attack','roll.damage','roll.initiative','item.equip','item.quantity','slots.set','resource.set','details.set','spell.cast'],attacks:[{itemId:'sword',activityId:'strike',name:'Longsword',activityName:'Strike',toHit:'+5',hasDamage:true,
 attackModes:[{value:'oneHanded',label:'One handed'},{value:'twoHanded',label:'Two handed'}],ammunition:[]}]};
await page.route('https://widget.test/**',async route=>{
 const path=new URL(route.request().url()).pathname;let value;
 if(path==='/v1/pair')value={token:'fixture'};
 else if(path==='/v1/world')value={scope};
 else if(path==='/v1/characters')value={scope,characters:[{id:'pc',name:'Hero'}]};
 else if(path==='/v1/characters/pc')value=snapshot;
 else if(path==='/v1/activity-leases'){
 const method=route.request().method();activityRequests.push({method,body:route.request().postDataJSON()});events.push(method);
  if(method===failActivityMethod)return route.fulfill({status:503,json:{error:{code:'unavailable',message:'Temporarily unavailable.'}}});
  return route.fulfill(method==='DELETE'?{status:204}:{status:method==='POST'?201:200,json:{ok:true}});
 }
 else if(path==='/v1/commands'){commands.push(route.request().postDataJSON());events.push('command');value={status:'completed'};}
 if(value)return route.fulfill({json:value});
 const assets={'/src/preferences.js':'src/preferences.js','/':'preview.html','/dashboard.css':'dashboard.css','/src/app.js':'src/app.js','/src/state.js':'src/state.js'};
 if(!assets[path])return route.fulfill({status:404});
 return route.fulfill({body:await readFile(new URL('../widget/'+assets[path],import.meta.url)),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
});
try{
 await page.goto('https://widget.test');await page.locator('#code').fill('test');await page.locator('#pair-form button').click();await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('[data-tab="attacks"]').click();
 assert.deepEqual(activityRequests,[]);
 const opened=page.waitForRequest(request=>request.url().endsWith('/v1/activity-leases')&&request.method()==='POST');
 await page.locator('#sheet').getByRole('button',{name:'Attack',exact:true}).click();await opened;await page.locator('#action-dialog').waitFor({state:'visible'});
 assert.deepEqual(activityRequests[0].body.kind,'confirmation');assert.deepEqual(activityRequests[0].body.scope,scope);assert.equal(activityRequests[0].body.ttlMs,45000);
 const renewed=page.waitForRequest(request=>request.url().endsWith('/v1/activity-leases')&&request.method()==='PUT');
 await page.clock.fastForward(15000);await renewed;
 const cancelled=page.waitForRequest(request=>request.url().endsWith('/v1/activity-leases')&&request.method()==='DELETE');
 await page.locator('#cancel').click();await cancelled;
 assert.deepEqual(activityRequests.map(request=>request.method),['POST','PUT','DELETE']);
 failActivityMethod='POST';
 await page.locator('#sheet').getByRole('button',{name:'Attack',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Unable to reserve this action. Reconnect and try again.');
 assert.equal(await page.locator('#action-dialog').isVisible(),false);failActivityMethod=null;
 await page.locator('#sheet').getByRole('button',{name:'Attack',exact:true}).click();await page.locator('#action-dialog').waitFor({state:'visible'});failActivityMethod='PUT';
 const failedRenewal=page.waitForRequest(request=>request.url().endsWith('/v1/activity-leases')&&request.method()==='PUT');
 await page.clock.fastForward(15000);await failedRenewal;
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Connection changed. Open the action again.');
 assert.equal(await page.locator('#action-dialog').isVisible(),false);failActivityMethod=null;
 for(const [button,mode] of [['Attack','advantage'],['Damage','critical']]){
  await page.locator('#sheet').getByRole('button',{name:button,exact:true}).click();await page.locator('#action-dialog').waitFor({state:'visible'});await page.locator('#mode').selectOption(mode);await page.locator('#attack-mode').selectOption('twoHanded');const response=page.waitForResponse(r=>r.url().endsWith('/v1/commands'));await page.locator('#confirm').click();await response;await page.waitForFunction(()=>document.querySelector('#status').textContent==='Action confirmed by Foundry.');
 }
 assert.deepEqual(commands.map(c=>c.input),['advantage','critical'].map(mode=>({itemId:'sword',activityId:'strike',mode,attackMode:'twoHanded',ammunitionId:''})));
 assert.deepEqual(commands.map(c=>c.operation),['roll.attack','roll.damage']);
 for(const [index,event]of events.entries())if(event==='command')assert.equal(events[index-1],'DELETE');
 await page.locator('#sheet').getByRole('button',{name:'Attack',exact:true}).click();await page.locator('#action-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#mode').inputValue(),'normal');
 await page.locator('#cancel').click();
 const submit=async(label,fill)=>{await page.getByRole('button',{name:label,exact:true}).click();await page.locator('#action-dialog').waitFor({state:'visible'});if(fill)await fill();const response=page.waitForResponse(r=>r.url().endsWith('/v1/commands'));await page.locator('#confirm').click();await response;await page.waitForFunction(()=>document.querySelector('#status').textContent==='Action confirmed by Foundry.');};
 await page.locator('[data-tab="inventory"]').click();await page.locator('summary').click();await submit('Equip');assert.equal(commands.at(-1).input.expected,false);assert.equal(commands.at(-1).input.value,true);
 await submit('Set quantity',()=>page.locator('#amount').fill('4'));assert.deepEqual(commands.at(-1).input,{itemId:'sword',expected:2,value:4});
 await page.locator('[data-tab="details"]').click();await submit('Edit alignment',()=>page.locator('#text-value').fill('Neutral'));assert.deepEqual(commands.at(-1).input,{field:'alignment',expected:'Good',value:'Neutral'});
 await page.locator('[data-tab="spells"]').click();await submit('Cast Bolt');assert.deepEqual(commands.at(-1).input,{itemId:'spell',activityId:'activity',concentration:'',slot:'spell1'});
 await page.locator('[data-tab="session"]').click();await submit('Short rest');assert.deepEqual(commands.at(-1).input,{});assert.equal(commands.at(-1).operation,'rest.short');await submit('Spend d10 (2 left)');assert.deepEqual(commands.at(-1).input,{denomination:'d10'});await submit('Add Prone');assert.deepEqual(commands.at(-1).input,{id:'prone',active:true,expected:false});
 await page.locator('[data-tab="quick"]').click();await page.locator('#sheet-search').fill('Longsword Attack');await page.locator('#sheet .row').getByRole('button',{name:'Pin',exact:true}).click();await page.locator('.quick-grid').getByRole('button',{name:'Longsword Attack'}).waitFor();await page.reload();await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('[data-tab="quick"]').click();await page.locator('.quick-grid').getByRole('button',{name:'Longsword Attack'}).waitFor();
 await page.locator('[data-tab="display"]').click();await page.locator('#pref-theme').selectOption('blue');assert.equal(await page.locator('html').getAttribute('data-theme'),'blue');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('Dashboard UI passed: weapon modes, critical damage, edit expected values, spell slot selection and no overflow.');
}finally{await browser.close();}

