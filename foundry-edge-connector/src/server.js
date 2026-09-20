import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import { PROTOCOL_VERSION,failure,sameScope,validateConnectorUrl } from './protocol.js';
import {AdminAuth,clientAddress} from './auth.js';
import {connectorReleaseInfo} from './version.js';
import {ActivityLeases} from './activity.js';

async function body(request){
 if(!request.headers['content-type']?.startsWith('application/json'))throw failure('invalid-body','JSON is required.');
 let size=0;const chunks=[];
 for await(const chunk of request){size+=chunk.length;if(size>16384)throw failure('invalid-body','Request is too large.');chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
 catch{throw failure('invalid-body','Invalid JSON request.');}
}

function apiHandler({store,bridge,adminSecret,publicUrl,coordinator,activity,localPreview=false,trustedProxies=[],foundryUrl}){
 const localUrl=new URL(publicUrl);
 const allowLocal=localPreview&&localUrl.origin==='http://127.0.0.1:8791'&&localUrl.href==='http://127.0.0.1:8791/';
 const auth=new AdminAuth(adminSecret,allowLocal?localUrl.origin:new URL(validateConnectorUrl(publicUrl)).origin);
 const frameAncestor=foundryUrl?new URL(validateConnectorUrl(foundryUrl)).origin:"'none'";
 async function mapping(value){
  if(!sameScope(value.scope,bridge.scope)||!(await bridge.listPlayers()).some(p=>p.id===value.userId))
   throw failure('invalid-mapping','Select a player in the connected world.');
  if(!sameScope(value.scope,bridge.scope))throw failure('invalid-mapping','The world changed. Refresh administration.');
 }
 return async(request,response)=>{
  const route=request.url,method=request.method;
  const assets={'/admin':['admin.html','text/html'],'/admin/':['admin.html','text/html'],'/admin.js':['admin.js','text/javascript'],'/admin.css':['admin.css','text/css']};
  if(Object.hasOwn(assets,route)&&method==='GET'){
   const [name,type]=assets[route];response.setHeader('Content-Type',type);
   response.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors ${frameAncestor};`);
   response.end(await readFile(new URL('../public/'+name,import.meta.url)));return;
  }
  if(route.startsWith('/v1/')){
   response.setHeader('Access-Control-Allow-Origin','*');
   response.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
   response.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
   if(method==='OPTIONS'){response.writeHead(204);response.end();return;}
  }
  let result;
  if(route==='/admin/login'&&method==='POST')result=auth.login((await body(request)).secret,request,response,clientAddress(request,trustedProxies));
  else if(route.startsWith('/admin/')){
   const session=auth.require(request);
   if(route==='/admin/session'&&method==='GET')result={csrf:session.csrf};
   else if(route==='/admin/logout'&&method==='POST'){auth.logout(request,response);result={ok:true};}
   else if(route==='/admin/state'&&method==='GET'){
    const scope=bridge.scope,players=scope?await bridge.listPlayers():[];
    if(scope&&!sameScope(scope,bridge.scope))throw failure('stale-world','The world changed. Refresh administration.');
    result={scope,players,devices:store.listDevices()};
   }
   else if(route==='/admin/invites'&&method==='POST'){const value=await body(request);await mapping(value);result={code:store.createInvite(value)};}
   else if(route==='/admin/mappings'&&method==='POST'){const value=await body(request);await mapping(value);store.setMapping(value.deviceId,value.scope,value.userId);result={ok:true};}
   else if(route==='/admin/revoke'&&method==='POST'){store.revokeDevice((await body(request)).deviceId);result={ok:true};}
   else if(route==='/admin/devices/rename'&&method==='POST'){const value=await body(request);store.renameDevice(value.deviceId,value.label);result={ok:true};}
  }else if(route==='/v1/pair'&&method==='POST'){
   const success=auth.limit('pair:'+clientAddress(request,trustedProxies));result=store.redeemInvite((await body(request)).code);success();
  }else if(route.startsWith('/v1/')){
   const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization??'');
   const device=store.authenticateDevice(match?.[1]);
   if(route==='/v1/activity-leases'&&method==='POST'&&activity){
    result=activity.open(device.deviceId,await body(request),bridge.scope,Date.now());response.statusCode=201;
   }else if(route==='/v1/activity-leases'&&method==='PUT'&&activity){
    result=activity.renew(device.deviceId,await body(request),bridge.scope,Date.now());
   }else if(route==='/v1/activity-leases'&&method==='DELETE'&&activity){
    const value=await body(request);
    if(Object.keys(value).length!==1||!Object.hasOwn(value,'leaseId'))throw failure('invalid-activity','Activity lease is invalid.');
    activity.close(device.deviceId,value.leaseId,Date.now());response.statusCode=204;response.end();return;
   }else if(route==='/v1/world'&&method==='GET'){
    const scope=bridge.scope;const userId=scope?store.resolveUser(device.deviceId,scope):null;
    result={scope,userId,status:scope?'connected':'offline'};
   }else if(/^\/v1\/characters\/[\w-]{1,128}\/portrait$/.test(route)&&method==='GET'){
    const scope=bridge.scope,userId=store.resolveUser(device.deviceId,scope);
    const value=await bridge.readPortrait(userId,route.split('/')[3]);
    if(!sameScope(scope,bridge.scope)||store.resolveUser(device.deviceId,scope)!==userId)throw failure('forbidden','Access changed. Refresh the character list.');
    result=value??{dataUrl:null};
   }else if((route==='/v1/characters'||/^\/v1\/characters\/[\w-]{1,128}$/.test(route))&&method==='GET'){
    const scope=bridge.scope,userId=store.resolveUser(device.deviceId,scope);
    const value=route==='/v1/characters'?await bridge.listCharacters(userId):await bridge.readCharacter(userId,route.slice(15));
    if(!sameScope(scope,bridge.scope)||store.resolveUser(device.deviceId,scope)!==userId)throw failure('forbidden','Access changed. Refresh the character list.');
    result=route==='/v1/characters'?{scope,characters:value}:value;
   }else if(route==='/v1/commands'&&method==='POST'&&coordinator)result=await coordinator.dispatch(device.deviceId,await body(request));
   else if(route.startsWith('/v1/requests/')&&method==='GET'&&coordinator)result=coordinator.getRequest(device.deviceId,route.slice(13));
  }
  if(result===undefined)throw failure('not-found','Endpoint not found.');
  response.end(JSON.stringify(result));
 };
}

// Without configuration, expose only the public diagnostic health endpoint.
export function createServer(config) {
  const release=config?.release??connectorReleaseInfo();
  const api=config?apiHandler({...config,activity:config.activity??new ActivityLeases()}):null;
  const server=createHttpServer(async(request,response) => {
    response.setHeader('Content-Type','application/json');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    if (request.url !== '/health') {
      if(api){
        try{await api(request,response);}catch(error){
          const codes={'unauthorized':401,'forbidden':403,'rate-limited':429,'not-found':404,'request-not-found':404,'activity-not-found':404,'no-mapping':403,'stale-world':409,'request-conflict':409,'activity-conflict':409,'busy':429,'activity-limit':429,'invalid-body':400,'invalid-mapping':400,'invalid-invite':400,'invalid-command':400,'invalid-activity':400};
          const status=error.code==='invalid-label'?400:codes[error.code]??503;
          response.writeHead(status);response.end(JSON.stringify({error:{code:status===503?'unavailable':error.code,message:status===503?'Connector is unavailable. Try again shortly.':error.message}}));
        }
        return;
      }
      response.writeHead(404);
      response.end(JSON.stringify({error:{code:'not-found',message:'This diagnostic exposes only /health.'}}));
      return;
    }
    // The health response is public, non-sensitive and never permits credentials.
    response.setHeader('Access-Control-Allow-Origin','*');
    if (request.method !== 'GET') {
      response.setHeader('Allow','GET');
      response.writeHead(405);
      response.end(JSON.stringify({error:{code:'method-not-allowed'}}));
      return;
    }
    response.end(JSON.stringify({service:'foundry-edge-connector',protocol:PROTOCOL_VERSION,status:config?'running':'diagnostic',release}));
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8790);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createServer();
  server.listen(port,'127.0.0.1',()=>console.log(`Foundry Edge diagnostic listening on 127.0.0.1:${port}`));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>server.close());
}
