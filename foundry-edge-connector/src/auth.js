import {randomBytes,timingSafeEqual} from 'node:crypto';
import {digest} from './store.js';
import {failure} from './protocol.js';
import {isIP} from 'node:net';
export function clientAddress(request,trustedProxies=[]){
 const peer=request.socket.remoteAddress?.replace(/^::ffff:(?=\d+\.)/,'')??'unknown';
 if(!trustedProxies.includes(peer))return peer;
 const header=request.headers['x-forwarded-for'];
 if(typeof header!=='string'||header.length>2048)return peer;
 const closest=header.split(',').at(-1).trim();
 return isIP(closest)?closest:peer;
}
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
export class AdminAuth {
 constructor(secret,origin){
  if(typeof secret!=='string'||secret.length<32)throw Error('Admin secret must contain at least 32 characters.');
  this.secret=secret;this.origin=origin;this.sessions=new Map();this.limits=new Map();
 }
 limit(key,now=Date.now()){
  for(const [id,value] of this.limits)if(value.until<=now)this.limits.delete(id);
  const value=this.limits.get(key)??{count:0,until:now+60000};
  if(value.count>=5)throw failure('rate-limited','Wait a minute before trying again.');
  value.count++;this.limits.set(key,value);
  return ()=>{value.count=Math.max(0,value.count-1);};
 }
 login(secret,request,response,address=request.socket.remoteAddress){
  const success=this.limit('login:'+address);
  if(request.headers.origin!==this.origin)throw failure('forbidden','Open administration from the connector address.');
  if(!equal(secret,this.secret))throw failure('unauthorized','Invalid administrator credential.');
  const now=Date.now();for(const [id,s] of this.sessions)if(s.expires<=now)this.sessions.delete(id);
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  this.sessions.set(digest(token),{csrf,expires:now+3600000});
  response.setHeader('Set-Cookie',`edge_admin=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`);
  success();
  return {csrf};
 }
 require(request){
  const token=request.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('edge_admin='))?.slice(11);
  const session=token&&this.sessions.get(digest(token));
  if(!session||session.expires<=Date.now())throw failure('unauthorized','Administrator login required.');
  if(request.method!=='GET'&&(request.headers.origin!==this.origin||!equal(request.headers['x-csrf-token'],session.csrf)))
   throw failure('forbidden','Refresh administration and try again.');
  return session;
 }
 logout(request,response){
  this.require(request);
  const token=request.headers.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('edge_admin=')).slice(11);
  this.sessions.delete(digest(token));
  response.setHeader('Set-Cookie','edge_admin=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
 }
}
