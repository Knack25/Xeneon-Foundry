import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer as httpServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from './store.js';
import {BrowserBridge} from './browser.js';
import {startBrowser} from './runtime-session.js';
import {Coordinator} from './commands.js';
import {createServer} from './server.js';
import {createUpdateSafety} from './update-safety.js';

// This preview deliberately binds only to loopback. Use HTTPS deployment for remote devices.
const secretFile=process.argv[2],runtimeDir=process.argv[3];
if(!secretFile||!runtimeDir)throw Error('Usage: node src/preview.js <test-accounts.json> <private-runtime-directory>');
const accounts=JSON.parse(await readFile(secretFile,'utf8'));
if(accounts.worldId!=='xeneon-edge-test')throw Error('Preview bootstrap is restricted to xeneon-edge-test.');
await mkdir(runtimeDir,{recursive:true});
const store=new Store(path.join(runtimeDir,'preview.sqlite'));
const bridge=new BrowserBridge(),safety=createUpdateSafety(store),coordinator=new Coordinator({store,bridge,gate:safety.gate});
const adminFile=path.join(runtimeDir,'admin-key.txt');
let adminSecret;
try{adminSecret=(await readFile(adminFile,'utf8')).trim();}
catch(error){if(error.code!=='ENOENT')throw error;adminSecret=randomBytes(32).toString('base64url');await writeFile(adminFile,adminSecret,{flag:'wx',mode:0o600});}
const controller=startBrowser({bridge,presence:safety.presence,config:{url:accounts.url,channel:process.platform==='win32'?'msedge':undefined,worlds:{[accounts.worldId]:{userId:accounts.service.id,password:accounts.service.password}}},onStatus:status=>console.log('Foundry service: '+status)});
const api=createServer({store,bridge,coordinator,activity:safety.activity,adminSecret,publicUrl:'http://127.0.0.1:8791',localPreview:true});
const widget=fileURLToPath(new URL('../../foundry-edge-widget/widget/',import.meta.url));
const files={'/src/preferences.js':['src/preferences.js','text/javascript'],'/':['preview.html','text/html'],'/dashboard.css':['dashboard.css','text/css'],'/src/app.js':['src/app.js','text/javascript'],'/src/state.js':['src/state.js','text/javascript']};
const server=httpServer(async(req,res)=>{
 // Reject DNS rebinding; no forwarded-host trust in the local preview.
 if(!['127.0.0.1:8791','localhost:8791'].includes(req.headers.host)){res.writeHead(403);res.end();return;}
 if(req.url?.startsWith('/v1/')||req.url==='/health'||['/admin','/admin/','/admin.js','/admin.css'].includes(req.url)||req.url?.startsWith('/admin/')){api.emit('request',req,res);return;}
 const file=files[req.url];
 if(!file||req.method!=='GET'){res.writeHead(404);res.end();return;}
 try{res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(await readFile(path.join(widget,file[0])));}
 catch{res.writeHead(500);res.end();}
});
server.listen(8791,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8791'));
let nextInvite=0;
let inviteTimer=setInterval(async()=>{
 if(!bridge.scope||Date.now()<nextInvite)return;
 nextInvite=Date.now()+300000;
 const code=store.createInvite({scope:bridge.scope,userId:accounts.player.id});
 await writeFile(path.join(runtimeDir,'preview-ready.json'),JSON.stringify({url:'http://127.0.0.1:8791',scope:bridge.scope,code,expires:Date.now()+600000}),{mode:0o600});
 console.log('Preview ready; pairing invitation saved in the private runtime directory.');
},1000);
async function stop(){clearInterval(inviteTimer);await controller.stop();server.close(()=>{store.close();process.exit(0);});}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stop());
