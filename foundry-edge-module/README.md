# Foundry Edge companion module — compatibility probe

Targets Foundry 14.367 / D&D 5e 5.3.3. The companion module and standalone connector are deployed and verified in the disposable Xeneon Edge Test world. The connector handles pairing, authenticated requests, durable request coordination and the unattended service browser; this module checks current player/service ownership and invokes native character APIs.

The designated service session also exposes a minimal presence report containing only the current world scope, service-user ID and active user IDs/roles. The connector uses it for update safety; disconnected, stale or malformed presence never means the world is empty. This does not install or enable updates.

## Build and install into a test world

1. With Node 24+ and Python 3.9+, run `npm test` and `npm run build` here.
2. Copy the contents of `dist/` to `<Foundry user data>/Data/modules/foundry-edge/`, so `module.json` sits directly in that directory. Restart Foundry if needed to discover it.
3. Enable **Foundry Edge — Compatibility Probe** in a disposable/test world using D&D 5e 5.3.3.
4. Create a dedicated service user and give it ownership of a disposable PC. Give a separate test player ownership of the same PC. Start with the least privileged role supporting character updates and chat rolls.
5. As a GM, set **Connector service user ID** in module settings to that service user's ID. Reload and log into a separate browser as the service user. This is a different account from normal players.

To create a portable ZIP, run from the repository root:

```powershell
python scripts/package-foundry-probe.py foundry-edge-module/dist dist/foundry-probe/foundry-edge-module-0.1.0-probe.zip
```

On Linux use `python3`. This packager writes forward-slash archive paths; do not use Windows PowerShell `Compress-Archive` for the Linux deployment because it can produce backslash member names.

## Manage Edges inside Foundry

After enabling or updating the module, refresh your Foundry browser. As a GM, open the Game Settings sidebar and click **Manage Edges**. You can also use **Configure Settings → Foundry Edge → Open Edge administration**.

Set **Connector HTTPS URL** to the connector origin (for this deployment, `https://edge.foundry.jewinashoe.org`). The resizable Foundry window provides the hosted administrator console for generating pairing codes, changing player mappings and revoking devices. Sign in with the separate connector administrator key; it is never saved in Foundry settings. `Manage Hosted Foundry Edges.cmd` in the repository opens the hosted console and displays your local key.

The connector permits embedding only from its configured Foundry origin. If browser cookie restrictions prevent embedded sign-in, use **Open in browser**. The menu and window are GM-only; connector authentication is still enforced separately.

Verified in Xeneon Edge Test on 2026-09-19: native window and sidebar entry, embedded login, code generation, device pairing, revocation, logout and new-tab fallback. The public hostname was resolved explicitly in the test browser because of cached DNS results on the test machine.

## Test in the service browser console

Read-only inspection (IDs below must be the real test player and character IDs):

```js
const edge = game.modules.get('foundry-edge').api;
edge.scope;
edge.listCharacters('TEST_PLAYER_ID');
edge.readCharacter('TEST_PLAYER_ID', 'TEST_ACTOR_ID');
```

The following deliberately creates a public roll in the test world. Set the service browser's default roll mode to Public Roll; private modes should be rejected.

```js
await edge.executeAction('TEST_PLAYER_ID', {
  requestId: crypto.randomUUID(), scope: edge.scope, actorId: 'TEST_ACTOR_ID',
  operation: 'roll.skill', input: {skill: 'prc', mode: 'normal'}
});
```

Confirm the character is the speaker, the requesting player label appears, the actual author is the service account, and no dialog opens. Direct console calls bypass the connector's durable request coordinator. Do not retry an uncertain action.

For disposable-character HP testing use `operation: 'hp.adjust', input: {amount: -1}` for damage, positive amounts for healing, or `operation: 'hp.temp.set', input: {value: 2}` to explicitly replace temp HP. Check that damage consumes temp HP and healing respects the maximum. These use native D&D methods; automated tests verify call boundaries, not the real game engine.

Remove the test player's ownership and confirm reads and actions fail even though the service user remains an owner. Test with normal player browsers open and closed. Record the Foundry build, service role, and observed results in `docs/foundry/compatibility-14-5.3.3.md`.

## Weapon attacks

The snapshot includes weapon attack activities, their native to-hit labels, weapon modes and ammunition choices. `roll.attack` and `roll.damage` require explicit `itemId`, `activityId`, `attackMode`, `ammunitionId` and `mode`; the module resolves these only within the authorized character and checks the current options before dispatch. No client-supplied formula or arbitrary roll configuration is accepted.

Attacks use D&D 5.3.3 Activity `rollAttack`; damage uses `rollDamage` with explicit critical state and no dialog. Native ammunition/thrown-weapon consumption applies to attacks. Damage rolls are independent; select the same mode and ammunition used for the attack. When Foundry deletes a final ammunition stack, its damage data is retained for that player for ten minutes within the same connector session, shown as "spent; damage only". It cannot be used for another attack. After expiry or a connector restart, resolve that damage in Foundry.

## Expanded controls

`controls.js` implements explicit expected-value edits for inventory equipment/quantity, remaining item uses, spell slots, primary/secondary/tertiary resources and allowlisted character detail fields. Item uses write native `uses.spent`; derived maxima are not overwritten. The adapter applies current player/service ownership checks before every operation.

`spells.js` calls native `Activity.use` with an explicit slot, template placement disabled and subsequent dialogs disabled. The cast consumes resources and posts the attributed chat card. A bounded ten-minute per-player/character cache retains the native scaled/consumed clone for follow-up attack/damage/healing, linked to the original chat message. A world/generation change invalidates retained casts. Unsupported activity types stay in Foundry.

Initiative uses native `Actor.rollInitiative` for existing combat entries and `getInitiativeRoll` plus chat outside combat. It does not create combatants, encounters or advance encounter turns.

## Session controls and portraits

`gameplay.js` handles native short/long rests, condition toggles, inspiration and ending concentration. Rest options disable automatic Hit Dice spending, world-time advancement and bastion advancement. The adapter exposes native Hit Die, death-save and concentration rolls. Derived encumbrance statuses and concentration are excluded from generic condition toggles.

Explicit expected-value controls also cover currency, preparation, attunement and container membership. Native feature and consumable activities share the bounded follow-up cache with spells. A consumed, automatically deleted item can finish its retained roll without another resource use.

`portrait.js` authorizes before and after fetching the actor's configured same-origin raster image. Redirects, external URLs and non-raster formats are rejected; streaming reads are limited to 1 MiB and ten seconds. No arbitrary client URL is accepted.
