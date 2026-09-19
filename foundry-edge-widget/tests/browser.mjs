import {chromium} from '../../foundry-edge-connector/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:600}});
const scope={instanceId:'test',worldId:'world',generation:'generation'};
let characters=[{id:'a',name:'Original'}],delayReplacement=false,releaseReplacement;
const snapshot=id=>({scope,revision:Date.now(),actorId:id,name:id==='a'?'Original':'Replacement',hp:{value:10,max:20,temp:0},ac:12,speed:{walk:30},abilities:{wis:{value:14,mod:2,save:2}},skills:{},resources:{},spellSlots:{},features:[],spells:[],inventory:[],capabilities:['hp.adjust','hp.temp.set','roll.ability','roll.save']});
await page.route('**/v1/**',async route=>{
 const path=new URL(route.request().url()).pathname;let value;
 if(path==='/v1/pair')value={token:'t'.repeat(43)};
 else if(path==='/v1/world')value={scope};
 else if(path==='/v1/characters')value={scope,characters};
 else if(path.startsWith('/v1/characters/')){const id=path.split('/').at(-1);if(id==='b'&&delayReplacement)await new Promise(r=>releaseReplacement=r);value=snapshot(id);}
 else value={};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
});
try{
 await page.goto('http://127.0.0.1:8791');await page.locator('#code').fill('fixture');await page.locator('#pair-form button').click();await page.locator('#name').filter({hasText:'Original'}).waitFor();
 characters=[{id:'b',name:'Replacement'}];delayReplacement=true;await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#characters').value==='b');
 assert.equal(await page.locator('#dashboard').isVisible(),false,'old private sheet must disappear before replacement fetch finishes');
 releaseReplacement();delayReplacement=false;await page.locator('#name').filter({hasText:'Replacement'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('Browser regression passed: ownership loss clears old sheet before a delayed replacement; no horizontal overflow.');
}finally{releaseReplacement?.();await browser.close();}
