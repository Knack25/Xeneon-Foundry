import {createPublicKey,verify} from 'node:crypto';
import {updateFailure} from './errors.js';

const ENVELOPE_KEYS=['algorithm','keyId','signature'];
const DANGEROUS_KEYS=new Set(['__proto__','prototype','constructor']);
const KEY_ID=/^[A-Za-z0-9._-]{1,128}$/;
const BASE64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const malformed=()=>{throw updateFailure('invalid-release-signature','Release signature is invalid.');};
const untrusted=()=>{throw updateFailure('untrusted-release','Release signature is not trusted.');};

function rejectDangerous(value){
  if(value===null||typeof value!=='object')return;
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||DANGEROUS_KEYS.has(key))malformed();
    rejectDangerous(value[key]);
  }
}

export function verifyDetachedSignature({manifestBytes,signatureBytes,trustedKeys}={}){
  if(!(signatureBytes instanceof Uint8Array)||!(manifestBytes instanceof Uint8Array))malformed();
  if(signatureBytes.byteLength>4096)
    throw updateFailure('release-signature-too-large','Release signature is too large.');
  let envelope;
  try{
    envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(signatureBytes));
  }catch{malformed();}
  rejectDangerous(envelope);
  if(envelope===null||typeof envelope!=='object'||Array.isArray(envelope)
    ||Reflect.ownKeys(envelope).length!==ENVELOPE_KEYS.length
    ||!ENVELOPE_KEYS.every(key=>Object.hasOwn(envelope,key))
    ||envelope.algorithm!=='Ed25519'||!KEY_ID.test(envelope.keyId)
    ||typeof envelope.signature!=='string'||!BASE64.test(envelope.signature))malformed();
  const signature=Buffer.from(envelope.signature,'base64');
  if(signature.length!==64||signature.toString('base64')!==envelope.signature)malformed();
  if(!(trustedKeys instanceof Map)||!trustedKeys.has(envelope.keyId))untrusted();
  try{
    const key=createPublicKey(trustedKeys.get(envelope.keyId));
    if(key.asymmetricKeyType!=='ed25519'||!verify(null,manifestBytes,key,signature))untrusted();
  }catch(error){
    if(error?.code==='untrusted-release')throw error;
    untrusted();
  }
}
