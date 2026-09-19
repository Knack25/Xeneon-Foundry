const same=(a,b)=>!!a&&!!b&&['instanceId','worldId','generation'].every(k=>a[k]===b[k]);
export function reduce(state,event){
 if(event.type==='clear')return {...state,scope:null,snapshot:null,selected:null,characters:[]};
 if(event.type==='world')return same(state.scope,event.scope)?state:{...state,scope:event.scope,snapshot:null,selected:null,characters:[]};
 if(event.type==='snapshot'){
  const value=event.snapshot;
  if(!same(state.scope,value.scope)||state.selected!==value.actorId||(state.snapshot?.revision??0)>=value.revision)return state;
  return {...state,snapshot:value};
 }
 return state;
}
