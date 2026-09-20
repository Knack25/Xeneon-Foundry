import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {createServer} from '../src/server.js';
const scope={instanceId:'i',worldId:'w',generation:'g'};
test('admin requires login, CSRF and valid active-world player; devices cannot administer',async()=>{
 const store=new Store(':memory:');
 const server=createServer({store,adminSecret:'a'.repeat(40),publicUrl:'https://edge.example',bridge:{scope,listPlayers:async()=>[{id:'p',name:'Player'}]}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://edge.example',...headers},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/admin/invites',{scope,userId:'p'})).status,401);
  const login=await post('/admin/login',{secret:'a'.repeat(40)});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
  const {csrf}=await login.json();const headers={Cookie:cookie.split(';')[0],'X-CSRF-Token':csrf};
  const session=await fetch(url+'/admin/session',{headers:{Cookie:headers.Cookie}});
  assert.equal(session.status,200);assert.equal((await session.json()).csrf,csrf);
  assert.equal((await post('/admin/invites',{scope,userId:'p'},{Cookie:headers.Cookie})).status,403);
  assert.equal((await post('/admin/invites',{scope,userId:'missing'},headers)).status,400);
  assert.equal((await post('/admin/invites',{scope,userId:'p'},{...headers,Origin:'https://evil.example'})).status,403);
  const invite=await post('/admin/invites',{scope,userId:'p'},headers);assert.equal(invite.status,200);
  const {code}=await invite.json();const paired=await post('/v1/pair',{code});assert.equal(paired.status,200);
  const {token,deviceId}=await paired.json();
  assert.equal((await post('/admin/devices/rename',{deviceId,label:'Desk Edge'},{Authorization:`Bearer ${token}`})).status,401);
  assert.equal((await post('/admin/devices/rename',{deviceId,label:'Desk Edge'},{Cookie:headers.Cookie})).status,403);
  assert.equal((await post('/admin/devices/rename',{deviceId,label:'Desk Edge'},{...headers,Origin:'https://evil.example'})).status,403);
  assert.equal((await post('/admin/devices/rename',{deviceId,label:'x'.repeat(81)},headers)).status,400);
  assert.equal((await post('/admin/devices/rename',{deviceId,label:'Desk Edge'},headers)).status,200);
  const deviceState=await (await fetch(url+'/admin/state',{headers:{Cookie:headers.Cookie}})).json();
  assert.equal(deviceState.devices[0].label,'Desk Edge');assert.equal(deviceState.devices[0].lastSeen,null);
  assert.equal(JSON.stringify(deviceState).includes(token),false);
  for(let i=0;i<6;i++){
   const extra=await (await post('/admin/invites',{scope,userId:'p'},headers)).json();
   assert.equal((await post('/v1/pair',{code:extra.code})).status,200,'valid pairings must not count as failed attempts');
  }
  assert.equal((await post('/admin/invites',{scope,userId:'p'},{Authorization:`Bearer ${token}`})).status,401);
  const world=()=>fetch(url+'/v1/world',{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await world()).status,200);
  assert.equal(typeof store.listDevices().find(d=>d.deviceId===deviceId).lastSeen,'number');
  assert.equal((await post('/admin/revoke',{deviceId},headers)).status,200);
  assert.equal((await world()).status,401);
  assert.equal((await post('/admin/logout',{},headers)).status,200);
  assert.equal((await fetch(url+'/admin/state',{headers:{Cookie:headers.Cookie}})).status,401);
 }finally{await new Promise(r=>server.close(r));store.close();}
});

test('administration UI serves only fixed public assets without credentials',async()=>{
 const store=new Store(':memory:');const server=createServer({store,adminSecret:'x'.repeat(40),publicUrl:'https://edge.example',bridge:{scope}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  const page=await fetch(url+'/admin');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(await page.text(),/Administrator key/);
  assert.equal((await fetch(url+'/admin.js')).status,200);
  assert.equal((await fetch(url+'/admin/state')).status,401);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
test('pairing is rate limited and errors never contain internal details',async()=>{
 const store=new Store(':memory:');const server=createServer({store,adminSecret:'x'.repeat(40),publicUrl:'https://edge.example',bridge:{scope}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}/v1/pair`;
  for(let i=0;i<5;i++)assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`fake-${i}`},body:'{"code":"bad"}'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"code":"bad"}'})).status,429);
 }finally{await new Promise(r=>server.close(r));store.close();}
});

test('embedding permits only the configured Foundry origin and never bypasses admin login',async()=>{
 const store=new Store(':memory:');
 const server=createServer({store,adminSecret:'x'.repeat(40),publicUrl:'https://edge.example',foundryUrl:'https://foundry.example/world',bridge:{scope}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(url+'/admin');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors https:\/\/foundry\.example;/);
  assert.equal((await fetch(url+'/admin/state',{headers:{Origin:'https://foundry.example'}})).status,401);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
