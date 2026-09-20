import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(!process.env.PREVIEW_ADMIN_KEY_FILE)throw Error('Set PREVIEW_ADMIN_KEY_FILE to the local preview administrator key file.');
const secret=(await readFile(process.env.PREVIEW_ADMIN_KEY_FILE,'utf8')).trim();
const base=process.env.PREVIEW_URL??'http://127.0.0.1:8791';
const browser=await chromium.launch({channel:'msedge',headless:true,
 ...(process.env.PREVIEW_RESOLVE_IP?{args:[`--host-resolver-rules=MAP ${new URL(base).hostname} ${process.env.PREVIEW_RESOLVE_IP}`]}:{})});
const adminContext=await browser.newContext(),deviceContext=await browser.newContext();
const admin=await adminContext.newPage(),device=await deviceContext.newPage();
const errors=[];admin.on('pageerror',e=>errors.push(e.message));device.on('pageerror',e=>errors.push(e.message));
let deviceId;
try{
 await admin.goto(base+'/admin');await admin.locator('#secret').fill(secret);await admin.locator('#login button').click();
 await admin.locator('#management').waitFor({state:'visible',timeout:20000});
 await admin.reload();await admin.locator('#management').waitFor({state:'visible'});
 assert.equal(await admin.locator('#secret').inputValue(),'');
 await admin.locator('#player').selectOption({label:'Edge Test Player'});
 await admin.locator('#create-invite').click();await admin.locator('#invitation').waitFor({state:'visible'});
 const code=await admin.locator('#code').textContent();
 await device.goto(base);await device.locator('#code').fill(code);
 const pairing=device.waitForResponse(r=>r.url().endsWith('/v1/pair')&&r.request().method()==='POST');
 await device.locator('#pair-form button').click();deviceId=(await (await pairing).json()).deviceId;
 await device.locator('#dashboard').waitFor({state:'visible',timeout:20000});
 await device.locator('#characters').selectOption({label:'Edge Test Scout'});
 await device.locator('#name').filter({hasText:'Edge Test Scout'}).waitFor();
 await device.reload();await device.locator('#name').filter({hasText:'Edge Test Scout'}).waitFor();
 await admin.locator('#refresh').click();const row=admin.locator('.device').filter({has:admin.locator('h3',{hasText:deviceId})});await row.waitFor();
 await row.locator('select').selectOption({label:'Edge Other Player'});
 await row.getByRole('button',{name:'Save player mapping'}).click();await admin.waitForFunction(()=>document.getElementById('status').textContent.includes('Player mapping saved'));
 await device.locator('#name').filter({hasText:'Edge Other Hero'}).waitFor({timeout:15000});
 assert.deepEqual(await device.locator('#characters option').allTextContents(),['Edge Other Hero']);
 admin.once('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:'Revoke device'}).click();
 await device.locator('#pairing').waitFor({state:'visible',timeout:15000});assert.equal(await device.locator('#dashboard').isVisible(),false);
 await admin.locator('#logout').click();await admin.locator('#login-panel').waitFor({state:'visible'});
 await admin.reload();assert.equal(await admin.locator('#management').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('Admin browser checks passed: login/reload, invite, device pairing, character switching/reload, player remapping, live revocation, logout.');
}finally{
 // If a check fails, revoke only the disposable device created by this test.
 if(deviceId)await admin.evaluate(async id=>{const session=await fetch('/admin/session');if(!session.ok)return;const {csrf}=await session.json();await fetch('/admin/revoke',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({deviceId:id})});},deviceId).catch(()=>{});
 await browser.close();
}
