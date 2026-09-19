# Foundry Edge Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a multi-device, active-world character dashboard with conservative edits and native D&D rolls executed by a dedicated Foundry service account.

**Architecture:** A VPS connector authenticates devices and supervises a background Foundry browser. A companion module enforces mapped-player permissions and executes explicit operations through a D&D adapter. An iCUE widget consumes versioned snapshots and capabilities.

**Tech Stack:** JavaScript ES modules, Node.js LTS, SQLite, Playwright Chromium, native Node tests, esbuild, HTML/CSS, Foundry 14 and D&D 5e 5.3.3. Select supported exact dependency versions from current official documentation at execution time and commit lockfiles; do not copy unrelated widget dependencies.

**Spec:** `docs/superpowers/specs/2026-09-19-foundry-edge-widget-design.md` (approved by user).

## Global Constraints

- The initial target is Foundry VTT 14 with D&D 5e 5.3.3.
- Foundry remains authoritative.
- Only the currently loaded world's player-character actors owned by the mapped player are eligible.
- The service account remains the real message author.
- Initially expose public rolls only.
- No arbitrary scripts, document patches, or generic mutation endpoint are exposed to devices.
- Initial operation connects to one Foundry instance and one active world at a time.
- Keep Foundry-specific authentication and hosting separate from the existing Microsoft helper.
- Work with the player's normal browser closed; support multiple independently revocable Edges.
- Do not modify unrelated Planner/Outlook code or introduce advanced sheet mutations.

## Review Focus

1. Same actor/user IDs in different worlds cannot leak a sheet or execute an old request (Tasks 1, 4, 6).
2. Lost acknowledgements after a successful roll cannot cause another roll on retry/restart (Task 4).
3. Revocation or ownership loss while subscribed clears data and blocks queued actions (Tasks 3, 5).
4. Malicious descriptions, portrait URLs, and player names cannot execute scripts or expose session credentials (Tasks 5, 6).
5. Private default roll mode cannot accidentally produce a public chat message (Tasks 2, 4).

## Execution strategy and file ownership

Execution status (2026-09-19): local portions of Tasks 1-2 implemented and reviewed; 21 new tests pass. SSH now works and the module probe is staged without activation. The user requested a separate Xeneon Edge Test world; its creation/launch through authenticated setup is the next live checkpoint. Tasks 3-8 have not started. Detailed evidence: `docs/foundry/compatibility-14-5.3.3.md`.

Execute sequentially because transport contracts, adapter behavior, and the widget depend on each other. Tasks 1-4 build a small working connection before Tasks 5-7 expand it. Task 8 validates packaging and live operation. Do not claim a complete release without the live gates.

- `foundry-edge-connector/src/`: protocol, SQLite repository, device/admin HTTP API, module bridge, request coordinator, browser supervisor, asset proxy.
- `foundry-edge-module/scripts/`: Foundry lifecycle, actor authorization, D&D adapter, chat metadata, authenticated bridge.
- `foundry-edge-widget/widget/src/`: API client, state reducer, DOM rendering, controls, pairing/settings.
- Each project owns its package/lockfile, tests, and build scripts. The module build copies the connector's pure protocol module into its distribution; the widget bundles that same source. It must have no Node-only imports.
- `docs/FOUNDRY.md`: installation and operator guide.
- `docs/foundry/compatibility-14-5.3.3.md`: actual runtime evidence, versions, failures, and capability decisions.

At execution start inspect applicable AGENTS.md files and git/worktree state. Load using-git-worktrees before deciding whether isolation is needed. Commit only task-owned files when repository permissions permit; never stage unrelated changes.

## Shared contracts

Implement these in `foundry-edge-connector/src/protocol.js` and exercise them in all three projects:

