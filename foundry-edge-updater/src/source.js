import {updateFailure} from './errors.js';
import {parseReleaseManifest} from './manifest.js';
import {verifyDetachedSignature} from './signature.js';

const REDIRECTS=new Set([301,302,303,307,308]);
const invalid=()=>{throw updateFailure('release-source-invalid','Release source is invalid.');};
const unavailable=()=>{throw updateFailure('release-source-unavailable','Release source is unavailable.');};
const tooLarge=()=>{throw updateFailure('release-body-too-large','Release response is too large.');};

function validateOrigins(origins){
  if(!(origins instanceof Set)||origins.size===0)invalid();
  for(const origin of origins){
    let url;
    try{url=new URL(origin);}catch{invalid();}
    if(typeof origin!=='string'||url.protocol!=='https:'||url.origin!==origin||url.href!==origin+'/')invalid();
  }
}

function trustedUrl(value,allowedOrigins,base){
  let url;
  try{url=new URL(value,base);}catch{invalid();}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!allowedOrigins.has(url.origin))invalid();
  return url;
}

function preserve(error){
  return ['release-source-invalid','release-source-unavailable','release-body-too-large'].includes(error?.code);
}

export async function fetchBounded(url,{fetchImpl=fetch,allowedOrigins,maxBytes,maxRedirects=3}={}){
  validateOrigins(allowedOrigins);
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxRedirects)||maxRedirects<0)invalid();
  let current=trustedUrl(url,allowedOrigins);
  let redirects=0;
  let response;
  while(true){
    try{response=await fetchImpl(current.href,{redirect:'manual'});}catch(error){if(preserve(error))throw error;unavailable();}
    if(!response||!Number.isInteger(response.status)||!response.headers||typeof response.headers.get!=='function')unavailable();
    if(response.url)trustedUrl(response.url,allowedOrigins);
    if(!REDIRECTS.has(response.status))break;
    if(redirects>=maxRedirects)invalid();
    const location=response.headers.get('location');
    if(!location)invalid();
    current=trustedUrl(location,allowedOrigins,current);
    redirects++;
  }
  if(response.status!==200)unavailable();
  const declared=response.headers.get('content-length');
  if(declared!==null){
    if(!/^(0|[1-9]\d*)$/.test(declared)||!Number.isSafeInteger(Number(declared)))invalid();
    if(Number(declared)>maxBytes)tooLarge();
  }
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader();
  const chunks=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      const chunk=value instanceof Uint8Array?value:new Uint8Array(value);
      size+=chunk.byteLength;
      if(size>maxBytes){await reader.cancel();tooLarge();}
      chunks.push(chunk);
    }
  }catch(error){
    if(preserve(error))throw error;
    unavailable();
  }
  const result=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}
  return result;
}

export async function loadVerifiedRelease({manifestUrl,trustedKeys,allowedSourceOrigins,allowedAssetOrigins,fetchImpl=fetch}={}){
  validateOrigins(allowedSourceOrigins);
  const source=trustedUrl(manifestUrl,allowedSourceOrigins);
  const manifestBytes=await fetchBounded(source.href,{fetchImpl,allowedOrigins:allowedSourceOrigins,maxBytes:131072});
  const signatureBytes=await fetchBounded(source.href+'.sig',{fetchImpl,allowedOrigins:allowedSourceOrigins,maxBytes:4096});
  verifyDetachedSignature({manifestBytes,signatureBytes,trustedKeys});
  return parseReleaseManifest(manifestBytes,{allowedAssetOrigins,maxBytes:131072});
}
