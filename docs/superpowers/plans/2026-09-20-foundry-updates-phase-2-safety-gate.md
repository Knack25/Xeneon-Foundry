# Foundry Updates Phase 2 Safety Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy Foundry presence, renewable Edge activity leases, a five-minute quiet-period evaluator, and atomic maintenance admission without installing or enabling updates.

**Architecture:** The Foundry module reports the active-user set from its designated service session. The connector timestamps and validates those reports locally, tracks only explicit Edge activity, and gives a pure update-safety gate exclusive ownership of quiet-time and maintenance state. The command coordinator consults the same gate synchronously before persisting a new request, so maintenance acquisition and command admission cannot interleave in one Node process.

**Tech Stack:** Node.js 24 ESM, `node:test`, Foundry VTT module API, existing HTTP connector, SQLite request journal, browser-native JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-20-foundry-automatic-updates-design.md`

## Global Constraints

- Foundry 14.367 and D&D 5e 5.3.3 remain the supported runtime baseline.
- Installation requires five uninterrupted minutes with no active Foundry users other than the configured service account; active GMs count as users.
- Disconnected, stale, malformed, scope-mismatched, or never-observed presence is unknown, never empty.
- The connector polls presence every three seconds and treats a report older than fifteen seconds as stale.
- Open confirmations use renewable 45-second leases renewed every 15 seconds; expired leases stop blocking without user cleanup.
- Background character polling and an idle, powered-on device do not create activity leases.
- Accepted, dispatched, or unknown requests block maintenance; unknown requests are never replayed or silently reconciled.
- Maintenance admission must close before its final safety recheck, reject only new commands with a retry-later response, and keep idempotent reads of existing request results available.
- This phase adds no downloads, archive extraction, Docker access, child processes, file replacement, database backup, restart, recovery, release polling, or administrator update UI.
- `automaticInstall.enabled` remains hard-coded `false`.

## Review Focus

- A forged or partial presence payload, including extra properties and duplicate users, must become unknown rather than an apparently empty world; Task 2 tests every invalid class.
- A device must not renew or close another device's activity lease, and an expired lease must cease blocking; Task 3 tests ownership, expiry, and bounds.
- A new command racing maintenance acquisition must be either persisted before the gate evaluates or rejected before insertion, never admitted after the lock; Task 5 tests both orderings.
- A duplicate request during maintenance must remain readable/idempotent while a new request receives `maintenance`; Task 5 pins this distinction.
- Accepted/dispatched requests converted to unknown on process restart must continue blocking maintenance until later explicit reconciliation; Task 5 uses a reopened SQLite file.

---

### Task 1: Report authoritative active-user presence from Foundry

**Files:**
- Modify: `foundry-edge-module/scripts/main.js`
- Modify: `foundry-edge-module/tests/module.test.mjs`

**Interfaces:**
- Consumes: the existing designated service-account guard, immutable session scope, `game.users.contents`, and Foundry's `User.active` and `User.role` values.
- Produces: `module.api.readPresence(): {scope, serviceUserId, users: Array<{id, role}>}`.

- [ ] **Step 1: Write the failing module presence tests**

Extend the service-user fixture with active service, player, GM, and inactive users. Assert the API returns only active users, includes the service account explicitly, includes the GM, omits names and all other user fields, returns a fresh object on each call, and applies the existing guard:

```js
assert.deepEqual(module.api.readPresence(), {
  scope:{instanceId:'local-probe',worldId:'test-world',generation:'generation-1'},
  serviceUserId:'service',
  users:[
    {id:'service',role:2},
    {id:'player',role:1},
    {id:'gm',role:4}
  ]
});
game.user.id='player';
assert.throws(()=>module.api.readPresence(),{code:'service-access-denied'});
```

Also assert a second call reflects a changed `active` flag without changing `scope` or its generation.

- [ ] **Step 2: Run the module test and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-module/tests/module.test.mjs
```

Expected: FAIL because `readPresence` is not exposed.

- [ ] **Step 3: Implement the minimal presence report**

Add this guarded method to the frozen module API:

