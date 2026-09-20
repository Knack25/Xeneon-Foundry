import { createAdapter } from './dnd5e.js';
import { appendAttribution } from './chat.js';
import { failure } from './protocol.js';
import {registerAdminControls} from './admin.js';

const ID = 'foundry-edge';
export function registerModule({Hooks,game:initialGame,getGame = () => initialGame,makeId = () => crypto.randomUUID()}) {
  Hooks.once('init', () => {
    const game = getGame();
    registerAdminControls({game,Hooks,ApplicationV2:globalThis.foundry?.applications?.api?.ApplicationV2});
    game.settings.register(ID,'serviceUserId',{name:'Connector service user ID',
      hint:'Use the ID of a dedicated service account. Leave blank to disable the probe API.',
      scope:'world',config:true,type:String,default:'',requiresReload:true});
  });
  Hooks.on('renderChatMessageHTML',appendAttribution);
  Hooks.once('ready', () => {
    const game = getGame();
    if (!game.settings.get(ID,'serviceUserId') || game.user.id !== game.settings.get(ID,'serviceUserId')) return;
    const scope = Object.freeze({instanceId:'local-probe',worldId:game.world.id,generation:makeId()});
    const adapter = createAdapter({game,getScope:()=>scope,
      getRollMode:()=>{
        const mode = globalThis.CONFIG?.Dice?.BasicRoll?.getMessageMode?.() ?? game.settings.get('core','messageMode');
        return mode === 'ic' ? 'public' : mode;
      }});
    const guard = () => {
      if (game.user.id !== game.settings.get(ID,'serviceUserId') || game.world.id !== scope.worldId)
        throw failure('service-access-denied','The probe is not running in the designated service session.');
    };
    // Local diagnostic API only. Remote transport, pairing and durable deduplication are not installed yet.
    game.modules.get(ID).api = Object.freeze({scope,
      listCharacters(userId){guard();return adapter.listCharacters(userId);},
      readCharacter(userId,actorId){guard();return adapter.readCharacter(userId,actorId,scope);},
      executeAction(userId,command){guard();return adapter.executeAction(userId,command);}
    });
  });
}

// Foundry exposes Hooks before constructing game. Resolve game only inside lifecycle callbacks.
if (typeof Hooks !== 'undefined') registerModule({Hooks,getGame:() => game});