```js
// World identity accompanies every read, event, and command.
// scope = { instanceId: string, worldId: string, generation: string }
// command = { requestId: string, scope, actorId: string, operation: string, input: object }
// operations:
// hp.adjust: { amount: integer } -- positive healing, negative damage
// hp.temp.set: { value: nonnegative integer } -- explicitly replace temp HP
// roll.ability / roll.save: { ability: string, mode: 'normal'|'advantage'|'disadvantage' }
// roll.skill: { skill: string, mode: 'normal'|'advantage'|'disadvantage' }
// result = { requestId, status: 'completed'|'rejected'|'unknown', snapshot?, error? }
// snapshot = { scope, revision, actorId, name, portraitRef, hp, ac, speed,
//              abilities, skills, resources, features, spells, inventory, capabilities }
// event = { type: 'world'|'snapshot'|'access-revoked'|'status', scope, ...payload }
// error = { code: string, message: string } -- no stack/secret disclosure
export function sameScope(a, b) {
  return !!a && !!b && ['instanceId','worldId','generation'].every(k => a[k] === b[k]);
}
```

The connector derives userId from a device's stored mapping and adds it to the authenticated module request. The public command schema rejects userId and extra fields. Generate a new generation on executor reconnect and invalidate old work. Use integer bounds of -100000 to 100000 for HP adjustment, 0 to 100000 for temp HP; validate ability/skill names against the active adapter's keys.

### Task 1: Protocol and minimal transport diagnostic

**Files:** Create connector `package.json`, `src/protocol.js`, `tests/protocol.test.mjs`; widget `package.json`, `widget/index.html`, `widget/manifest.json`, `widget/src/diagnostic.js`, `scripts/build.mjs`, `tests/build.test.mjs`; `docs/foundry/compatibility-14-5.3.3.md`.

**Interfaces:** Produce `sameScope(a,b)`, `validateCommand(raw)` (returns normalized command or throws coded error). Diagnostic consumes a configured HTTPS endpoint and reports connection status without displaying credentials.

- [ ] Write protocol tests, including:

```js
assert.equal(sameScope({instanceId:'i',worldId:'a',generation:'1'},
  {instanceId:'i',worldId:'b',generation:'1'}), false);
assert.throws(() => validateCommand({userId:'someone-else'}));
```

- [ ] Run `node --test foundry-edge-connector/tests/protocol.test.mjs`; confirm failure before implementation.
- [ ] Implement strict field validation, string lengths, finite integers, operation allowlist, and the contracts above. Build the diagnostic widget using Outlook's esbuild pattern and XML-compatible head tags; use a distinct widget ID. Add exact dependencies and lockfiles.
- [ ] Run the protocol suite and `npm --prefix foundry-edge-widget run build`; expect a valid widget distribution. Test import, actual Large/XL viewport sizes, HTTPS fetch and authenticated streaming on physical iCUE. Record observed origins/permission requirements. If streaming is unsupported, test authenticated polling as the fallback. Do not assume wildcard domains work; generate a package permission for the configured connector host if needed.
- [ ] Commit with `feat(foundry): define protocol and connection diagnostic`.

### Task 2: Foundry adapter and service browser probe

**Files:** Create module `module.json`, `package.json`, `scripts/main.js`, `scripts/authorization.js`, `scripts/dnd5e.js`, `scripts/chat.js`, `tests/adapter.test.mjs`, `scripts/build.mjs`; connector `src/browser.js`, `tests/browser.test.mjs`; update compatibility evidence.

**Interfaces:** `listCharacters(userId) -> summaries[]`, `readCharacter(userId, actorId, scope) -> snapshot`, `executeAction(userId, command) -> result`; `startBrowser(config) -> {stop()}`. All adapter operations recheck current ownership; the caller cannot bypass checks.

- [ ] Inspect the exact 5.3.3 source and Foundry 14 API for actor checks/saves/skills, HP damage absorption, chat speaker and roll mode. Record exact method signatures in the evidence document before calling them. Do not use remembered APIs from other system versions.
- [ ] Write adapter tests with injected game/actor APIs: owned `character` included; NPC, compendium actor, missing user, and unowned actor excluded. Assert that private configured mode rejects without invoking a roll:

```js
await assert.rejects(() => adapter.executeAction('player', skillCommand),
  {code:'unsupported-roll-mode'});
assert.equal(nativeRollCalls, 0);
```

