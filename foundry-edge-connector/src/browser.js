import {failure,sameScope} from './protocol.js';
export class BrowserBridge {
 constructor(){this.session=null;}
 get scope(){return this.session?.scope??null;}
 attach(session){this.session=session;}
 disconnect(){this.session=null;}
 async call(method,args){
  const session=this.session;if(!session)throw failure('no-world','Foundry is disconnected.');
  const result=await session.call(method,args);
  if(this.session!==session)throw failure('stale-world','Foundry reconnected. Refresh the sheet.');
  return result;
 }
 listPlayers(){return this.call('listPlayers',[]);}
 readPresence(){return this.call('readPresence',[]);}
 listCharacters(userId){return this.call('listCharacters',[userId]);}
 readCharacter(userId,actorId){return this.call('readCharacter',[userId,actorId]);}
 readPortrait(userId,actorId){return this.call('readPortrait',[userId,actorId]);}
 async executeAction(userId,command){
  if(!sameScope(command.scope,this.scope))throw failure('stale-world','The world changed.');
  return this.call('executeAction',[userId,command]);
 }
}
