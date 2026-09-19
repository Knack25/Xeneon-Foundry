# Foundry Edge companion module — compatibility probe

Targets Foundry 14 / D&D 5e 5.3.3. Live operation is not verified yet. There is no remote command listener, pairing, unattended browser, or retry protection in this probe. Its purpose is to validate native API behavior before implementing those components.

## Build and install into a test world

1. With Node 24+, run `npm test` and `npm run build` here.
2. Copy the contents of `dist/` to `<Foundry user data>/Data/modules/foundry-edge/`, so `module.json` sits directly in that directory. Restart Foundry if needed to discover it.
3. Enable **Foundry Edge — Compatibility Probe** in a disposable/test world using D&D 5e 5.3.3.
4. Create a dedicated service user and give it ownership of a disposable PC. Give a separate test player ownership of the same PC. Start with the least privileged role supporting character updates and chat rolls.
5. As a GM, set **Connector service user ID** in module settings to that service user's ID. Reload and log into a separate browser as the service user. This is a different account from normal players.

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

Confirm the character is the speaker, the requesting player label appears, the actual author is the service account, and no dialog opens. Do not retry a command after an uncertain result: this local probe has no durable request coordinator yet.

For disposable-character HP testing use `operation: 'hp.adjust', input: {amount: -1}` for damage, positive amounts for healing, or `operation: 'hp.temp.set', input: {value: 2}` to explicitly replace temp HP. Check that damage consumes temp HP and healing respects the maximum. These use native D&D methods; automated tests verify call boundaries, not the real game engine.

Remove the test player's ownership and confirm reads and actions fail even though the service user remains an owner. Test with normal player browsers open and closed. Record the Foundry build, service role, and observed results in `docs/foundry/compatibility-14-5.3.3.md`.
