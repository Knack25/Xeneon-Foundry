import test from 'node:test';
import assert from 'node:assert/strict';
import {adminUrl,createAdminWindow,registerAdminControls} from '../scripts/admin.js';
test('management URL accepts only a clean HTTPS connector origin',()=>{
 assert.equal(adminUrl('https://edge.example/'),'https://edge.example/admin');
 for(const value of ['javascript:alert(1)','http://edge.example','https://secret@edge.example','https://edge.example/?key=secret','https://edge.example/path'])assert.throws(()=>adminUrl(value));
});
test('Foundry management window and settings menu are GM-only and store no admin credential',()=>{
 const settings=new Map(),menus=new Map(),hooks=new Map();
 const game={user:{isGM:false},settings:{register:(ns,key,value)=>settings.set(key,value),registerMenu:(ns,key,value)=>menus.set(key,value),get:()=>''}};
 class Base{_canRender(){return undefined;}}
 const Window=createAdminWindow({ApplicationV2:Base,getGame:()=>game});
 assert.equal(new Window()._canRender({}),false);game.user.isGM=true;assert.equal(new Window()._canRender({}),undefined);
 registerAdminControls({game,Hooks:{on:(name,callback)=>hooks.set(name,callback)},ApplicationV2:Base});
 assert.equal(menus.get('manageEdges').restricted,true);
 assert.deepEqual([...settings.keys()],['connectorUrl']);assert.equal(settings.get('connectorUrl').default,'');
 assert.equal(typeof hooks.get('renderSettings'),'function');
});
