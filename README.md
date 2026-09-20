# Xeneon Foundry

Interactive Foundry VTT character dashboards for the CORSAIR XENEON EDGE, with a standalone VPS connector and multi-player/device pairing.

This is the home of the Foundry project formerly developed in [Xeneon-Widgets](https://github.com/Knack25/Xeneon-Widgets). Its Foundry-specific Git history has been preserved here. Planner, Outlook and the Microsoft helper remain in that repository.

## Components

- [Companion module](foundry-edge-module/README.md): current-world owned-PC access and native D&D actions through a dedicated service account.
- [Connector](foundry-edge-connector/README.md): unattended Foundry session, pairing, administration, durable commands and hosted dashboard delivery.
- [Dashboard and Edge package](foundry-edge-widget/README.md): character switching, attacks/spells, session controls, inventory, favorites and display preferences.

Verified target: Foundry **14.367** and D&D 5e **5.3.3**. This remains a test-world beta. The hosted web dashboard is functional; the physical iCUE package still uses a diagnostic entry point until hardware validation. See [compatibility evidence](docs/foundry/compatibility-14-5.3.3.md).

## Develop and verify

Install Node.js 24+ and Python 3.9+. From this repository root:

```sh
npm ci --prefix foundry-edge-connector
node --test foundry-edge-module/tests/*.test.mjs foundry-edge-connector/tests/*.test.mjs foundry-edge-widget/tests/*.test.mjs
node foundry-edge-module/scripts/build.mjs
node foundry-edge-widget/scripts/build.mjs https://your-connector.example/edge
python scripts/package-foundry-probe.py foundry-edge-module/dist dist/foundry-edge-module.zip
```

Use `python3` on Linux where necessary. The isolated dashboard browser regression requires Microsoft Edge installed locally:

```sh
node foundry-edge-widget/tests/weapons-browser.mjs
```

For Linux hosted operation, use the connector Dockerfile and [deployment instructions](foundry-edge-connector/README.md). Build from this repository root so the connector can include the dashboard. No source from Xeneon-Widgets is needed. The checked-in compose hostname is the existing test deployment; configure it for another installation.

## Credentials and launchers

Private credentials, browser sessions and runtime databases are never part of a clone. Keep them in ignored directories with restrictive local permissions. The Windows launchers use the existing private test setup described in [live preview instructions](docs/foundry/live-web-preview.md). Local files from the original development PC are migrated separately; they are not published to GitHub.

The running VPS does not depend on the checkout name. Repository migration does not replace its database, pairings, credentials or containers.

## Automatic updates

The [coordinated update design](docs/superpowers/specs/2026-09-20-foundry-automatic-updates-design.md) specifies signed compatible releases and installation only while users are disconnected and Edge actions are idle. **Automatic updates are not implemented yet.** Future Foundry release assets belong in this repository, independently of Microsoft widget releases.
