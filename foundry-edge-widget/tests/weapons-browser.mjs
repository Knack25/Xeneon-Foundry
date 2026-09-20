import {chromium} from '../../foundry-edge-connector/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1100,height:650}});
page.setDefaultTimeout(10000);
const scope={instanceId:'test',worldId:'world',generation:'test'};
const commands=[];
const snapshot={scope,revision:1,actorId:'pc',name:'Hero',hp:{value:20,max:20,temp:0},ac:12,speed:{},abilities:{},skills:{},
 details:{alignment:'Good'},combatId:'',concentration:'',resources:{primary:{value:1,max:3,label:'Ki'}},spellSlots:{spell1:{value:2,max:3,level:1}},spells:[{id:'spell',name:'Bolt',level:1,preparationState:1,prepared:true,activities:[{id:'activity',name:'Bolt',supported:true,requiresSlot:true}]}],inventory:[{id:'sword',name:'Longsword',quantity:2,canEquip:true,equipped:false}],features:[],capabilities:['roll.attack','roll.damage','roll.initiative','item.equip','item.quantity','slots.set','resource.set','details.set','spell.cast'],attacks:[{itemId:'sword',activityId:'strike',name:'Longsword',activityName:'Strike',toHit:'+5',hasDamage:true,
 attackModes:[{value:'oneHanded',label:'One handed'},{value:'twoHanded',label:'Two handed'}],ammunition:[]}]};
await page.route('https://widget.test/**',async route=>{
 const path=new URL(route.request().url()).pathname;let value;
 if(path==='/v1/pair')value={token:'fixture'};
 else if(path==='/v1/world')value={scope};
 else if(path==='/v1/characters')value={scope,characters:[{id:'pc',name:'Hero'}]};
 else if(path==='/v1/characters/pc')value=snapshot;
 else if(path==='/v1/commands'){commands.push(route.request().postDataJSON());value={status:'completed'};}
 if(value)return route.fulfill({json:value});
 const assets={'/':'preview.html','/dashboard.css':'dashboard.css','/src/app.js':'src/app.js','/src/state.js':'src/state.js'};
 if(!assets[path])return route.fulfill({status:404});
 return route.fulfill({body:await readFile(new URL('../widget/'+assets[path],import.meta.url)),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
});
try{
 await page.goto('https://widget.test');await page.locator('#code').fill('test');await page.locator('#pair-form button').click();await page.locator('#dashboard').waitFor({state:'visible'});await page.locator('[data-tab="attacks"]').click();
 for(const [button,mode] of [['Attack','advantage'],['Damage','critical']]){
  await page.locator('#sheet').getByRole('button',{name:button,exact:true}).click();await page.locator('#mode').selectOption(mode);await page.locator('#attack-mode').selectOption('twoHanded');await page.locator('#confirm').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Action confirmed by Foundry.');
 }
 assert.deepEqual(commands.map(c=>c.input),['advantage','critical'].map(mode=>({itemId:'sword',activityId:'strike',mode,attackMode:'twoHanded',ammunitionId:''})));
 assert.deepEqual(commands.map(c=>c.operation),['roll.attack','roll.damage']);
 await page.locator('#sheet').getByRole('button',{name:'Attack',exact:true}).click();assert.equal(await page.locator('#mode').inputValue(),'normal');
 await page.locator('#cancel').click();
 const submit=async(label,fill)=>{await page.getByRole('button',{name:label,exact:true}).click();if(fill)await fill();const response=page.waitForResponse(r=>r.url().endsWith('/v1/commands'));await page.locator('#confirm').click();await response;await page.waitForFunction(()=>document.querySelector('#status').textContent==='Action confirmed by Foundry.');};
 await page.locator('[data-tab="inventory"]').click();await page.locator('summary').click();await submit('Equip');assert.equal(commands.at(-1).input.expected,false);assert.equal(commands.at(-1).input.value,true);
 await submit('Set quantity',()=>page.locator('#amount').fill('4'));assert.deepEqual(commands.at(-1).input,{itemId:'sword',expected:2,value:4});
 await page.locator('[data-tab="details"]').click();await submit('Edit alignment',()=>page.locator('#text-value').fill('Neutral'));assert.deepEqual(commands.at(-1).input,{field:'alignment',expected:'Good',value:'Neutral'});
 await page.locator('[data-tab="spells"]').click();await submit('Cast Bolt');assert.deepEqual(commands.at(-1).input,{itemId:'spell',activityId:'activity',concentration:'',slot:'spell1'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('Dashboard UI passed: weapon modes, critical damage, edit expected values, spell slot selection and no overflow.');
}finally{await browser.close();}

