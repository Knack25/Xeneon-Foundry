import {chromium} from '../../foundry-edge-connector/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const widget=fileURLToPath(new URL('../widget/',import.meta.url));
const files={'/':['preview.html','text/html'],'/dashboard.css':['dashboard.css','text/css'],'/src/app.js':['src/app.js','text/javascript'],'/src/state.js':['src/state.js','text/javascript'],'/src/preferences.js':['src/preferences.js','text/javascript']};
const server=createServer(async(request,response)=>{
 const file=files[request.url];if(!file){response.writeHead(404);response.end();return;}
 response.writeHead(200,{'Content-Type':file[1]});response.end(await readFile(path.join(widget,file[0])));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:600}});
await page.clock.install();
const scope={instanceId:'test',worldId:'world',generation:'generation'};
let characters=[{id:'a',name:'Original'}],delayReplacement=false,releaseReplacement;
let activityPosts=0,activityPuts=0,activityDeletes=0;
const snapshot=id=>({scope,revision:Date.now(),actorId:id,name:id==='a'?'Original':'Replacement',hp:{value:10,max:20,temp:0},ac:12,speed:{walk:30},abilities:{wis:{value:14,mod:2,save:2}},skills:{},resources:{},spellSlots:{},features:[],spells:[],inventory:[],capabilities:['hp.adjust','hp.temp.set','roll.ability','roll.save']});
await page.route('**/v1/**',async route=>{
 const path=new URL(route.request().url()).pathname;let value;
 if(path==='/v1/pair')value={token:'t'.repeat(43)};
 else if(path==='/v1/activity-leases'){
  const method=route.request().method();if(method==='POST')activityPosts++;else if(method==='PUT')activityPuts++;else if(method==='DELETE')activityDeletes++;
  await route.fulfill({status:method==='DELETE'?204:200,contentType:'application/json',body:method==='DELETE'?'':JSON.stringify({ok:true})});return;
 }
 else if(path==='/v1/world')value={scope};
 else if(path==='/v1/characters')value={scope,characters};
 else if(path.startsWith('/v1/characters/')){const id=path.split('/').at(-1);if(id==='b'&&delayReplacement)await new Promise(r=>releaseReplacement=r);value=snapshot(id);}
 else value={};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
});
try{
 await page.goto(origin);await page.locator('#code').fill('fixture');await page.locator('#pair-form button').click();await page.locator('#name').filter({hasText:'Original'}).waitFor();
 characters=[{id:'b',name:'Replacement'}];delayReplacement=true;await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#characters').value==='b');
 assert.equal(await page.locator('#dashboard').isVisible(),false,'old private sheet must disappear before replacement fetch finishes');
 releaseReplacement();delayReplacement=false;await page.locator('#name').filter({hasText:'Replacement'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'Check'}).first().click();
 await page.locator('#action-dialog').waitFor({state:'visible'});assert.equal(activityPosts,1);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#action-dialog').open);
 await new Promise(resolve=>setTimeout(resolve,100));assert.equal(activityDeletes,1,'Escape must release the confirmation lease');
 await page.clock.fastForward(15100);assert.equal(activityPuts,0,'a dismissed dialog must not renew its lease');
 console.log('Browser regression passed: ownership loss clears the old sheet, Escape releases activity, and layout has no horizontal overflow.');
}finally{releaseReplacement?.();await browser.close();await new Promise(resolve=>server.close(resolve));}
