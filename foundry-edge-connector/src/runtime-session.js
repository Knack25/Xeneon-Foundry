import {chromium,request} from 'playwright';
import {io} from 'socket.io-client';
import {failure,validateConnectorUrl} from './protocol.js';

export async function openSession(config,onDisconnect=()=>{}){
 const url=validateConnectorUrl(config.url);
 const http=await request.newContext({baseURL:url,timeout:15000});let browser,socket;
 try{
  await http.get('/join');
  const state=await http.storageState();
  socket=io(url,{transports:['websocket'],extraHeaders:{Cookie:state.cookies.map(c=>`${c.name}=${c.value}`).join('; ')},reconnection:false,autoConnect:false,timeout:15000});
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(failure('offline','Foundry handshake timed out.')),15000);
   socket.once('session',()=>{clearTimeout(timer);resolve();});
   socket.once('connect_error',()=>{clearTimeout(timer);reject(failure('offline','Foundry connection failed.'));});socket.connect();
  });
  const join=await socket.timeout(15000).emitWithAck('getJoinData');socket.close();
  const worldId=join.world?.id??join.world?._id;
  const account=config.worlds?.[worldId];
  if(!account)throw failure('no-world','The loaded world is not configured for this connector.');
  const user=join.users?.find(u=>u._id===account.userId);
  if(!user||user.role>2)throw failure('invalid-service','A dedicated Player or Trusted Player service account is required.');
  const login=await http.post('/join',{data:{action:'join',userId:account.userId,password:account.password}});
  if(!login.ok()||(await login.json()).status!=='success')throw failure('login-failed','Service login failed. Check the secret file.');
  browser=await chromium.launch({channel:config.channel??'chromium',headless:true,args:['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({storageState:await http.storageState(),viewport:{width:320,height:240},reducedMotion:'reduce'});
  // Foundry 14's client-only setting; this service does not render or control scenes.
  await context.addInitScript(({origin})=>{if(location.origin===origin){localStorage.setItem('core.noCanvas','true');localStorage.setItem('core.maxFPS','10');localStorage.setItem('core.photosensitiveMode','true');}},{origin:new URL(url).origin});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(url+'/game',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>globalThis.game?.ready&&game.modules.get('foundry-edge')?.api,null,{timeout:60000});
  const scope=await page.evaluate(({worldId,userId})=>{
   if(game.world.id!==worldId||game.user.id!==userId)throw Error('Runtime identity changed');
   if(game.settings.get('core','noCanvas')!==true)throw Error('Service canvas must be disabled');
   return game.modules.get('foundry-edge').api.scope;
  },{worldId,userId:account.userId});
  browser.on('disconnected',onDisconnect);page.on('close',onDisconnect);page.on('crash',onDisconnect);
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())onDisconnect();});
  return {scope,
   async call(method,args){
    if(!['listPlayers','listCharacters','readCharacter','readPortrait','readPresence','executeAction','ping'].includes(method))throw Error('Unsupported bridge method');
    const reply=await page.evaluate(async({method,args,worldId,userId,generation})=>{
     if(!game.ready||!game.socket.connected||game.world.id!==worldId||game.user.id!==userId)throw Error('Service disconnected');
     const api=game.modules.get('foundry-edge')?.api;if(api?.scope.generation!==generation)throw Error('Generation changed');
     if(method==='ping')return {ok:true,value:true};
     if(method==='listPlayers')return {ok:true,value:game.users.contents.filter(u=>u.id!==userId&&u.role>=1&&u.role<=2).map(u=>({id:u.id,name:u.name}))};
     // Native exceptions after dispatch are uncertain, never safe retry instructions.
     try{return {ok:true,value:await api[method](...args)};}catch{return {ok:false};}
    },{method,args,worldId,userId:account.userId,generation:scope.generation});
    if(!reply.ok)throw failure('foundry-rejected','Foundry could not complete the request.');
    return reply.value;
   },
   async close(){await browser.close();await http.dispose();}
  };
 }catch(error){socket?.close();await browser?.close();await http.dispose();throw error;}
}

export function startBrowser({bridge,config,onStatus=()=>{},connect=openSession,
 presence={record(){},clear(){}},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
 let stopped=false,timer,session,delay=5000;
 const schedule=ms=>{if(!stopped)timer=setTimer(run,ms);};
 const disconnected=()=>{bridge.disconnect();presence.clear();};
 async function run(){
  if(stopped)return;
  try{
   if(session&&bridge.scope){
    await session.call('ping',[]);
    presence.record(await session.call('readPresence',[]),session.scope,now());
    schedule(3000);return;
   }
   if(session){await session.close();session=null;}
   session=await connect(config,disconnected);
   if(stopped){await session.close();return;}
   presence.record(await session.call('readPresence',[]),session.scope,now());
   bridge.attach(session);delay=5000;onStatus('connected');schedule(3000);
  }catch{
   disconnected();await session?.close().catch(()=>{});session=null;
   onStatus('offline');schedule(delay);delay=Math.min(delay*2,60000);
  }
 }
 void run();
 return {async stop(){stopped=true;clearTimer(timer);disconnected();await session?.close();}};
}
