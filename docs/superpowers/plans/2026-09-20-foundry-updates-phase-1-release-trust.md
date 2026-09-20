# Coordinated Updates Phase 1: Release Identity and Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a deterministic, testable trust boundary for coordinated Foundry Edge releases without enabling automatic installation.

**Architecture:** Add a dependency-free Node 24 host-updater package containing strict manifest parsing, detached Ed25519 verification, bounded release-source retrieval, and compatibility evaluation. Keep current component identity in one checked-in JSON document, expose only non-sensitive identity through the connector and Foundry module, and leave installation disabled until a real signed source and trusted production key are configured and the later update phases pass.

**Tech Stack:** Node.js 24 ESM, built-in `node:crypto`, built-in `fetch`, `node:test`, Foundry VTT module metadata, Docker.

**Spec:** `docs/superpowers/specs/2026-09-20-foundry-automatic-updates-design.md`

## Global Constraints

- Automatic installation policy remains: install only after five uninterrupted minutes with no connected Foundry users except the configured service account; connected GMs count, and stale/disconnected presence is unknown.
- Edge commands, confirmation leases, pending native actions, and unresolved dispatched work block installation; uncertain requests are never replayed.
- The public connector never receives the Docker socket, arbitrary shell execution, user-provided executable paths, image names, commands, or download URLs.
- Release manifests and assets are accepted only from configured HTTPS origins and must be verified against a bundled release-signing public key; private signing material never enters the repository or VPS runtime.
- Foundry core, D&D 5e, iCUE, and unrelated Microsoft widgets remain outside this updater.
- The currently verified runtime is Foundry `14.367`, D&D 5e `5.3.3`, protocol `1`, and connector data schema `1`.
- Stable automatic installation stays disabled until a signed stable source and signing identity are configured and upgrade, failed-readiness, and recovery integration checks pass.
- No release is considered deployed from unit tests alone; live destructive/recovery checks remain limited to the authorized disposable test deployment.

## Review Focus

- Malformed JSON, unexpected fields, dangerous property names, duplicate semantic data, or non-integer ranges must produce a deterministic validation error and never a partially accepted manifest (Task 2).
- A stable manifest containing prerelease versions or any unintended component downgrade must be rejected (Tasks 2 and 4).
- Protocol or data-schema ranges with no overlap, reversed bounds, or unsafe integers must be incompatible rather than coerced (Tasks 2 and 4).
- Oversized bodies, redirect hops to an untrusted origin, credentials in URLs, unknown signing keys, and invalid signatures must fail before manifest data is used (Task 3).
- Package/module/widget versions drifting from the checked-in component identity must fail CI, so public version reporting cannot silently lie (Tasks 1 and 6).

## Plan Boundary

This plan implements only sequence item 1 from the spec: release manifest/signature validation, deterministic compatibility checks, and version reporting. Follow-on plans, in order, are:

1. Fresh Foundry presence, Edge activity leases, the five-minute quiet timer, and atomic command admission.
2. Host staging/install journal, consistent backup, atomic module replacement, connector recreation, crash recovery, rollback, and quarantine.
3. Admin update status/pause/history and dashboard settle-then-reload behavior.
4. Test-channel release publication and disposable VPS upgrade/failure/recovery exercises.
5. Physical Edge launcher and native-package validation when hardware is available.

Automatic installation must remain unavailable after this plan is complete.

---

### Task 1: Create the shared component identity contract

**Files:**
- Create: `release/component-versions.json`
- Create: `foundry-edge-updater/package.json`
- Create: `foundry-edge-updater/src/errors.js`
- Create: `foundry-edge-updater/src/identity.js`
- Create: `foundry-edge-updater/tests/identity.test.mjs`
- Modify: `foundry-edge-connector/src/protocol.js:1-4`

**Interfaces:**
- Consumes: existing package versions from the connector, module, widget package, Foundry module manifest, and Edge widget manifest.
- Produces: `parseComponentIdentity(value) -> Readonly<ComponentIdentity>`, `loadComponentIdentity(filename) -> Promise<Readonly<ComponentIdentity>>`, `updateFailure(code, message) -> Error`, and shared `PROTOCOL_RANGE` / `DATA_SCHEMA_VERSION` constants.

