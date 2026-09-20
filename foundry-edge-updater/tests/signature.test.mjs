import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyDetachedSignature} from '../src/signature.js';

const encoder=new TextEncoder();
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});
const trustedKeys=new Map([['test-2026-09',publicPem]]);
const manifestBytes=encoder.encode('{"releaseId":"fixture"}\n');

function signatureBytes(overrides={}){
  return encoder.encode(JSON.stringify({algorithm:'Ed25519',keyId:'test-2026-09',
    signature:sign(null,manifestBytes,privateKey).toString('base64'),...overrides}));
}

test('verifies an Ed25519 signature over the exact manifest bytes', () => {
  assert.equal(verifyDetachedSignature({manifestBytes,signatureBytes:signatureBytes(),trustedKeys}),undefined);
});

test('rejects a changed manifest byte and unknown or wrong key material as untrusted', () => {
  const changed=manifestBytes.slice();changed[1]^=1;
  const {publicKey:rsa}=generateKeyPairSync('rsa',{modulusLength:2048});
  for(const values of [
    {manifestBytes:changed,signatureBytes:signatureBytes(),trustedKeys},
    {manifestBytes,signatureBytes:signatureBytes({keyId:'unknown'}),trustedKeys},
    {manifestBytes,signatureBytes:signatureBytes(),trustedKeys:new Map([['test-2026-09',rsa]])}
  ]) assert.throws(()=>verifyDetachedSignature(values),{code:'untrusted-release'});
});

test('rejects malformed signature envelopes and non-canonical base64', () => {
  const signed=JSON.parse(new TextDecoder().decode(signatureBytes()));
  for(const envelope of [
    {...signed,extra:true},
    {...signed,algorithm:'RSA-SHA256'},
    {...signed,keyId:'bad key'},
    {...signed,signature:'***'},
    {...signed,signature:signed.signature+'='},
    [],null
  ]) assert.throws(()=>verifyDetachedSignature({manifestBytes,signatureBytes:encoder.encode(JSON.stringify(envelope)),trustedKeys}),
    {code:'invalid-release-signature'});
  assert.throws(()=>verifyDetachedSignature({manifestBytes,signatureBytes:Uint8Array.of(0xff),trustedKeys}),
    {code:'invalid-release-signature'});
});

test('rejects dangerous envelope keys and envelopes over four KiB', () => {
  const dangerous=encoder.encode('{"algorithm":"Ed25519","keyId":"test-2026-09","signature":"x","constructor":{}}');
  assert.throws(()=>verifyDetachedSignature({manifestBytes,signatureBytes:dangerous,trustedKeys}),
    {code:'invalid-release-signature'});
  assert.throws(()=>verifyDetachedSignature({manifestBytes,signatureBytes:encoder.encode('x'.repeat(4097)),trustedKeys}),
    {code:'release-signature-too-large'});
});

test('signature failures do not include signed bytes or key material', () => {
  const secret='secret-manifest-marker';
  assert.throws(()=>verifyDetachedSignature({manifestBytes:encoder.encode(secret),signatureBytes:signatureBytes(),trustedKeys}),error=>{
    assert.equal(error.code,'untrusted-release');
    assert.equal(error.message.includes(secret),false);
    assert.equal(error.message.includes('BEGIN PUBLIC KEY'),false);
    return true;
  });
});