- [ ] Run `node --test foundry-edge-module/tests/adapter.test.mjs` and confirm failure. Implement projection and the allowed actions using verified native APIs. Damage consumes temp HP according to D&D rules; healing respects maximum HP; setting temporary HP explicitly replaces it. Pass selected actor speaker context, preserve service author, and attach escaped player attribution and request metadata to the original message.
- [ ] Implement Playwright supervision with persisted private profile, credentials read from secret files, bounded restart delays, and no externally exposed debugging port. Wait for module readiness rather than page load. Test failed credentials do not create a tight login loop.
- [ ] Run adapter/browser tests. In an isolated test world verify service login, one skill roll, one HP update, default private-mode rejection, attribution, ordinary player coexistence, required role, and memory footprint. Record build numbers and outcomes. No live changes to campaign characters.
- [ ] Commit with `feat(foundry): add native character adapter and service session`.

**Checkpoint:** Remote iCUE access and native service actions must work before expanding the dashboard. If live access is unavailable, finish offline testable work but label compatibility unverified and keep dependent deployment claims pending.

### Task 3: Durable device pairing and administration

**Files:** Create connector `src/store.js`, `src/auth.js`, `src/admin.js`, `src/server.js`, `public/admin.html`, `public/admin.js`, `tests/auth.test.mjs`, `tests/admin.test.mjs`.

**Interfaces:** `createInvite({scope,userId},now) -> code`, `redeemInvite(code,now) -> {deviceId,token}`, `authenticateDevice(token) -> device`, `resolveUser(deviceId,scope) -> userId`, `revokeDevice(deviceId)`; `createServer(config) -> server`.

- [ ] Write SQLite-backed tests for single-use redemption under concurrent requests, expiry, revoked credentials, and distinct world mappings:

```js
const attempts = await Promise.allSettled([redeemInvite(code, now), redeemInvite(code, now)]);
assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
```

- [ ] Run `node --test foundry-edge-connector/tests/auth.test.mjs`; confirm failure.
- [ ] Implement transactional invitation redemption, 10-minute invitation expiry, 32-byte random device tokens stored as hashes, and durable world/user mappings. Use SQLite parameter binding. Rate-limit redemption to five failed attempts per minute per trusted client IP; trust proxy headers only from configured proxies.
- [ ] Add authenticated administration with secure HttpOnly SameSite cookies, CSRF protection on mutations, secret-file bootstrap credential, and invitation/device/mapping views. Expose `POST /v1/pair`, `GET /v1/world`, and admin-only invite/map/revoke endpoints. Never accept device-authenticated mapping changes.
- [ ] Test unauthorized admin calls, missing CSRF, secret redaction, revocation while subscribed, and invalid mapping edits. Run both new suites; expect all cases pass.
- [ ] Commit with `feat(foundry): add revocable device pairing and admin`.

### Task 4: Authenticated execution and durable request status

**Files:** Create connector `src/bridge.js`, `src/commands.js`, `tests/commands.test.mjs`; module `scripts/bridge.js`, `tests/bridge.test.mjs`; modify server and module main.

**Interfaces:** `dispatch(deviceId,command) -> result`, `getRequest(deviceId,requestId) -> result`; private `executeAction(userId,command)` bridge. Produce `POST /v1/commands` and `GET /v1/requests/:id`.

- [ ] Write tests for wrong world generation, payload reuse under the same request ID, two devices targeting one actor, and a disconnect after dispatch:

```js
await coordinator.dispatch(deviceId, command); // fake executor loses acknowledgement
await coordinator.dispatch(deviceId, command);
assert.equal(executorCalls, 1);
assert.equal((await coordinator.getRequest(deviceId, command.requestId)).status, 'unknown');
```

