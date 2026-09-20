# Foundry Edge host updater foundation

This dependency-free Node 24 package is the trust and compatibility library for the future separate host updater. It is not a running service or installer. The public connector does not receive Docker access or arbitrary host execution through this package.

The current phase provides:

- strict, size-bounded release-manifest parsing;
- detached Ed25519 verification over the exact manifest bytes before parsing;
- HTTPS source and redirect origin restrictions, with separate allowlists for release sources and signed asset URLs;
- pure compatibility evaluation for component versions, Foundry/D&D versions, protocol ranges and connector data-schema ranges;
- shared checked-in component identity verified against the connector, module, dashboard and Edge package versions;
- a deterministic maintenance safety gate requiring fresh presence, five uninterrupted quiet minutes, no explicit Edge activity and no unresolved durable commands.

Private signing keys are never stored here or loaded by the VPS updater runtime. Tests generate ephemeral Ed25519 keys. A future release will bundle only the selected public verification key.

The connector refreshes Foundry presence every three seconds and treats reports older than fifteen seconds as unknown. Only the configured service account may remain connected during the five-minute quiet period; players and GMs reset it. Dashboard confirmations use 45-second leases renewed every 15 seconds. Accepted, dispatched and outcome-unknown requests block maintenance, and maintenance admission closes new command insertion with an authenticated retry-later response. Background character polling does not create activity.

This gate is a policy/state component, not an updater service, and cannot install anything. Stable source/key configuration, startup and six-hour release polling, staging, Docker/module replacement, database backup, crash recovery, administration update UI, signed test-channel deployment and native Edge package updating do not exist yet. Connector reporting therefore keeps `automaticInstall.enabled` set to `false` with reason `release-source-not-configured`. This must remain disabled until the remaining phases in the [coordinated update design](../docs/superpowers/specs/2026-09-20-foundry-automatic-updates-design.md) pass.

Run the updater library tests from the repository root:

```sh
node --test foundry-edge-updater/tests/*.test.mjs
```

No production Foundry `manifest` or `download` URL is published until an actual signed test-channel release exists.
