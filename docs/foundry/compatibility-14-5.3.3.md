# Foundry Edge compatibility record

Status: local compatibility foundation only. No live Foundry, Hostinger, or iCUE results yet.

## Verified locally

- Shared action validation rejects unknown actions, injected player IDs, invalid scope and unsafe HP values.
- Adapter boundary tests cover owned-PC filtering, stale worlds, native HP call direction, checks/saves/skills, public-only rolls, service author preservation, and cancelled rolls.
- Companion-module build copies a standalone protocol module and declares an unverified Foundry 14 / D&D 5e 5.3.3 target.
- Diagnostic widget build scopes network permission to the selected host/port and preserves XML-compatible head tags.
- Loopback health endpoint is public and non-sensitive; all character routes are absent.
- Current test total: 21 passing new tests on portable Node v24.21.0. Existing Planner: 23 passing; existing Outlook: 19 passing after installing its locked dependencies.
- Edge Chromium smoke check passed at 1000 x 480 CSS pixels with a mocked HTTPS endpoint: ES module startup, viewport measurement, health request/result rendering, and no horizontal overflow. This is not a physical iCUE test.

These tests validate our boundaries with an injected Foundry runtime. They do not establish real Foundry permission enforcement, dice behavior, HP mechanics, iCUE import, or browser compatibility.

## Source evidence

Inspected upstream D&D 5e tag `release-5.3.3`:

- `module/documents/actor/actor.mjs`: `rollSkill(config, dialog, message)`, `rollAbilityCheck(config, dialog, message)`, and `rollSavingThrow(config, dialog, message)` accept separate process/dialog/message configurations. Native calls construct D&D chat flags; supplying `message.data.flags['foundry-edge']` preserves those defaults through the system's merge.
- `module/dice/_types.mjs`: dialog configuration supports `configure: false`; message configuration supports `create`, `rollMode`, and `data`.
- Actor HP code: `applyDamage(number)` handles numeric damage/healing, temporary HP consumption, and HP limits. Adapter inverts positive healing to negative native damage. Temporary HP replacement uses the document update API.
- Advantage/disadvantage are supplied as requested bonuses to native processing; normal leaves system effects intact. Exact in-game cancellation behavior still needs the live roll test.
- Independent review caught three issues, reproduced in failing tests and corrected: v14 uses `public` rather than legacy `publicroll`; unresolved speaker token/scene must be explicitly null to clear native defaults; spell preparation uses numeric `system.prepared` states (0/1/2). All regression tests pass.

Sources:

- https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/module/documents/actor/actor.mjs
- https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/module/dice/_types.mjs
- https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/module/dice/basic-roll.mjs
- https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/module/data/item/spell.mjs
- https://foundryvtt.com/api/classes/foundry.documents.ChatMessage.html

## Live checkpoint — awaiting connection details

Needed: Foundry HTTPS URL, existing SSH alias/user or another agreed access method, exact Foundry build, and a disposable test world with a dedicated service account and test player/PC. Do not put credentials in this file or in chat.

The user supplied a hostname and confirmed SSH is not configured. Public-page retrieval failed DNS resolution from this PC. Awaiting hostname confirmation and VPS public IP/SSH user/port to arrange access; no login was attempted.

Record these outcomes before advancing the architecture:

| Check | Current evidence |
|---|---|
| Actual Foundry build and system version | User reports Foundry 14 / D&D 5e 5.3.3; build not provided |
| Minimum service role and ownership | Not tested live |
| Native public skill/check/save and attribution | Contract tests only |
| Normal vs advantage/disadvantage with existing effects | Not tested live |
| Native damage/temp absorption/healing limits | Call-boundary tests only |
| Player browser open and closed | Not tested live |
| Unattended browser login/restart/memory | Supervisor not implemented; requires actual join flow |
| Large/XL viewport, native ES module loading and HTTPS import | Not tested on iCUE |
| Authenticated streaming and token persistence | Not implemented or tested |
| Protected portrait retrieval | Not implemented; adapter returns no portrait |
| Revocation, world switching and request deduplication end-to-end | Coordinator/pairing not implemented |

## Current artifacts and limits

`foundry-edge-module` is a local service-session probe API, not a network endpoint. `foundry-edge-widget` is a connection diagnostic, not the full dashboard. `foundry-edge-connector` currently exposes only `/health` on loopback. See their READMEs for exact commands and test-world-only usage.

The full release remains pending Tasks 3-8 and the live acceptance matrix. No deployment or production character changes have been performed.
