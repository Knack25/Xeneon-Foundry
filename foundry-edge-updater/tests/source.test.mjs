import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {fetchBounded,loadVerifiedRelease} from '../src/source.js';

const encoder=new TextEncoder();
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const keyId='test-2026-09';
const trustedKeys=new Map([[keyId,publicKey.export({type:'spki',format:'pem'})]]);
const allowedSourceOrigins=new Set(['https://updates.example','https://cdn.example']);
const allowedAssetOrigins=new Set(['https://github.com']);
const manifestUrl='https://updates.example/foundry-edge-stable.json';
const manifest={schemaVersion:1,releaseId:'2026.09.20-test.1',channel:'test',publishedAt:'2026-09-20T18:00:00.000Z',notes:'Signed fixture.',
  components:{connector:{version:'0.2.0',image:'ghcr.io/knack25/xeneon-foundry/connector@sha256:'+'a'.repeat(64)},
    dashboard:{version:'0.2.0',bundledIn:'connector'},
    module:{version:'0.2.0',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge-module.zip',sha256:'b'.repeat(64),size:1048576},
    edgePackage:{version:'0.1.0',installation:'manual',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge.icuewidget',sha256:'c'.repeat(64),size:2097152}},
  compatibility:{foundry:{minimum:'14.367',maximum:'14.367'},system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'},protocol:{minimum:1,maximum:1},dataSchema:{minimum:1,maximum:1}}};
const manifestBytes=encoder.encode(JSON.stringify(manifest));
const signatureBytes=encoder.encode(JSON.stringify({algorithm:'Ed25519',keyId,
  signature:sign(null,manifestBytes,privateKey).toString('base64')}));

const response=(body,init={})=>new Response(body,{status:200,...init});
function successfulFetch(calls=[]){
  return async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url)===manifestUrl)return response(manifestBytes);
    if(String(url)===manifestUrl+'.sig')return response(signatureBytes);
    return response(null,{status:404});
  };
}

test('loads, verifies, and parses a release from fixed derived URLs', async () => {
  const calls=[];
  const value=await loadVerifiedRelease({manifestUrl,trustedKeys,allowedSourceOrigins,allowedAssetOrigins,
    fetchImpl:successfulFetch(calls)});
  assert.equal(value.releaseId,manifest.releaseId);
  assert.equal(Object.isFrozen(value),true);
  assert.deepEqual(calls.map(call=>call.url),[manifestUrl,manifestUrl+'.sig']);
  assert.deepEqual(calls.map(call=>call.options.redirect),['manual','manual']);
});

test('rejects invalid and untrusted source URLs before fetching', async () => {
  let calls=0;const fetchImpl=async()=>{calls++;return response(manifestBytes);};
  for(const value of ['http://updates.example/release.json','https://user:pass@updates.example/release.json',
    'https://updates.example/release.json?token=x','https://updates.example/release.json#current','https://evil.example/release.json'])
    await assert.rejects(()=>loadVerifiedRelease({manifestUrl:value,trustedKeys,allowedSourceOrigins,allowedAssetOrigins,fetchImpl}),
      {code:'release-source-invalid'});
  assert.equal(calls,0);
});

test('follows only origin-checked manual redirects and caps redirect hops', async () => {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url)===manifestUrl)return response(null,{status:302,headers:{Location:'https://cdn.example/release.json'}});
    if(String(url)==='https://cdn.example/release.json')return response(manifestBytes);
    if(String(url)===manifestUrl+'.sig')return response(signatureBytes);
    return response(null,{status:404});
  };
  await loadVerifiedRelease({manifestUrl,trustedKeys,allowedSourceOrigins,allowedAssetOrigins,fetchImpl});
  assert.equal(calls[0].options.redirect,'manual');
  assert.deepEqual(calls.slice(0,2).map(call=>call.url),[manifestUrl,'https://cdn.example/release.json']);

  const evil=async()=>response(null,{status:302,headers:{Location:'https://evil.example/release.json'}});
  await assert.rejects(()=>fetchBounded(manifestUrl,{fetchImpl:evil,allowedOrigins:allowedSourceOrigins,maxBytes:10}),
    {code:'release-source-invalid'});
  const loop=async url=>response(null,{status:302,headers:{Location:String(url)}});
  await assert.rejects(()=>fetchBounded(manifestUrl,{fetchImpl:loop,allowedOrigins:allowedSourceOrigins,maxBytes:10,maxRedirects:3}),
    {code:'release-source-invalid'});
});

test('validates declared lengths and enforces the streaming byte limit', async () => {
  for(const header of ['invalid','-1','11']){
    const fetchImpl=async()=>response(encoder.encode('12345678901'),{headers:{'Content-Length':header}});
    await assert.rejects(()=>fetchBounded(manifestUrl,{fetchImpl,allowedOrigins:allowedSourceOrigins,maxBytes:10}),
      {code:header==='11'?'release-body-too-large':'release-source-invalid'});
  }
  let cancelled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(encoder.encode('12345678901'));},cancel(){cancelled=true;}});
  await assert.rejects(()=>fetchBounded(manifestUrl,{fetchImpl:async()=>response(body),allowedOrigins:allowedSourceOrigins,maxBytes:10}),
    {code:'release-body-too-large'});
  assert.equal(cancelled,true);
  const exact=await fetchBounded(manifestUrl,{fetchImpl:async()=>response(encoder.encode('1234567890')),
    allowedOrigins:allowedSourceOrigins,maxBytes:10});
  assert.equal(new TextDecoder().decode(exact),'1234567890');
});

test('maps network and HTTP failures to a generic unavailable result', async () => {
  await assert.rejects(()=>fetchBounded(manifestUrl,{fetchImpl:async()=>{throw new Error('private network detail');},
    allowedOrigins:allowedSourceOrigins,maxBytes:10}),error=>{
      assert.equal(error.code,'release-source-unavailable');
      assert.equal(error.message.includes('private network detail'),false);
      return true;
    });
  await assert.rejects(()=>fetchBounded(manifestUrl,{fetchImpl:async()=>response(null,{status:503}),
    allowedOrigins:allowedSourceOrigins,maxBytes:10}),{code:'release-source-unavailable'});
});

test('verifies exact bytes before parsing and keeps asset origins distinct', async () => {
  const tampered=manifestBytes.slice();tampered[tampered.length-2]^=1;
  const tamperedFetch=async url=>response(String(url).endsWith('.sig')?signatureBytes:tampered);
  await assert.rejects(()=>loadVerifiedRelease({manifestUrl,trustedKeys,allowedSourceOrigins,allowedAssetOrigins,fetchImpl:tamperedFetch}),
    {code:'untrusted-release'});
  await assert.rejects(()=>loadVerifiedRelease({manifestUrl,trustedKeys,allowedSourceOrigins,
    allowedAssetOrigins:new Set(['https://assets.example']),fetchImpl:successfulFetch()}),
    {code:'invalid-release-manifest'});
});

test('rejects a fetch response whose reported final URL is outside trusted origins', async () => {
  const fetchImpl=async()=>({status:200,ok:true,url:'https://evil.example/release.json',headers:new Headers(),
    body:response(manifestBytes).body});
  await assert.rejects(()=>fetchBounded(manifestUrl,{fetchImpl,allowedOrigins:allowedSourceOrigins,maxBytes:131072}),
    {code:'release-source-invalid'});
});
