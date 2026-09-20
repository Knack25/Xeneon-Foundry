import {PresenceMonitor} from './presence.js';
import {ActivityLeases} from './activity.js';
import {UpdateSafetyGate} from '../../foundry-edge-updater/src/safety-gate.js';

export function createUpdateSafety(store,gateOptions={}){
 if(!store||typeof store.countUnresolvedRequests!=='function')throw new TypeError('A connector store is required.');
 const presence=new PresenceMonitor(),activity=new ActivityLeases();
 const gate=new UpdateSafetyGate({...gateOptions,presence,activity,unresolvedRequests:()=>store.countUnresolvedRequests(),requestContinuity:()=>store.requestContinuity()});
 return Object.freeze({presence,activity,gate});
}
