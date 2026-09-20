import { createAdapter } from './dnd5e.js';
import { appendAttribution } from './chat.js';
import { DATA_SCHEMA_VERSION,PROTOCOL_RANGE,failure } from './protocol.js';
import {registerAdminControls} from './admin.js';
import {readPortrait} from './portrait.js';

const ID = 'foundry-edge';
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
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
    const module=game.modules.get(ID);
    if(!module||typeof module.version!=='string'||!SEMVER.test(module.version))return;
    const scope = Object.freeze({instanceId:'local-probe',worldId:game.world.id,generation:makeId()});
    const release=Object.freeze({component:'module',version:module.version,
      protocol:Object.freeze({...PROTOCOL_RANGE}),dataSchema:DATA_SCHEMA_VERSION});
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
    module.api = Object.freeze({scope,release,
      readPresence(){
        guard();
        return {scope:{...scope},serviceUserId:game.user.id,
          users:game.users.contents.filter(user=>user.active===true).map(user=>({id:user.id,role:user.role}))};
      },
      listCharacters(userId){guard();return adapter.listCharacters(userId);},
      readCharacter(userId,actorId){guard();return adapter.readCharacter(userId,actorId,scope);},
      readPortrait(userId,actorId){guard();return readPortrait({game,userId,actorId});},
      executeAction(userId,command){guard();return adapter.executeAction(userId,command);}
    });
  });
}

// Foundry exposes Hooks before constructing game. Resolve game only inside lifecycle callbacks.
if (typeof Hooks !== 'undefined') registerModule({Hooks,getGame:() => game});