```js
readPresence(){
  guard();
  return {
    scope:{...scope},
    serviceUserId:game.user.id,
    users:game.users.contents
      .filter(user=>user.active===true)
      .map(user=>({id:user.id,role:user.role}))
  };
}
```

Do not infer activity from `lastSeen`, character ownership, browser polling, or role. Do not expose user names, passwords, permissions, or character data.

- [ ] **Step 4: Run the module suite and build**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-module/tests/*.test.mjs
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-module/scripts/build.mjs
```

Expected: all module tests pass and the portable build exits 0.

- [ ] **Step 5: Commit Foundry presence reporting**

```powershell
git add foundry-edge-module/scripts/main.js foundry-edge-module/tests/module.test.mjs
git commit -m "feat(updates): report active Foundry presence"
```

---

### Task 2: Validate and age connector-side presence

**Files:**
- Create: `foundry-edge-connector/src/presence.js`
- Create: `foundry-edge-connector/tests/presence.test.mjs`
- Modify: `foundry-edge-connector/src/browser.js`
- Modify: `foundry-edge-connector/src/runtime-session.js`
- Modify: `foundry-edge-connector/tests/browser.test.mjs`

**Interfaces:**
- Consumes: `module.api.readPresence()`, the current browser session scope, and a connector-local receive time.
- Produces: `PresenceMonitor.record(report, scope, receivedAt)`, `clear()`, and `snapshot(now)` returning either a frozen known snapshot or `{state:'unknown',reason}`; its constructor accepts `now` for clock validation in tests.

- [ ] **Step 1: Write failing validation and freshness tests**

Create a monitor with an injected clock and assert the complete lifecycle:

```js
let currentTime=1000;
const monitor=new PresenceMonitor({maxAgeMs:15000,now:()=>currentTime});
assert.deepEqual(monitor.snapshot(1000),{state:'unknown',reason:'not-observed'});
monitor.record({scope,serviceUserId:'service',users:[{id:'service',role:2}]},scope,1000);
assert.deepEqual(monitor.snapshot(15999),{
  state:'known',scope,serviceUserId:'service',users:[{id:'service',role:2}],receivedAt:1000
});
assert.deepEqual(monitor.snapshot(16001),{state:'unknown',reason:'stale'});
monitor.clear();
assert.deepEqual(monitor.snapshot(16001),{state:'unknown',reason:'disconnected'});
```

Table-test rejection of `null`, arrays, missing and extra keys, mismatched scope, service user absent from users, duplicate IDs, invalid IDs, non-integer/out-of-range roles, more than 100 users, future receive times, and a received time older than the current stored report. A rejected report must clear the last trusted value before throwing `code:'invalid-presence'`.

- [ ] **Step 2: Run the presence test and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/presence.test.mjs
```

Expected: FAIL because `presence.js` does not exist.

- [ ] **Step 3: Implement strict local presence state**

Implement exact-key validation, the existing identifier grammar, scope equality via `sameScope`, role bounds `1..4`, defensive copies, recursive freezing, and age comparison with subtraction rather than timers. `record()` must receive its timestamp from the connector; do not accept a timestamp from Foundry or the browser payload.

Use these public result shapes exactly:

```js
{state:'unknown',reason:'not-observed'|'disconnected'|'invalid'|'stale'}
{state:'known',scope,serviceUserId,users,receivedAt}
```

- [ ] **Step 4: Run the presence test and verify GREEN**

Run the command from Step 2. Expected: all presence tests pass.

- [ ] **Step 5: Write failing browser heartbeat tests**

Extend `browser.test.mjs` and add focused `startBrowser` tests with a fake session. Require initial connection and every successful three-second heartbeat to call `readPresence`; require navigation, crash, ping/presence failure, and explicit stop to call `monitor.clear()` immediately. Assert `BrowserBridge.readPresence()` uses the same stale-session protection as character reads.

- [ ] **Step 6: Run browser tests and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/browser.test.mjs foundry-edge-connector/tests/presence.test.mjs
```

Expected: FAIL because the runtime does not request or record presence.

- [ ] **Step 7: Integrate presence into the service heartbeat**

Allow only `readPresence` in the existing `openSession().call()` method list and return `api.readPresence()` through the same identity/generation checks. Add `BrowserBridge.readPresence()` as `return this.call('readPresence',[])`.

Change `startBrowser` to accept a `presence` monitor. On attach and each heartbeat, call `session.call('readPresence',[])`, then synchronously call `presence.record(report, session.scope, Date.now())`. Every path that disconnects the bridge must also call `presence.clear()`; presence failures take the existing offline/reconnect path.

- [ ] **Step 8: Run connector browser and presence tests**

Run the command from Step 6. Expected: all selected tests pass without real-time sleeps.

- [ ] **Step 9: Commit connector presence freshness**

```powershell
git add foundry-edge-connector/src/presence.js foundry-edge-connector/src/browser.js foundry-edge-connector/src/runtime-session.js foundry-edge-connector/tests/presence.test.mjs foundry-edge-connector/tests/browser.test.mjs
git commit -m "feat(updates): track fresh Foundry presence"
```

---

### Task 3: Track explicit Edge activity with owned renewable leases

**Files:**
- Create: `foundry-edge-connector/src/activity.js`
- Create: `foundry-edge-connector/tests/activity.test.mjs`
- Modify: `foundry-edge-connector/src/server.js`
- Modify: `foundry-edge-connector/tests/server.test.mjs`
- Modify: `foundry-edge-widget/widget/src/app.js`
- Modify: `foundry-edge-widget/tests/weapons-browser.mjs`

**Interfaces:**
- Consumes: authenticated device IDs, the current world scope, explicit confirmation open/renew/close events, and connector-local time.
- Produces: `ActivityLeases.open(owner, raw, currentScope, now)`, `renew(owner, raw, currentScope, now)`, `close(owner, leaseId)`, `active(now)`, and authenticated `/v1/activity-leases` routes.

- [ ] **Step 1: Write failing activity lease tests**

Use injected integer times and assert:

```js
const leases=new ActivityLeases({maximumLeaseMs:45000});
leases.open('device-a',{leaseId:'lease-1',kind:'confirmation',scope,ttlMs:45000},scope,1000);
assert.deepEqual(leases.active(45999),[{leaseId:'lease-1',kind:'confirmation',scope,expiresAt:46000}]);
assert.deepEqual(leases.active(46000),[]);
```

Test exact fields, allowed kind (`confirmation` only for HTTP callers), identifier grammar, exact current scope, TTL range `5000..45000`, duplicate-open conflict, renew-before-expiry, inability to resurrect an expired lease, owner isolation, idempotent owner close, and a maximum of four active confirmation leases per device. Returned values must not expose owner IDs.

- [ ] **Step 2: Run the activity test and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/activity.test.mjs
```

Expected: FAIL because `activity.js` does not exist.

- [ ] **Step 3: Implement the in-memory lease registry**

Implement leases in a private `Map` keyed by `owner + '\0' + leaseId`. Purge expired entries at the start of every operation. Validate with connector-local time only and return sorted, frozen public snapshots. Do not persist leases: process loss makes updater state unknown through presence and host-journal recovery, while stale dialog leases must not survive a restart.

- [ ] **Step 4: Run activity tests and verify GREEN**

Run the command from Step 2. Expected: all activity tests pass.

- [ ] **Step 5: Write failing authenticated route tests**

Add server tests for:

```text
POST   /v1/activity-leases  -> 201 open
PUT    /v1/activity-leases  -> 200 renew
DELETE /v1/activity-leases  -> 204 close
```

Require device bearer authentication, JSON bodies no larger than the existing API limit, and the bridge's current scope. Assert a second device cannot renew or close the first lease, malformed input returns the existing safe error envelope, and no unauthenticated activity-list endpoint exists.

- [ ] **Step 6: Run server/activity tests and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/activity.test.mjs foundry-edge-connector/tests/server.test.mjs
```

Expected: FAIL because the HTTP routes are absent.

- [ ] **Step 7: Add the allowlisted activity routes**

Inject `activity` into `createServer()`. Route only the three exact method/path pairs above after device authentication. Supply `device.deviceId`, the parsed body, `bridge.scope`, and `Date.now()` to the registry; never accept owner, absolute expiry, or server time from the client.

- [ ] **Step 8: Write the failing dashboard lease regression**

Extend `weapons-browser.mjs` so opening the existing action dialog observes one POST, advancing/triggering renewal observes PUT, cancel observes DELETE, and confirming closes the lease before or alongside `/v1/commands`. Assert character/world polling creates no activity-lease requests.

- [ ] **Step 9: Implement confirmation lease lifecycle in the dashboard**

Before `showModal()`, create a UUID lease and successfully POST `{leaseId,kind:'confirmation',scope,ttlMs:45000}`. Renew every 15 seconds while that exact dialog remains open. Cancel, selection/world changes, successful submission, and page teardown must best-effort DELETE and clear the interval. If open or renewal fails, close the dialog and show a reconnect/retry message rather than presenting an untracked confirmation.

- [ ] **Step 10: Run activity, server, and dashboard browser tests**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/activity.test.mjs foundry-edge-connector/tests/server.test.mjs
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-widget/tests/weapons-browser.mjs
```

Expected: all selected tests pass; background polling creates zero leases.

- [ ] **Step 11: Commit explicit Edge activity leases**

```powershell
git add foundry-edge-connector/src/activity.js foundry-edge-connector/src/server.js foundry-edge-connector/tests/activity.test.mjs foundry-edge-connector/tests/server.test.mjs foundry-edge-widget/widget/src/app.js foundry-edge-widget/tests/weapons-browser.mjs
git commit -m "feat(updates): track explicit Edge activity"
```

---

### Task 4: Evaluate quiet time and own atomic maintenance state

**Files:**
- Create: `foundry-edge-updater/src/safety-gate.js`
- Create: `foundry-edge-updater/tests/safety-gate.test.mjs`

**Interfaces:**
- Consumes: `presence.snapshot(now)`, `activity.active(now)`, `unresolvedRequests(): number`, injected time, and injected maintenance-token generation.
- Produces: `UpdateSafetyGate.status(now)`, `acquireMaintenance(now)`, `recheckMaintenance(token, now)`, `commitMaintenance(token)`, `releaseMaintenance(token)`, and `assertActionAdmission()`.

- [ ] **Step 1: Write failing quiet-period policy tests**

Pin the public status shape and fixed blocker order:

```js
assert.deepEqual(gate.status(1000),{
  phase:'open',eligible:false,quietSince:null,eligibleAt:null,
  blockers:['presence-unknown']
});
presence.value=serviceOnly;
assert.deepEqual(gate.status(1000).blockers,['quiet-period']);
assert.equal(gate.status(300999).eligible,false);
assert.equal(gate.status(301000).eligible,true);
```

Table-test `presence-unknown`, `users-connected`, `edge-activity`, `unresolved-requests`, and `quiet-period` in that order, including simultaneous blockers. Cover a connected player, connected GM, only the configured service user, disconnect, stale presence, scope/generation change, a lease that expires, accepted/dispatched/unknown request counts, and clock rollback. Every blocker or scope change resets `quietSince`; ordinary status polling does not.

- [ ] **Step 2: Run the safety-gate test and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/safety-gate.test.mjs
```

Expected: FAIL because `safety-gate.js` does not exist.

- [ ] **Step 3: Implement deterministic policy evaluation**

Implement a single state owner with phases `open`, `maintenance`, and `committed`. Preserve the last evaluated scope and local time; a backward clock movement resets quiet time. `status()` returns defensive frozen data and never changes command admission by itself.

`acquireMaintenance(now)` must synchronously evaluate all blockers and either throw `code:'update-not-safe'` with the public blocker list or set `phase:'maintenance'` and return an opaque token. Only the holder may recheck, commit, or release. `assertActionAdmission()` throws `code:'maintenance'` with `message:'Maintenance is starting. Retry shortly.'` in both closed phases.

- [ ] **Step 4: Write failing maintenance transition tests**

After five quiet minutes, assert acquisition closes admission immediately. Then test a player joining, presence going stale, a lease opening, or an unresolved request appearing before commit: each makes `recheckMaintenance()` return `{safe:false,blockers:[...]}`. Test token isolation, double acquire, release back to open with a reset quiet timer, and commit remaining closed. There is intentionally no method to reopen a committed gate in Phase 2; host recovery owns that future transition.

- [ ] **Step 5: Run the safety-gate test and verify GREEN**

Run the command from Step 2. Expected: all policy and state tests pass.

- [ ] **Step 6: Commit the update safety gate**

```powershell
git add foundry-edge-updater/src/safety-gate.js foundry-edge-updater/tests/safety-gate.test.mjs
git commit -m "feat(updates): enforce quiet maintenance gate"
```

---

### Task 5: Integrate command admission and unresolved-work blocking

**Files:**
- Modify: `foundry-edge-connector/src/store.js`
- Modify: `foundry-edge-connector/src/commands.js`
- Modify: `foundry-edge-connector/src/start.js`
- Modify: `foundry-edge-connector/src/preview.js`
- Modify: `foundry-edge-connector/tests/commands.test.mjs`
- Modify: `foundry-edge-connector/tests/application.test.mjs`
- Modify: `foundry-edge-connector/Dockerfile`
- Modify: `foundry-edge-connector/Dockerfile.dockerignore`
- Modify: `foundry-edge-connector/tests/docker-context.test.mjs`

**Interfaces:**
- Consumes: `UpdateSafetyGate`, `PresenceMonitor`, `ActivityLeases`, and the durable request table.
- Produces: `Store.countUnresolvedRequests()`, maintenance-aware `Coordinator`, and one wired gate instance shared by the runtime heartbeat and command API.

- [ ] **Step 1: Write failing durable blocker tests**

Add `Store.countUnresolvedRequests()` tests for zero and each status. Reopen a file containing `accepted` and `dispatched` rows, construct a coordinator so they become `unknown`, and assert the count remains nonzero. Completed and rejected rows must not count.

- [ ] **Step 2: Write failing command admission/race tests**

Inject a real gate into the coordinator fixture. Assert:

```js
const token=gate.acquireMaintenance(301000);
await assert.rejects(
  ()=>coordinator.dispatch(device.deviceId,{...command,requestId:'new'}),
  {code:'maintenance'}
);
assert.equal(store.db.prepare("SELECT count(*) AS n FROM requests WHERE id='new'").get().n,0);
assert.equal((await coordinator.dispatch(device.deviceId,command)).status,'completed');
```

The last assertion uses a request completed before maintenance and proves idempotent duplicate delivery remains readable. For the race ordering, synchronously start a new dispatch first and show maintenance acquisition sees the inserted accepted row and fails; acquire first and show the new dispatch never inserts. Also prove a command becoming `unknown` continues to block after `pending` returns to zero.

- [ ] **Step 3: Run store/command tests and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/commands.test.mjs
```

Expected: FAIL because unresolved counts and gate admission are not integrated.

- [ ] **Step 4: Implement durable request counting and admission**

Add:

```js
countUnresolvedRequests(){
  return this.db.prepare(
    "SELECT count(*) AS count FROM requests WHERE status IN ('accepted','dispatched','unknown')"
  ).get().count;
}
```

Inject `gate` into `Coordinator`. Keep device authentication and digest lookup first so an existing identical request can be returned. For a genuinely new request, call `gate.assertActionAdmission()` immediately before authorization/revision checks and the synchronous SQLite insert. Do not catch or rewrite `maintenance` as `access-changed`.

- [ ] **Step 5: Run command tests and verify GREEN**

Run the command from Step 3. Expected: all command tests pass.

- [ ] **Step 6: Wire one safety graph in production and preview startup**

Construct one `PresenceMonitor`, one `ActivityLeases`, and one `UpdateSafetyGate` in each startup path. Pass the presence monitor to `startBrowser`, the activity registry to `createServer`, and the gate to `Coordinator`. Supply `unresolvedRequests:()=>store.countUnresolvedRequests()` to the gate. The preview uses the same policy objects but must still report `automaticInstall.enabled:false`.

Update the container copy list and Docker-context allowlist for `foundry-edge-updater/src/safety-gate.js`; do not copy or mount secrets, a Docker socket, or host paths.

- [ ] **Step 7: Add application lifecycle assertions**

Extend application/startup tests to assert disconnected startup is `presence-unknown`, connector readiness remains based on the existing world bridge, and no public endpoint enables installation or exposes lease owners. Verify `/health` and `/ready` retain their Phase 1 release identity.

- [ ] **Step 8: Run connector/updater suites and Docker-context test**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/*.test.mjs foundry-edge-updater/tests/*.test.mjs
```

Expected: all selected tests pass, including every Docker `COPY` source being present in the context allowlist.

- [ ] **Step 9: Commit integrated maintenance admission**

```powershell
git add foundry-edge-connector/src/store.js foundry-edge-connector/src/commands.js foundry-edge-connector/src/start.js foundry-edge-connector/src/preview.js foundry-edge-connector/tests/commands.test.mjs foundry-edge-connector/tests/application.test.mjs foundry-edge-connector/Dockerfile foundry-edge-connector/Dockerfile.dockerignore foundry-edge-connector/tests/docker-context.test.mjs
git commit -m "feat(updates): close action admission for maintenance"
```

---

### Task 6: Document and verify the disabled Phase 2 foundation

**Files:**
- Modify: `foundry-edge-updater/README.md`
- Modify: `foundry-edge-connector/README.md`
- Modify: `foundry-edge-module/README.md`
- Modify: `foundry-edge-widget/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the complete Phase 2 safety graph and existing CI test/build commands.
- Produces: accurate operator/developer documentation and final scope evidence.

- [ ] **Step 1: Document exact safety behavior and exclusions**

Document the three-second presence heartbeat, fifteen-second freshness window, service-account exclusion, five-minute uninterrupted quiet period, 45/15-second confirmation lease timing, durable unresolved-request blocker, and maintenance retry-later response. State clearly that the gate is not an updater service and cannot install anything.

Keep the existing list of unimplemented capabilities: release polling/configuration, production signing key, staging, Docker/module replacement, backup/recovery, update UI, test-channel deployment, and native Edge package updating. Preserve `automaticInstall.enabled:false` in examples.

- [ ] **Step 2: Run the complete unit and browser suites**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-module/tests/*.test.mjs foundry-edge-connector/tests/*.test.mjs foundry-edge-widget/tests/*.test.mjs foundry-edge-updater/tests/*.test.mjs
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-widget/tests/weapons-browser.mjs
```

Expected: every test passes with zero failures.

- [ ] **Step 3: Run builds and portable packaging**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-module/scripts/build.mjs
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-widget/scripts/build.mjs https://connector.example.test/edge
& 'C:/Program Files/Python312/python.exe' scripts/package-foundry-probe.py foundry-edge-module/dist dist/foundry-edge-module.zip
docker build -f foundry-edge-connector/Dockerfile -t foundry-edge:phase-2-verify .
```

Expected: each available command exits 0. If the local Docker daemon is unavailable, record that exact limitation and rely on the existing CI Docker build plus the Docker-context regression; do not describe the image as locally verified.

- [ ] **Step 4: Audit that installation remains impossible**

```powershell
rg -n "automaticInstall|node:child_process|execFile|spawn|docker.sock|Dockerode|extract|rename\(|copyFile\(|release-source-not-configured" foundry-edge-updater foundry-edge-connector/src foundry-edge-connector/compose.yaml
```

Expected: the public release identity still hard-disables automatic installation; no child process, Docker control, archive extraction, module replacement, release polling, or backup/recovery code exists. Any `rename` result must be the existing device-label feature, not filesystem mutation.

- [ ] **Step 5: Commit Phase 2 documentation**

```powershell
git add README.md foundry-edge-updater/README.md foundry-edge-connector/README.md foundry-edge-module/README.md foundry-edge-widget/README.md
git commit -m "docs(updates): explain maintenance safety gate"
```

- [ ] **Step 6: Re-read the design and record the next boundary**

Confirm implementation-sequence item 2 is covered by Tasks 1-6. Confirm sequence item 3 remains wholly absent: no host service, staging, install journal, backup, replacement, readiness rollback, or crash recovery. Do not deploy Phase 2 or enable stable/test automatic updates as part of this plan.