- [ ] **Step 1: Write the failing identity consistency test**

```js
// foundry-edge-updater/tests/identity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadComponentIdentity, parseComponentIdentity} from '../src/identity.js';

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('checked-in component identity matches every shipped component', async () => {
  const identity = await loadComponentIdentity(new URL('../../release/component-versions.json', import.meta.url));
  const connector = await json('../../foundry-edge-connector/package.json');
  const modulePackage = await json('../../foundry-edge-module/package.json');
  const moduleManifest = await json('../../foundry-edge-module/module.json');
  const widgetPackage = await json('../../foundry-edge-widget/package.json');
  const widgetManifest = await json('../../foundry-edge-widget/widget/manifest.json');

  assert.equal(identity.components.connector, connector.version);
  assert.equal(identity.components.module, modulePackage.version);
  assert.equal(identity.components.module, moduleManifest.version);
  assert.equal(identity.components.dashboard, widgetPackage.version);
  assert.equal(identity.components.edgePackage, widgetManifest.version);
  assert.deepEqual(identity.protocol, {minimum:1, maximum:1});
  assert.equal(identity.dataSchema, 1);
  assert.deepEqual(identity.foundry, {minimum:'14.367', maximum:'14.367'});
  assert.deepEqual(identity.system, {id:'dnd5e', minimum:'5.3.3', maximum:'5.3.3'});
});

test('component identity rejects missing, extra, and mistyped fields', async () => {
  for (const value of [
    {},
    {components:{}},
    {components:{connector:'0.1.0',module:'0.1.0',dashboard:'0.1.0',edgePackage:'0.1.0'},protocol:{minimum:1,maximum:1},dataSchema:'1',foundry:{minimum:'14.367',maximum:'14.367'},system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'}},
    {components:{connector:'0.1.0',module:'0.1.0',dashboard:'0.1.0',edgePackage:'0.1.0'},protocol:{minimum:1,maximum:1},dataSchema:1,foundry:{minimum:'14.367',maximum:'14.367'},system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'},extra:true}
  ]) assert.throws(() => parseComponentIdentity(value), {code:'invalid-component-identity'});
});
```

- [ ] **Step 2: Run the identity test and verify RED**

