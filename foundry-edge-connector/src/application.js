import {createServer as httpServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createServer} from './server.js';
import {connectorReleaseInfo} from './version.js';
const assets={'/src/preferences.js':['src/preferences.js','text/javascript'],'/':['preview.html','text/html'],'/dashboard.css':['dashboard.css','text/css'],'/src/app.js':['src/app.js','text/javascript'],'/src/state.js':['src/state.js','text/javascript']};
export function createApplication(config){
 const release=config.release??connectorReleaseInfo();
 const api=createServer({...config,release});
 const server=httpServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.url==='/ready'&&req.method==='GET'){res.writeHead(config.bridge.scope?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ready:!!config.bridge.scope,release}));return;}
  if(req.method==='GET'&&Object.hasOwn(assets,req.url)){
   const [name,type]=assets[req.url];
   try{
    const content=await readFile(new URL('../../foundry-edge-widget/widget/'+name,import.meta.url));
    res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(content);
   }catch{res.writeHead(503);res.end('Dashboard is unavailable.');}
   return;
  }
  api.emit('request',req,res);
 });
 server.requestTimeout=15000;server.headersTimeout=10000;return server;
}
