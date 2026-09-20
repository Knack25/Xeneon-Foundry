import {readFileSync} from 'node:fs';
import {parseComponentIdentity} from '../../foundry-edge-updater/src/identity.js';

const identity=parseComponentIdentity(JSON.parse(readFileSync(
  new URL('../../release/component-versions.json',import.meta.url),'utf8')));
const RELEASE_ID=/^[A-Za-z0-9._-]{1,128}$/;

export function connectorReleaseInfo({releaseId=process.env.FOUNDRY_EDGE_RELEASE_ID??'development'}={}){
  if(typeof releaseId!=='string'||!RELEASE_ID.test(releaseId))
    throw Object.assign(new Error('Release identifier is invalid.'),{code:'invalid-release-id'});
  return Object.freeze({releaseId,
    components:Object.freeze({connector:identity.components.connector,dashboard:identity.components.dashboard}),
    protocol:Object.freeze({...identity.protocol}),dataSchema:identity.dataSchema,
    automaticInstall:Object.freeze({enabled:false,reason:'release-source-not-configured'})});
}
