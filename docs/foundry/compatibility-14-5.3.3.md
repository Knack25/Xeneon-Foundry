# Foundry Edge compatibility record

Status: native test-world actions, local/hosted dashboards, administration and VPS browser operation are verified. Physical iCUE compatibility and the complete release matrix remain pending.

## Current checkpoint - 2026-09-20

The session feature list is implemented and deployed. **72 automated tests pass**, plus the isolated dashboard browser regression and a complete hosted live flow against disposable Edge Controls Hero in `xeneon-edge-test`.

Live evidence covers Quick Actions persistence, theme/font preferences, authenticated portrait display, inspiration, condition add/remove, concentration save/end, individual Hit Dice, native short/long rests, feature resource consumption, consumable use and retained healing, attunement, container movement, currency, preparation, device naming/last seen and death saves. The same flow rechecked initiative inside/outside combat, equipment, resources, upcasting, critical damage and healing. Test combat was deleted, disposable pairing revoked and fixture HP restored to 20. No campaign or world-time changes were requested.

Review fixes include a serializable Hit Dice iterator projection, post-fetch portrait ownership checks, consistent activity capability filtering and generic activity follow-up visibility. Portrait reads have a ten-second timeout and 1 MiB streaming limit.

Remaining release checks: physical iCUE Large/XL touch, storage and import behavior, and a second-world live transition matrix. Scene templates, target damage/effects and complex summon/enchant/transform workflows remain in Foundry. Older checkpoints below record their status at that time and are superseded by this checkpoint and the hosted administration evidence.

## Hosted administration and multiplayer checkpoint

Deployed isolated container `foundry-edge-foundry-edge-1` under `/opt/foundry-edge`, with separate SQLite volume and private service/admin credentials. HTTPS hostname: `edge.foundry.jewinashoe.org`. No Foundry restart or campaign modification. Node24.21.0 and Playwright1.63.0 image digests are pinned. Certificate validation and public routing passed; the initial browser check required a temporary hostname override while this PC cached the previous DNS miss.

Live checks passed: two-player PC isolation, owned-NPC exclusion, same-player two-device synchronization, ownership removal blocking reads/actions despite retained service ownership, selection persistence after reload, admin remapping updating the visible PCs, revocation clearing the sheet and logout invalidating the admin session. Original character values/ownership were restored; only disposable test devices were revoked.

Linux native HP/temp and skill-roll checks passed. After container recreation, pairing and completed request history persisted, generation changed, duplicate requests returned the stored result and new old-generation commands were rejected. A separate SQLite-file reopening test verifies unacknowledged dispatched requests stay unknown and never replay.

All-GPU SwiftShader consumed about200% CPU even with no-canvas. Disabling WebGL prevented Foundry initialization. Chromium's WebGL-only fallback restored native operation at about355–357MiB RAM and17–19% CPU in post-action samples. Client-only settings are noCanvas, maxFPS10, photosensitive mode and a320×240 viewport.

Deployment review identified proxy-wide rate limiting. The fix trusts forwarding only from an explicitly configured socket peer (current gateway172.16.5.1); untrusted/malformed forwarding is ignored. Successful pairings do not consume the failed-attempt limit. Regression tests pass.

## Latest live evidence — 2026-09-19

The user enabled the module in `xeneon-edge-test` and authorized disposable fixtures there. Created Edge Service (Trusted Player), Edge Test Player, and Edge Test Hero through native Foundry document APIs. Runtime reports Foundry 14.367 / D&D 5e 5.3.3. No campaign characters were changed.

The headless service browser successfully read the owned PC, set temporary HP to 4, applied 5 damage (HP 15→14, temp 4→0), and healed to the maximum of 20. Native skill, ability-check and saving-throw calls completed with public messages, character speaker, service author and requesting-player attribution. A private configured roll mode was rejected. Restored the hero to HP 15, temp 0.

The local web preview at `http://127.0.0.1:8791` passed pairing, reload persistence, temp HP 0→3→0, and a native skill roll. No horizontal overflow at 1100×650 and no JavaScript errors. The live actor data confirmed saving throw modifiers are `abilities.*.save.value`; projection was corrected with a failing-then-passing regression.

Current automated suite: **37 passing tests**, plus the browser regression for immediate sheet clearing after ownership loss. Independent review found queued remapping and stale DOM exposure; both were reproduced by failing tests and fixed. See [live preview instructions](live-web-preview.md).

Still unverified: physical Large/XL iCUE storage/permissions/touch behavior, two-device and world-switch end-to-end matrix, VPS browser supervision and memory use, protected portraits, and complete deployment/admin UI. Browser preview uses local storage and authenticated polling; it is not evidence of physical iCUE compatibility.

## Initial probe evidence (historical)

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

## Initial staging history — superseded by the live results above

Needed next: dedicated test world launched through Foundry's administrative setup, then a dedicated service account and test player/PC. Do not put credentials in this file or in chat.

The hostname was corrected and SSH key access was configured successfully using the Windows SSH agent. Read-only inspection found Ubuntu 26.04.1, Docker, Traefik, and Foundry's bind-mounted data under `/opt/foundry-data`. The container uses Node v24.19.0; the installed D&D system is 5.3.3 and all world metadata reports Foundry 14.367. About 6.5 GB memory was available during inspection.

The user created and launched **Xeneon Edge Test**, ID `xeneon-edge-test`, rather than reusing the existing Test world. Its metadata reports Foundry 14.367 / D&D 5e 5.3.3. No connected browser automation surface is available for authenticated Foundry setup.

Staged the reviewed archive in `/opt/foundry-data/Data/modules/foundry-edge` after verifying the directory did not exist. SHA256: `bec336dc7c835e5395a2409165b527f3ee5ce6d64a67b4d5b4093b7df509ece0`, matching the local archive. File ownership matches the existing module directory. The module is not enabled and Foundry has not been restarted.

Live discovery found a packaging defect in that original archive: Windows `Compress-Archive` stored literal backslash member names, causing Linux extraction to miss `scripts/main.js`. Foundry logged a metadata validation error. Repaired only those probe files into the proper `scripts/` directory; HTTP GET of the entry file now returns 200. Added `scripts/package-foundry-probe.py` and a regression test for portable ZIP names. The archive at the local output path has been rebuilt with the corrected packager. New suite: 22/22 passing. Module discovery still needs refreshing via the setup/world launch flow before activation.

Record these outcomes before advancing the architecture:

| Check | Current evidence |
|---|---|
| Actual Foundry build and system version | Server-side world metadata: 14.367; installed D&D manifest: 5.3.3; confirm runtime in test world |
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

The full release remains pending Tasks 3-8 and the live acceptance matrix. Only the unactivated module probe has been staged on the VPS. No production character changes or service restarts have been performed.