- [ ] Run `node --test foundry-edge-connector/tests/commands.test.mjs`; confirm failure.
- [ ] Implement a private authenticated module connection with credentials injected only into the supervised browser session, never public world settings. Accept one active executor and rotate generation when replaced. Derive user mapping server-side and revalidate actor ownership at execution.
- [ ] Persist accepted/dispatched/completed/rejected/unknown internal request states and a canonical payload digest. Persist dispatch intent before sending; after a crash treat unacknowledged dispatched work as unknown, never replay it. Serialize by instance/world/actor, cap queues, reject oversized bodies, and reject non-public roll modes before native calls.
- [ ] Test process restart against the same SQLite file, duplicate replies, unrelated device access to request status, queued ownership loss, and token revocation. Run connector and module suites; expect no unauthorized dispatch or duplicate roll.
- [ ] Commit with `feat(foundry): coordinate authenticated character actions`.

### Task 5: Authorized snapshots, world transitions, and assets

**Files:** Create connector `src/subscriptions.js`, `src/assets.js`, `tests/subscriptions.test.mjs`, `tests/assets.test.mjs`; module `scripts/updates.js`; modify bridge/server.

**Interfaces:** `GET /v1/characters`, `GET /v1/characters/:id`, `GET /v1/events`, `GET /v1/assets/:ref`; events use the shared contract. Resolve asset refs from authorized snapshots, never arbitrary client URLs.

- [ ] Write tests proving same actor IDs in two worlds remain isolated, stale executor replies are dropped, and ownership loss emits access-revoked before another snapshot. Test a mapped user loses access despite the service account retaining it.
- [ ] Run `node --test foundry-edge-connector/tests/subscriptions.test.mjs`; confirm failure.
- [ ] Listen for actor/item/effect/user changes and recompute relevant snapshots. Coalesce updates, attach revisions, clear access on world disconnect, and require fresh authorized reads after reconnect. Bound event buffers; slow clients resynchronize instead of accumulating an unlimited queue.
- [ ] Implement asset refs constrained to authorized actors and configured Foundry origin. Reject redirects to other origins/private services, traversal, non-image content, oversized responses, and executable SVG; use safe fallback portraits. Fetch with service credentials only inside the connector and never forward cookies upstream to widgets. Do not cache private assets publicly.
- [ ] Test URL tricks and image permission loss, including a device attempting another player's asset ref. Run subscription/asset suites and two-device live synchronization with a Foundry-side edit.
- [ ] Commit with `feat(foundry): stream scoped character updates`.

### Task 6: Large/XL read-only dashboard and pairing flow

**Files:** Create widget `widget/src/api.js`, `state.js`, `app.js`, `render.js`, `settings.js`, `widget/styles.css`, `tests/state.test.mjs`, `tests/browser.mjs`, `scripts/preview.mjs`; replace diagnostic entry point.

**Interfaces:** `reduce(state,event) -> state`; `connect({url,token,onEvent}) -> {close()}`; `render(root,state)`; use shared snapshot/capability types. Keep transport injectable for fixture previews.

- [ ] Write state tests for last selection per world, no mapping, no PCs, deleted character, stale revision, world transition, and permission revocation:

```js
const next = reduce(withSelectedCharacter, {type:'world',scope:newScope});
assert.equal(next.snapshot, null);
assert.equal(next.actionsEnabled, false);
```

- [ ] Run `node --test foundry-edge-widget/tests/state.test.mjs`; confirm failure.
- [ ] Build pairing/settings, forget-device, selector, persistent vitals and tabs. Render text with DOM textContent; render descriptions through a pinned sanitizer with a restrictive URL policy. Save credential only in verified iCUE storage, never URL/query/logs; store remembered selections under connector/instance/world keys. Display stale data only for same-world transient loss.
- [ ] Use measured Task 1 viewport dimensions to set Large/XL layouts, scroll areas, details panel, touch target sizes, and portrait fallback. Include long names, empty spell lists, and large inventories in fixture previews.
- [ ] Browser-test touch scrolling, malicious descriptions/names, world clearing, reconnect, pairing persistence, and no unauthorized actor flashes. Run state tests and `npm --prefix foundry-edge-widget run test:browser`.
- [ ] Commit with `feat(foundry): add responsive character dashboard`.

### Task 7: Conservative interactive controls

