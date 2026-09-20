# Coordinated Foundry Edge updates

## Intent and scope

Keep the companion module, VPS connector, hosted dashboard and eventual Edge launcher compatible without routine manual installation. The user selected automatic installation whenever no players are connected. Foundry core, D&D 5e, iCUE and unrelated Microsoft widgets remain outside this updater.

## Installation policy

Check for stable releases at startup and every six hours, with jitter and an administrator Check now action. Downloads and verification may happen while people are connected. Install only after five uninterrupted minutes with no connected Foundry users except the configured service account. Connected GMs count as users. A stale, disconnected or unconfigured Foundry session is unknown, never evidence of an empty world.

An idle, powered-on Edge does not block updates indefinitely. An Edge command, open confirmation with a renewable activity lease, or pending native action blocks installation and resets the quiet timer. Background character polling does not. Pending/dispatched requests must settle; uncertain requests must not be replayed or treated as safely completed. Unresolved dispatched work blocks automatic installation until reconciliation.

Immediately before installation, acquire a single update lock, stop accepting new actions with a retry-later maintenance response, drain in-flight work and recheck presence, world scope and activity. Cancel the attempt if a user joins before the commit boundary. After that boundary, finish or recover the short update without admitting Edge actions. This is a quiet-period policy, not a guarantee that Foundry itself prevents a new browser from joining during installation; no Foundry login lock or server restart is added.

## Release model

Publish a distinct Foundry Edge stable release manifest so Microsoft helper releases are not mistaken for connector updates. Pin component versions, immutable connector image digest, module archive digest, supported Foundry/system versions, protocol ranges and data schema requirements. Release assets and manifests must be verified against a bundled release-signing public key. Private signing material stays out of the repository and VPS runtime. Reject malformed manifests, untrusted sources, oversized assets, invalid signatures, incompatible dependencies, prereleases on stable and unintended downgrades.

Build the dashboard into the connector image. Version its assets and expose a release identifier plus supported client protocol range. Browser clients detect a new release and reload only after pending actions/dialogs settle. Retain device credentials and per-character preferences. Unsupported old clients may read update status but cannot submit incompatible commands.

Publish the module's normal Foundry manifest/download metadata too. The coordinated installer owns automatic module replacement on this VPS; a manually installed version mismatch is reported and blocks unsafe actions rather than silently overwriting an unknown installation.

## Host updater and recovery

Use a separate narrowly scoped host service to fetch, verify, stage and install releases. The public connector must not receive the Docker socket or arbitrary shell execution. Its authenticated administrative controls exchange allowlisted requests/status with the updater through a restricted local channel. No user-provided filesystem paths, image names, commands or download URLs are executable update inputs.

Stage complete artifacts before stopping anything. Journal each phase durably and retain the previous image, module directory and a consistent connector database backup. Close/quiesce connector database writers before backing up. Preserve pairings, mappings, request history, preferences and private credentials. Validate paths and archive contents before replacement; reject traversal and unsafe links.

Stop only the connector, replace the module directory atomically within the intended module root, recreate the connector from the pinned image, and verify readiness, expected component versions, service identity and world scope. Resume action admission only after checks pass. Do not restart Foundry or alter campaign documents. Module metadata changes requiring a Foundry restart are classified as manual maintenance releases and not automatically installed.

On failure, keep action admission closed and restore the compatible prior image/module and matching database snapshot before reopening. Once actions have resumed, never restore an old database automatically: it could erase request deduplication history and permit duplicate character actions. Crash recovery follows the durable phase journal. A failed release is quarantined rather than retried repeatedly; administration shows recovery status and a retry action.

## Administration and devices

Add an Updates section to the existing hosted admin console and embedded Foundry window. Show installed/available versions, last check, release notes, download/install progress, why installation is waiting, pause/resume and update history. All mutations require the current administrator session and CSRF protection. Players see a brief updating/reconnecting state without administrative controls.

Prefer a minimal Edge launcher serving the hosted dashboard, subject to hardware validation of remote loading, permissions and persistent storage. Hosted dashboard changes then require no package reimport. Do not claim automatic native iCUE package replacement until a supported mechanism is verified on the physical hardware. If package changes require reimport, the updater reports that requirement and provides the verified package while keeping the prior compatible hosted interface available where feasible.

## Alternatives considered

Independent container/module updaters are simpler but can install incompatible versions and cannot coordinate active character commands. Manual one-click installation gives predictable timing but does not satisfy the chosen automatic policy. A coordinated host updater with a shared manifest and idle gate is selected.

## Implementation sequence and acceptance

1. Release manifest/signature validation, version reporting and deterministic compatibility tests.
2. Fresh Foundry presence reporting, Edge activity leases, quiet timer and atomic maintenance admission tests. Cover connected GM, service-only presence, disconnects, joins during staging and in-flight requests.
3. Host staging/install journal, backups and recovery with disposable directories/database and mocked container operations. Test interrupted downloads, malicious archives, invalid signatures, incompatible schemas and every crash phase.
4. Admin status/pause/history and dashboard update handling. Verify credentials/preferences persist and uncertain commands never replay.
5. Publish a test-channel signed release and exercise upgrade, failed readiness and recovery on the authorized test deployment. Stable automatic installation remains disabled until this complete path passes and the stable release source/signing identity is configured.
6. Validate the Edge launcher and package-update path when hardware arrives. Report any manual native-package step honestly.

No release is considered deployed based only on unit tests. Record actual artifact versions, readiness and post-update pairing/action checks. Live destructive/recovery exercises remain limited to the disposable test setup.
