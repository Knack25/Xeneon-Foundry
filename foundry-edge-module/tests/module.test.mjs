import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildModule } from '../scripts/build.mjs';
import { appendAttribution } from '../scripts/chat.js';
import { registerModule } from '../scripts/main.js';

test('module distribution contains portable imports and does not claim verified live compatibility', async () => {
  const dir = await mkdtemp(join(tmpdir(),'foundry-module-'));
  try {
    await buildModule(dir);
    const manifest = JSON.parse(await readFile(join(dir,'module.json'),'utf8'));
    assert.equal(manifest.id,'foundry-edge');
    assert.equal(manifest.compatibility.verified,undefined);
    for (const entry of manifest.esmodules) assert.ok((await readFile(join(dir,entry),'utf8')).length);
    const protocol = await readFile(join(dir,'scripts/protocol.js'),'utf8');
    assert.equal(protocol.includes('../../foundry-edge-connector'),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('chat attribution uses text content and does not render on hidden roll content', () => {
  const children = [];
  const root = {querySelector:()=>null,append:node=>children.push(node),
    ownerDocument:{createElement:()=>({className:'',textContent:''})}};
  const message = {isContentVisible:true,flags:{'foundry-edge':{requestingPlayerName:'<img onerror=bad()>'}}};
  appendAttribution(message,root);
  assert.equal(children[0].textContent,'Requested by <img onerror=bad()> · Edge');
  assert.equal(Object.hasOwn(children[0],'innerHTML'),false);
  appendAttribution({...message,isContentVisible:false},root);
  assert.equal(children.length,1);
});

test('only explicitly designated service user receives a probe API', () => {
  const handlers = new Map();
  const Hooks = {once:(name,fn)=>handlers.set(name,fn),on:()=>{}};
  const module = {};
  const settings = new Map();
  const game = {settings:{register:(ns,key,definition)=>settings.set(key,definition.default),get:(ns,key)=>settings.get(key)},
    user:{id:'player'},world:{id:'test-world'},modules:new Map([['foundry-edge',module]])};
  registerModule({Hooks,game,makeId:()=> 'generation-1'});
  handlers.get('init')();
  handlers.get('ready')();
  assert.equal(module.api,undefined);
  settings.set('serviceUserId','service');
  handlers.get('ready')();
  assert.equal(module.api,undefined);
  game.user.id = 'service';
  handlers.get('ready')();
  assert.equal(typeof module.api.listCharacters,'function');
  assert.equal(module.api.scope.worldId,'test-world');
});

test('module registers hooks before game exists and resolves game during init', async () => {
  const previousHooks=globalThis.Hooks;
  const previousGame=globalThis.game;
  const handlers=new Map();
  try {
    globalThis.Hooks={once:(name,fn)=>handlers.set(name,fn),on:()=>{}};
    delete globalThis.game;
    await import(`../scripts/main.js?late-game=${Date.now()}`);
    assert.equal(typeof handlers.get('init'),'function');
    const registered=[];
    globalThis.game={settings:{register:(ns,key)=>registered.push(`${ns}.${key}`)}};
    handlers.get('init')();
    assert.deepEqual(registered,['foundry-edge.connectorUrl','foundry-edge.serviceUserId']);
  } finally {
    if(previousHooks===undefined)delete globalThis.Hooks;else globalThis.Hooks=previousHooks;
    if(previousGame===undefined)delete globalThis.game;else globalThis.game=previousGame;
  }
});