Run:

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/identity.test.mjs
```

Expected: FAIL because `foundry-edge-updater/src/identity.js` and `release/component-versions.json` do not exist.

- [ ] **Step 3: Add the updater package and exact identity document**

Create `foundry-edge-updater/package.json` with Node `>=24.0.0`, ESM, no runtime dependencies, and `"test": "node --test tests/*.test.mjs"`.

Create `release/component-versions.json` with exactly:

```json
{
  "components": {
    "connector": "0.1.0",
    "module": "0.1.0",
    "dashboard": "0.1.0",
    "edgePackage": "0.1.0"
  },
  "protocol": {"minimum": 1, "maximum": 1},
  "dataSchema": 1,
  "foundry": {"minimum": "14.367", "maximum": "14.367"},
  "system": {"id": "dnd5e", "minimum": "5.3.3", "maximum": "5.3.3"}
}
```

Create `errors.js` with `updateFailure(code, message)`, which returns `Object.assign(new Error(message), {code})`. Implement synchronous `parseComponentIdentity(value)` for already parsed data and async `loadComponentIdentity(filename)` for a URL/path. Exact keys are required at every level, component versions are strict `major.minor.patch`, integer ranges are safe and ordered, supported runtime versions are non-empty dotted numeric strings, and the returned copy is recursively frozen. Every failure receives `code = 'invalid-component-identity'` without leaking file contents.

Export these browser-safe constants from `foundry-edge-connector/src/protocol.js`:

```js
export const PROTOCOL_VERSION = 1;
export const PROTOCOL_RANGE = Object.freeze({minimum:1, maximum:1});
export const DATA_SCHEMA_VERSION = 1;
```

- [ ] **Step 4: Run the identity test and verify GREEN**

Run the command from Step 2. Expected: 2 tests pass, 0 fail.

- [ ] **Step 5: Commit the identity contract**

```powershell
git add release/component-versions.json foundry-edge-updater/package.json foundry-edge-updater/src/errors.js foundry-edge-updater/src/identity.js foundry-edge-updater/tests/identity.test.mjs foundry-edge-connector/src/protocol.js
git commit -m "feat(updates): define shared component identity"
```

---

### Task 2: Parse a strict release manifest

**Files:**
- Create: `foundry-edge-updater/src/manifest.js`
- Create: `foundry-edge-updater/tests/manifest.test.mjs`

**Interfaces:**
- Consumes: raw UTF-8 manifest bytes and configured allowed asset origins.
- Produces: `parseReleaseManifest(bytes, {allowedAssetOrigins, maxBytes = 131072}) -> Readonly<ReleaseManifest>` and `updateFailure(code, message) -> Error`.

- [ ] **Step 1: Write failing happy-path and strict-schema tests**

Use this complete valid manifest fixture in the test file:

```js
const valid = {
  schemaVersion:1,
  releaseId:'2026.09.20-test.1',
  channel:'test',
  publishedAt:'2026-09-20T18:00:00.000Z',
  notes:'First signed updater compatibility fixture.',
  components:{
    connector:{version:'0.2.0',image:'ghcr.io/knack25/xeneon-foundry/connector@sha256:'+'a'.repeat(64)},
    dashboard:{version:'0.2.0',bundledIn:'connector'},
    module:{version:'0.2.0',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge-module.zip',sha256:'b'.repeat(64),size:1048576},
    edgePackage:{version:'0.1.0',installation:'manual',url:'https://github.com/Knack25/Xeneon-Foundry/releases/download/v0.2.0/foundry-edge.icuewidget',sha256:'c'.repeat(64),size:2097152}
  },
  compatibility:{
    foundry:{minimum:'14.367',maximum:'14.367'},
    system:{id:'dnd5e',minimum:'5.3.3',maximum:'5.3.3'},
    protocol:{minimum:1,maximum:1},
    dataSchema:{minimum:1,maximum:1}
  }
};
```

Assert that parsing UTF-8 bytes returns a detached, recursively frozen copy. Table-test these failures with `{code:'invalid-release-manifest'}`:

- invalid UTF-8/JSON, arrays, `null`, missing keys, extra keys, and recursive keys named `__proto__`, `prototype`, or `constructor`;
- `schemaVersion !== 1`, channel outside `stable|test`, invalid release IDs/timestamps, and notes over 16 KiB;
- versions that are not strict SemVer 2.0; any prerelease or build suffix when `channel === 'stable'`; build suffixes on `test`; and malformed test-channel prerelease identifiers;
- non-HTTPS URLs, credentials/query/fragment in asset URLs, and origins absent from `allowedAssetOrigins`;
- image references that are not `name@sha256:<64 lowercase hex>`;
- uppercase/wrong-length digests, zero/fractional asset sizes, module size above 64 MiB, and Edge package size above 256 MiB;
- missing dashboard `bundledIn:'connector'`, Edge installation other than `manual`, reversed/unsafe ranges, or a system id other than `dnd5e`.

Also assert a byte body over 128 KiB fails with `{code:'release-manifest-too-large'}` before `JSON.parse` is called.

- [ ] **Step 2: Run the manifest tests and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/manifest.test.mjs
```

Expected: FAIL because `manifest.js` does not exist.

- [ ] **Step 3: Implement exact-key validation and normalization**

Keep `errors.js` limited to this public constructor created in Task 1:

```js
export function updateFailure(code, message) {
  return Object.assign(new Error(message), {code});
}
```

In `manifest.js`, keep validators private. Decode with `new TextDecoder('utf-8', {fatal:true})`, validate body length before decoding, parse once, reject dangerous names recursively before copying, require exact key sets, and construct a new normalized object rather than returning parsed input. Use `URL` only after the string/length checks; asset URLs must be HTTPS, credential-free, query-free, fragment-free, and in the caller's frozen set of allowed origins. Freeze all nested output.

Do not fetch assets, trust a key, compare installed versions, or add installation behavior in this module.

- [ ] **Step 4: Run the manifest tests and verify GREEN**

Run the command from Step 2. Expected: all manifest tests pass with no warnings.

- [ ] **Step 5: Commit strict manifest parsing**

```powershell
git add foundry-edge-updater/src/manifest.js foundry-edge-updater/tests/manifest.test.mjs
git commit -m "feat(updates): validate signed release manifests"
```

---

### Task 3: Verify detached signatures and bounded trusted-source retrieval

**Files:**
- Create: `foundry-edge-updater/src/signature.js`
- Create: `foundry-edge-updater/src/source.js`
- Create: `foundry-edge-updater/tests/signature.test.mjs`
- Create: `foundry-edge-updater/tests/source.test.mjs`

**Interfaces:**
- Consumes: exact manifest bytes; a detached signature envelope; a configured `Map<keyId, publicKey>`; one configured manifest URL; a configured set of allowed source/asset origins.
- Produces: `verifyDetachedSignature({manifestBytes, signatureBytes, trustedKeys}) -> void`, `fetchBounded(url, options) -> Uint8Array`, and `loadVerifiedRelease(options) -> Readonly<ReleaseManifest>`.

- [ ] **Step 1: Write the failing signature tests**

Generate an Ed25519 key pair inside the test with `generateKeyPairSync('ed25519')`; do not commit a private-key fixture. Sign the exact manifest bytes and use this envelope shape:

```json
{"algorithm":"Ed25519","keyId":"test-2026-09","signature":"<base64>"}
```

Test valid verification, one changed manifest byte, malformed base64, extra envelope fields, wrong algorithm, unknown key id, a non-Ed25519 trusted key, and an envelope above 4 KiB. Every trust failure must use `code:'untrusted-release'`; malformed/oversized envelopes use `invalid-release-signature` / `release-signature-too-large`.

- [ ] **Step 2: Run the signature tests and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/signature.test.mjs
```

Expected: FAIL because `signature.js` does not exist.

- [ ] **Step 3: Implement detached Ed25519 verification**

Parse the envelope with the same fatal UTF-8 and dangerous-key protections as Task 2. Import configured public keys with `createPublicKey`, require `asymmetricKeyType === 'ed25519'`, decode canonical base64 by round-tripping the encoded value, and call `verify(null, manifestBytes, key, signature)`. Never log or include manifest bytes, signature bytes, or key material in errors.

- [ ] **Step 4: Run the signature tests and verify GREEN**

Run the command from Step 2. Expected: all signature tests pass.

- [ ] **Step 5: Write failing source and redirect tests**

Use an injected `fetchImpl` that returns `Response` objects and records calls. Assert that `loadVerifiedRelease`:

- accepts only a configured HTTPS manifest URL with no credentials/query/fragment;
- derives the signature URL by appending `.sig` and accepts no manifest-provided signature URL;
- requests with `redirect:'manual'`, follows at most three redirects, and checks every resolved `Location` origin before the next request;
- permits only `200`, rejects invalid/oversized `Content-Length`, accepts an absent length only with streaming enforcement, and rejects a body that exceeds the limit regardless of the header;
- fetches at most 128 KiB for the manifest and 4 KiB for the signature;
- verifies the exact manifest bytes before calling `parseReleaseManifest`;
- rejects redirects and final response URLs outside `allowedSourceOrigins`;
- passes the distinct `allowedAssetOrigins` set into manifest parsing.

- [ ] **Step 6: Run the source tests and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/source.test.mjs
```

Expected: FAIL because `source.js` does not exist.

- [ ] **Step 7: Implement bounded retrieval and verified loading**

Use these signatures:

```js
export async function fetchBounded(url, {
  fetchImpl = fetch,
  allowedOrigins,
  maxBytes,
  maxRedirects = 3
}) {}

export async function loadVerifiedRelease({
  manifestUrl,
  trustedKeys,
  allowedSourceOrigins,
  allowedAssetOrigins,
  fetchImpl = fetch
}) {}
```

Read `response.body` through its reader, cancel immediately when the accumulated byte count exceeds the limit, and concatenate only after EOF. In `loadVerifiedRelease`, fetch both byte arrays, verify the signature, then parse and return the frozen manifest. Network/status/body failures use stable public codes and generic messages: `release-source-invalid`, `release-source-unavailable`, or `release-body-too-large`.

- [ ] **Step 8: Run both suites and verify GREEN**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/signature.test.mjs foundry-edge-updater/tests/source.test.mjs
```

Expected: all signature/source tests pass with no network access.

- [ ] **Step 9: Commit the release trust boundary**

```powershell
git add foundry-edge-updater/src/signature.js foundry-edge-updater/src/source.js foundry-edge-updater/tests/signature.test.mjs foundry-edge-updater/tests/source.test.mjs
git commit -m "feat(updates): verify releases from trusted sources"
```

---

### Task 4: Evaluate compatibility and downgrade policy deterministically

**Files:**
- Create: `foundry-edge-updater/src/compatibility.js`
- Create: `foundry-edge-updater/tests/compatibility.test.mjs`

**Interfaces:**
- Consumes: the normalized manifest from Task 2 and an installed runtime snapshot.
- Produces: `compareSemver(left, right) -> -1|0|1`, `compareDottedVersion(left, right) -> -1|0|1`, and `evaluateRelease(manifest, installed) -> Readonly<{compatible:boolean,reasons:string[]}>`.

- [ ] **Step 1: Write the failing compatibility matrix**

Use this installed snapshot:

```js
const installed = {
  channel:'stable',
  components:{connector:'0.1.0',module:'0.1.0',dashboard:'0.1.0',edgePackage:'0.1.0'},
  foundry:'14.367',
  system:{id:'dnd5e',version:'5.3.3'},
  protocol:1,
  dataSchema:1
};
```

Create and parse a stable compatibility fixture from a clone of the Task 2 input by changing `channel` to `stable` and `releaseId` to `2026.09.20.1`; assert its upgrade is compatible. Separately parse the unchanged test-channel input and assert it produces `channel-mismatch` for the stable installed snapshot. Table-test one mutation per remaining reason code and assert exact ordered arrays:

```js
[
  'channel-mismatch',
  'connector-downgrade',
  'module-downgrade',
  'dashboard-downgrade',
  'edge-package-downgrade',
  'foundry-incompatible',
  'system-incompatible',
  'protocol-incompatible',
  'data-schema-incompatible'
]
```

Also test numeric ordering (`1.10.0 > 1.9.9`), SemVer prerelease ordering (`1.0.0-rc.2 < 1.0.0`), Foundry's two-part ordering (`14.368 > 14.367`), equality, malformed installed snapshots, multiple simultaneous reasons, and immutability of the returned result. A test-channel release is accepted only when the installed channel is explicitly `test`; no `allowDowngrade` escape hatch exists in this phase.

- [ ] **Step 2: Run the compatibility test and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/compatibility.test.mjs
```

Expected: FAIL because `compatibility.js` does not exist.

- [ ] **Step 3: Implement comparison and compatibility evaluation**

Implement SemVer precedence for three-part component versions, including numeric/alphanumeric prerelease identifiers, without locale/string comparison; manifests already reject build metadata. Implement a separate dotted-numeric comparator for the two- or three-part Foundry/system versions. Validate the installed snapshot before evaluation; invalid local state throws `code:'invalid-installed-state'`. Check compatibility in the fixed reason order shown above, return all reasons, and set `compatible` only when the array is empty.

This function reports policy only. It must not fetch, stage, install, mutate the database, or decide that stale runtime information is current.

- [ ] **Step 4: Run the compatibility test and updater suite**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-updater/tests/*.test.mjs
```

Expected: all updater tests pass.

- [ ] **Step 5: Commit compatibility evaluation**

```powershell
git add foundry-edge-updater/src/compatibility.js foundry-edge-updater/tests/compatibility.test.mjs
git commit -m "feat(updates): evaluate release compatibility"
```

---

### Task 5: Report connector and module release identity

**Files:**
- Create: `foundry-edge-connector/src/version.js`
- Create: `foundry-edge-connector/tests/version.test.mjs`
- Modify: `foundry-edge-connector/src/server.js:5,109`
- Modify: `foundry-edge-connector/src/application.js:5-10`
- Modify: `foundry-edge-connector/tests/server.test.mjs:5-16`
- Modify: `foundry-edge-connector/tests/application.test.mjs:5-16`
- Modify: `foundry-edge-connector/Dockerfile:3-11`
- Modify: `foundry-edge-module/scripts/main.js:18-35`
- Modify: `foundry-edge-module/tests/module.test.mjs:33-53`

**Interfaces:**
- Consumes: `release/component-versions.json`, `FOUNDRY_EDGE_RELEASE_ID`, and module metadata already loaded by Foundry.
- Produces: `connectorReleaseInfo()`, public connector health/readiness identity, and read-only `game.modules.get('foundry-edge').api.release` identity.

- [ ] **Step 1: Write failing connector identity tests**

In `version.test.mjs`, assert:

```js
assert.deepEqual(connectorReleaseInfo({releaseId:'development'}), {
  releaseId:'development',
  components:{connector:'0.1.0',dashboard:'0.1.0'},
  protocol:{minimum:1,maximum:1},
  dataSchema:1,
  automaticInstall:{enabled:false,reason:'release-source-not-configured'}
});
```

Reject release IDs outside `[A-Za-z0-9._-]{1,128}`. Modify the health test to require the same release object alongside the existing `service`, numeric `protocol`, and `status`; keep `Access-Control-Allow-Origin: *` and no credential header. Modify the readiness test to require `{ready:false,release:<same object>}` and `{ready:true,release:<same object>}`.

- [ ] **Step 2: Run connector reporting tests and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-connector/tests/version.test.mjs foundry-edge-connector/tests/server.test.mjs foundry-edge-connector/tests/application.test.mjs
```

Expected: FAIL because `version.js` and the new response fields do not exist.

- [ ] **Step 3: Implement connector reporting**

Load `release/component-versions.json` once in `version.js` with `readFileSync(new URL('../../release/component-versions.json', import.meta.url), 'utf8')`, validate the parsed JSON through synchronous `parseComponentIdentity`, and return a fresh recursively frozen public object. Default `releaseId` to `process.env.FOUNDRY_EDGE_RELEASE_ID ?? 'development'`.

Pass one computed release object through `createApplication(config)` into `createServer(config)` so `/health` and `/ready` report the same identity. When `createServer()` is used in diagnostic mode, default to `connectorReleaseInfo()` so the public diagnostic health response remains complete. The field `automaticInstall.enabled` must remain literal `false`; do not infer enablement from an environment variable in this phase.

Update the Dockerfile to copy both `release/component-versions.json` and the updater's pure `identity.js`/`errors.js` modules into the same `/app` relative paths used by connector imports. Do not copy updater service code, private keys, or add a Docker socket mount.

- [ ] **Step 4: Run connector reporting tests and verify GREEN**

Run the command from Step 2. Expected: all selected connector tests pass.

- [ ] **Step 5: Write the failing Foundry module identity test**

Extend the existing service-user test so the mocked module has `{version:'0.1.0'}` and assert:

```js
assert.deepEqual(module.api.release, {
  component:'module',
  version:'0.1.0',
  protocol:{minimum:1,maximum:1},
  dataSchema:1
});
assert.equal(Object.isFrozen(module.api.release), true);
```

- [ ] **Step 6: Run the module test and verify RED**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-module/tests/module.test.mjs
```

Expected: FAIL because the module API has no `release` field.

- [ ] **Step 7: Implement module identity reporting**

Import `PROTOCOL_RANGE` and `DATA_SCHEMA_VERSION` from `scripts/protocol.js`. When the service API is created, read the installed version from `game.modules.get(ID).version`; require strict semver and refuse to create the API if it is invalid. Add the frozen release object without changing authorization, scope generation, or gameplay methods.

- [ ] **Step 8: Run module reporting/build tests and verify GREEN**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-module/tests/module.test.mjs foundry-edge-module/tests/package.test.mjs
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-module/scripts/build.mjs
```

Expected: tests pass and module build exits 0 with portable protocol constants included.

- [ ] **Step 9: Commit version reporting**

```powershell
git add release/component-versions.json foundry-edge-connector/src/version.js foundry-edge-connector/src/server.js foundry-edge-connector/src/application.js foundry-edge-connector/tests/version.test.mjs foundry-edge-connector/tests/server.test.mjs foundry-edge-connector/tests/application.test.mjs foundry-edge-connector/Dockerfile foundry-edge-module/scripts/main.js foundry-edge-module/tests/module.test.mjs
git commit -m "feat(updates): report component release identity"
```

---

### Task 6: Integrate verification and document the disabled foundation

**Files:**
- Create: `foundry-edge-updater/README.md`
- Modify: `README.md:19-34`
- Modify: `foundry-edge-connector/README.md:13-42`
- Modify: `foundry-edge-widget/README.md:16`
- Modify: `.github/workflows/verify.yml:17-23`

**Interfaces:**
- Consumes: all phase-1 test suites and build commands.
- Produces: CI enforcement and operator/developer documentation that does not claim installation exists.

- [ ] **Step 1: Add updater tests and the Docker build to CI**

Change the combined test command to include `foundry-edge-updater/tests/*.test.mjs`. After the module/widget build steps, add:

```yaml
      - run: docker build -f foundry-edge-connector/Dockerfile -t foundry-edge:verify .
```

The identity consistency test is the CI guard against version drift.

- [ ] **Step 2: Document exact phase-1 behavior and exclusions**

`foundry-edge-updater/README.md` must state:

- this package is the future separate host-updater trust/policy library, not a running installer;
- stable source/key configuration, polling, idle gating, staging, Docker/module replacement, backup/recovery, UI, and live upgrade validation do not exist yet;
- manifest bytes are verified before parsing, sources/assets are origin-constrained, and compatibility evaluation is pure;
- private keys are never stored here; tests generate ephemeral test keys;
- `automaticInstall.enabled:false` is intentional until the remaining design phases pass.

Update root/component READMEs with the new updater unit-test command and new health response shape. Preserve the prominent statement that automatic updates are not implemented. State that no Foundry `manifest`/`download` production URLs are added until an actual signed test release exists.

- [ ] **Step 3: Run the complete unit suite**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" --test foundry-edge-module/tests/*.test.mjs foundry-edge-connector/tests/*.test.mjs foundry-edge-widget/tests/*.test.mjs foundry-edge-updater/tests/*.test.mjs
```

Expected: every test passes, 0 failures.

- [ ] **Step 4: Run both component builds and portable packaging**

```powershell
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-module/scripts/build.mjs
& "$env:TEMP/xeneon-foundry-tools/node-v24.21.0-win-x64/node.exe" foundry-edge-widget/scripts/build.mjs https://connector.example.test/edge
& 'C:/Program Files/Python312/python.exe' scripts/package-foundry-probe.py foundry-edge-module/dist dist/foundry-edge-module.zip
docker build -f foundry-edge-connector/Dockerfile -t foundry-edge:phase-1-verify .
```

Expected: every command exits 0. Inspect the image build context output to confirm no ignored private paths are copied.

- [ ] **Step 5: Confirm automatic installation is still impossible**

Run:

```powershell
rg -n "automaticInstall|Docker|child_process|execFile|spawn|module replacement|update lock" foundry-edge-updater foundry-edge-connector/src
```

Expected: `automaticInstall.enabled` is hard-coded false; updater source contains no `node:child_process`, Docker control, module replacement, database backup, polling loop, or update lock.

- [ ] **Step 6: Commit phase-1 integration**

```powershell
git add foundry-edge-updater/README.md README.md foundry-edge-connector/README.md foundry-edge-widget/README.md .github/workflows/verify.yml
git commit -m "docs(updates): integrate release trust verification"
```

- [ ] **Step 7: Re-read the spec and audit phase-1 scope**

Confirm each sequence-item-1 requirement maps to Tasks 1-6, confirm later sequence items remain unimplemented, and record any discovered design conflict before beginning the presence/quiet-gate plan. Do not deploy or configure a release source as part of this task.
