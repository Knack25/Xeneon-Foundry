import {validateConnectorUrl} from './protocol.js';
const ID='foundry-edge';

export function adminUrl(value){
 const url=new URL(validateConnectorUrl(value));
 if(url.pathname!=='/')throw Error('Use the connector HTTPS origin without a path.');
 return new URL('/admin',url).href;
}

export function createAdminWindow({ApplicationV2,getGame}){
 return class EdgeManagement extends ApplicationV2{
  static DEFAULT_OPTIONS={id:'foundry-edge-management',classes:['foundry-edge-management'],
   window:{title:'Manage Edges',icon:'fas fa-tablet-screen-button',resizable:true},position:{width:1000,height:720}};
  _canRender(options){if(!getGame().user?.isGM)return false;return super._canRender(options);}
  async _renderHTML(){
   const pane=document.createElement('div');pane.style.cssText='display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;';
   const note=document.createElement('p');note.style.margin='0';
   let url;
   try{url=adminUrl(getGame().settings.get(ID,'connectorUrl'));}
   catch{note.textContent='Set the Connector HTTPS URL under Configure Settings → Foundry Edge, then reopen this window.';pane.append(note);return pane;}
   note.textContent='Sign in with your connector administrator key. If the embedded console cannot sign in, use Open in browser.';
   const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open in browser ↗';
   const frame=document.createElement('iframe');frame.src=url;frame.title='Foundry Edge administration';frame.referrerPolicy='no-referrer';
   frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals');frame.setAttribute('allow','clipboard-write');
   frame.style.cssText='flex:1;width:100%;min-height:300px;border:1px solid #45516c;border-radius:8px;background:#0c1018;';
   pane.append(note,link,frame);return pane;
  }
  _replaceHTML(result,content){content.style.cssText='display:flex;flex-direction:column;overflow:hidden;';content.replaceChildren(result);}
 };
}

export function registerAdminControls({game,Hooks,ApplicationV2}){
 game.settings.register(ID,'connectorUrl',{name:'Connector HTTPS URL',hint:'The dedicated Edge connector address, for example https://edge.example.org. Do not enter an administrator key here.',scope:'world',config:true,type:String,default:''});
 if(!ApplicationV2||!game.settings.registerMenu)return;
 const Window=createAdminWindow({ApplicationV2,getGame:()=>game});
 game.settings.registerMenu(ID,'manageEdges',{name:'Manage Edges',label:'Open Edge administration',hint:'Pair devices, change player mappings and revoke Edges.',icon:'fas fa-tablet-screen-button',type:Window,restricted:true});
 let instance;
 const open=()=>{if(!game.user?.isGM)return;instance??=new Window();return instance.render({force:true});};
 Hooks.on('renderSettings',(_app,html)=>{
  const root=html?.querySelector?html:html?.[0];
  if(!game.user?.isGM||!root||root.querySelector('[data-foundry-edge-management]'))return;
  const button=root.ownerDocument.createElement('button');button.type='button';button.dataset.foundryEdgeManagement='true';button.textContent='Manage Edges';
  button.addEventListener('click',()=>void open());root.append(button);
 });
 Hooks.on('updateUser',()=>{if(!game.user?.isGM)void instance?.close();});
}