**Files:** Create widget `widget/src/actions.js`, `widget/src/dialogs.js`, `tests/actions.test.mjs`; extend browser tests and app/render.

**Interfaces:** `submitAction(api,scope,actorId,operation,input) -> result` creates one request ID per deliberate user action; status recovery reuses it. Display only capabilities supplied by the current authorized snapshot.

- [ ] Write tests for a double tap causing one submission, unknown-result recovery without replay, scope change while a dialog is open, invalid HP values, and unsupported actions remaining read-only.
- [ ] Run `node --test foundry-edge-widget/tests/actions.test.mjs`; confirm failure.
- [ ] Add damage/healing/temp-HP dialogs and normal/advantage/disadvantage roll choices. Clearly label temporary HP replacement. Disable pending controls, render confirmed results, and show unknown outcomes with refresh/status lookup rather than an automatic retry. Keep slots, resources, inventory, attacks, and spells read-only.
- [ ] Browser-test cancellation, touch keyboard inputs, server rejection, lost connection after submit, and stale dialog scope. Run widget suites plus connector command tests; verify no display assumes a mutation succeeded before confirmation.
- [ ] Commit with `feat(foundry): enable HP edits and character checks`.

### Task 8: Deployment, packaging, and release acceptance

**Files:** Create connector `Dockerfile`, `compose.yaml`, `.dockerignore`, `README.md`; module/widget READMEs; `scripts/build-foundry-release.ps1`; `docs/FOUNDRY.md`; update root README, `.gitignore`, and compatibility evidence.

**Interfaces:** Build produces separate widget/module archives and connector deployment files. Keep existing Microsoft release script unchanged. Deployment consumes explicit Foundry URL, service-user login secret files, admin secret, browser profile volume, and database volume.

- [ ] Add build checks for manifest IDs/versions, XML-compatible widget HTML, declared permissions, bundled licenses, module entry paths, and exclusion of cookies, browser profiles, databases and secret files. Extend .gitignore for local Foundry runtime state before using real credentials.
- [ ] Implement a repeatable build using project scripts, dependency lockfiles and pinned container/browser versions. Bind connector privately behind HTTPS; expose health without sensitive details and readiness separately. Document backups, revocation, password rotation, world mappings, profile reset, unknown commands, and upgrade recovery.
- [ ] Run each project's `npm test` and build scripts, then `scripts/build-foundry-release.ps1`. Verify the built archives rather than source paths. Run existing widget tests if any shared build input was changed.
- [ ] On a test world, execute the spec's full live matrix: two players/devices, PC filtering, ownership removal, world switch, HP/temp HP semantics, three roll types/modes, attribution, private mode rejection, restart recovery, duplicate delivery, protected assets and memory use. Record actual output and versions; do not replace missing evidence with fixture results.
- [ ] Import the packaged widget into real iCUE at Large and XL; verify remote transport, persistence after restart, touch usability, browser-closed operation, and safe revocation. Deployment needs the user's host access through a secure mechanism; do not request passwords in chat or silently alter the production reverse proxy.
- [ ] Update compatibility evidence and supported capabilities, run `git diff --check`, and inspect task-owned changes. Commit with `feat(foundry): package connector and document verified setup` only when the claimed checks have passed. Report any outstanding live checks explicitly.

## Self-review and handoff

Spec coverage: pairing/admin (3), character/world identity (1, 3, 5, 6), native adapter/chat (2, 4), request safety (4, 7), read-only views and allowed edits (6, 7), privacy/assets (2, 5, 6), deployment and hardware (1, 8). Future full-sheet controls remain capability extensions, not unfinished initial-release tasks.

The exact native API calls and iCUE dimensions are deliberately established by Task 1/2 evidence, not invented in this plan. If those checks require architectural changes, revise the design before proceeding with dependent implementation. Offline tests can proceed independently of access arrangements, but live compatibility remains a release requirement.

Recommended execution: native sequential implementation, with focused verification at each task and an independent whole-change review at the end. Await the user's plan review and execution-method selection before product implementation.
