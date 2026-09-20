# Foundry Edge host updater foundation

This dependency-free Node 24 package is the trust and compatibility library for the future separate host updater. It is not a running service or installer. The public connector does not receive Docker access or arbitrary host execution through this package.

The current phase provides:

- strict, size-bounded release-manifest parsing;
- detached Ed25519 verification over the exact manifest bytes before parsing;
- HTTPS source and redirect origin restrictions, with separate allowlists for release sources and signed asset URLs;
- pure compatibility evaluation for component versions, Foundry/D&D versions, protocol ranges and connector data-schema ranges;
- shared checked-in component identity verified against the connector, module, dashboard and Edge package versions.

Private signing keys are never stored here or loaded by the VPS updater runtime. Tests generate ephemeral Ed25519 keys. A future release will bundle only the selected public verification key.

Stable source/key configuration, startup and six-hour polling, quiet-time and activity gating, staging, Docker/module replacement, database backup, crash recovery, administration UI and live upgrade validation do not exist yet. Connector reporting therefore keeps `automaticInstall.enabled` set to `false` with reason `release-source-not-configured`. This must remain disabled until the remaining phases in the [coordinated update design](../docs/superpowers/specs/2026-09-20-foundry-automatic-updates-design.md) pass.

Run the updater library tests from the repository root:

```sh
node --test foundry-edge-updater/tests/*.test.mjs
```

No production Foundry `manifest` or `download` URL is published until an actual signed test-channel release exists.
