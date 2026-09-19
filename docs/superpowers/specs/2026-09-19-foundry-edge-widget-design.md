# Foundry Edge character dashboard

Date: 2026-09-19
Status: Approved by user; compatibility foundation in progress. See the implementation plan and compatibility record.

## Intent and agreed constraints

Provide an interactive D&D 5e character dashboard on Xeneon Edge, primarily in Large and XL widget sizes. It must work with the player's normal Foundry browser closed and support multiple independently paired devices and players. Start conservatively while preserving an architecture that can eventually support complete character-sheet control.

The initial target is Foundry VTT 14 with D&D 5e 5.3.3, hosted on the user's Hostinger VPS with SSH and permission to run additional services. Foundry remains authoritative. Standard D&D 5e is the initial integration target; custom sheets, Beyond synchronization, and combat automation are not prerequisites.

The selected approach uses one dedicated Foundry service account and a managed background browser on the VPS. Rolls identify the acting character and display the requesting player, while the service account remains the actual message author. Player passwords and simultaneous player logins are not required.

## Release scope

Supported initially:

- Individually revocable device pairing, player mapping, and character switching.
- Character stats, abilities, saves, skills, speed, resources, features, inventory, and spell viewing.
- Damage/healing adjustments to current HP and changes to temporary HP.
- Ability checks, saving throws, and skill rolls, with normal, advantage, or disadvantage selection.
- Live character updates and confirmed results from Foundry.
- Clear connection, authorization, unsupported-version, and empty states.

Other character fields are read-only initially. Spell-slot edits, resource edits, inventory changes, equipment changes, attacks, spellcasting, rests, targeting, leveling, and character creation are future capabilities. No arbitrary scripts, document patches, or generic mutation endpoint are exposed to devices.

## Components and repository boundaries

Proposed new sibling projects are `foundry-edge-widget`, `foundry-edge-connector`, and `foundry-edge-module`. Keep Foundry-specific authentication and hosting separate from the existing Microsoft helper. Follow existing widget build and packaging conventions where applicable without changing the behavior of Planner or Outlook.

### Edge widget

An HTML/JavaScript iCUE widget consumes a versioned character snapshot and explicit action capabilities. It manages pairing, selection, rendering, and action feedback. It does not calculate authoritative D&D results or hold Foundry credentials.

Large uses a persistent character/vitals strip and one active content tab. XL adds a details panel when the actual viewport permits it. Character selector, HP/temp HP, AC, and connection status remain easy to access. Tabs cover overview, actions, spells, and inventory; features appear in overview/actions as appropriate. Read-only views must not imply that unavailable actions work.

Exact viewport dimensions and iCUE remote-network permissions must be verified before finalizing packaging. The architecture does not assume arbitrary remote domains are accepted by iCUE.

### VPS connector

A separately deployed service provides HTTPS device endpoints, live updates, durable pairing records, per-world player mappings, request status, and an authenticated administration page. A supervised headless browser loads Foundry and the companion module under the service account. The connector reconnects with bounded backoff and reports readiness only after the world and adapter are ready.

Proposed deployment is a containerized service behind the VPS HTTPS reverse proxy. Store browser state, service credentials, and connector secrets outside the repository with restricted access. Keep the admin interface authenticated and browser-control/debug endpoints private. Logs must redact credentials, pairing codes, and session cookies.

### Companion module and D&D adapter

The module authenticates its connection to the connector, announces world identity and supported versions, observes document changes, projects character data, and dispatches a restricted action set through Foundry/D&D APIs. The D&D adapter owns system-specific data paths and roll behavior; the transport and widget do not depend directly on those paths.

All execution occurs in the designated service session. Other browsers loading the module do not become executors. The module rechecks the requesting player's actor ownership and allowed action immediately before execution; the service account's own access must never substitute for that check.

## Pairing and permissions

1. An administrator creates a short-lived, single-use invitation assigned to a Foundry user in the active world.
2. The player enters the connector URL and invitation code in the widget.
3. The connector issues a unique high-entropy device credential. Retain a hash for verification; rate-limit pairing attempts and reject expired/reused codes.
4. The credential resolves to administrator-controlled world/user mappings. Requests cannot supply a trusted user identity themselves.
5. Revocation invalidates the device and closes its subscriptions. Ownership or mapping changes also invalidate affected views and pending actions.

Do not expose Foundry credentials or a broad service-account API to the widget. Reads, subscriptions, and writes all enforce the mapped user's access. Provide a disconnect/forget action on each device.

## Active world and character selection

Only the currently loaded world's player-character actors owned by the mapped player are eligible. For the initial D&D adapter, interpret this as actors of type `character` with OWNER permission for that user; exclude NPC actors, compendium entries, and unowned characters. Token-only synthetic actors are outside the initial selector.

Identity includes Foundry instance, world ID, user ID, and actor ID as applicable. Never correlate accounts by display name. Devices remember selected character and tab per world. Administrator mappings can associate a device with different users in different worlds without re-pairing.

World transitions clear the prior sheet immediately and invalidate in-flight requests and subscriptions. A new world generation accompanies snapshots and commands so delayed replies cannot populate or modify the new world's selection. Restore a remembered character only after confirming that it remains eligible. Show explicit states for no active world, no mapping, and no eligible characters. Inactive worlds are never queried for character listings.

Initial operation connects to one Foundry instance and one active world at a time. The data model supports later expansion; simultaneous worlds and a cross-world character browser are not initial features.

## Commands, synchronization, and failures

Expose typed operations for HP adjustment, temporary HP setting, ability check, save, and skill roll. Each includes a unique request ID, active-world generation, actor identity, action type, and validated inputs. Infer the player from the authenticated device. Advertise per-actor capabilities so later operations can be added without a generic write interface.

Serialize connector mutations for a character and read its current values at execution time. Use bounded integer inputs and D&D HP rules; temporary HP behavior must be explicit. Return confirmed snapshots rather than treating an optimistic local value as committed. External Foundry edits can race with connector actions, so do not promise transaction isolation that Foundry does not supply.

Maintain durable request status and reject reuse of an ID with different parameters. A repeated completed request returns its recorded result. If the connector loses contact after dispatch, report the result as unknown and reconcile where possible; never automatically rerun a roll or mutation whose completion is uncertain. This avoids claiming exactly-once execution across a Foundry/process crash.

Publish authorized snapshots with revisions. On reconnect, obtain a fresh snapshot before enabling actions. During a same-world disconnection a last snapshot may remain visibly stale, but actions are disabled. On world change, revocation, or lost ownership, clear the affected data rather than showing a stale private sheet.

Descriptions and item content are untrusted HTML: sanitize rendering and reject executable URLs. Asset access must not leak Foundry session credentials; validate authenticated image delivery during the prototype.

## Chat attribution and roll privacy

Use the actual selected character as speaker, supplying token/scene context only when explicitly resolved. Never accidentally use the service account's controlled token. Preserve native D&D roll data and attach a small `Requested by <player> · Edge` attribution to the original message, with escaped display text.

Persist requesting user, device reference, request ID, and world identity in module metadata for diagnosis. The service account remains the real message author. Changing the speaker does not grant the player author-level editing or button permissions.

Initially expose public rolls only. Do not silently convert a configured private/blind roll into a public message; reject unsupported privacy modes with an explanation. Private/blind/self-roll support requires recipient and widget-visibility tests before being advertised. Native interactive cards and author-dependent controls are also compatibility checks, not assumed supported behavior.

## Compatibility prototype before dashboard expansion

Validate on the exact installed Foundry 14 build and D&D 5e 5.3.3:

1. Unattended service login, module readiness, restart recovery, and behavior with normal player browsers closed and open.
2. Required service-account role and actor access using the least privilege that supports the initial operations. Do not assume a GM account is necessary or unnecessary before testing.
3. Two paired players: eligible PC lists, denied cross-player reads/actions, ownership changes, and device revocation.
4. One HP change and one skill roll using native APIs, correct speaker/player attribution, and message visibility.
5. Repeated request delivery and connection loss after dispatch without duplicate effects.
6. Active-world changes, missing mappings, and delayed old-world messages.
7. iCUE Large/XL import, remote HTTPS/live transport, credential persistence, and protected character assets.
8. Background browser memory usage on the VPS and readiness after host/world restarts.

A failed check must lead to a documented correction or clearly narrower capability, not an unverified claim of support. A test world/account and deployment details will be needed for live verification; neither VPS deployment nor live tests have occurred during design.

## Verification and delivery

Use unit/contract tests for access filters, identity scoping, validation, request deduplication, world-generation rejection, and adapter projections. Use integration tests with two devices for synchronized updates and revocation. Exercise real Foundry for rolls/permissions/restarts, and browser plus physical iCUE checks for touch layout and packaging. Fixtures alone cannot establish compatibility with Foundry or hardware.

Deliver the widget package, installable companion module, connector deployment configuration, and setup/upgrade/recovery instructions. Keep service secrets out of release artifacts. Document supported version pairs and verified capabilities; do not claim generic Foundry or automation compatibility.

## Reference points

- Foundry module development: https://foundryvtt.com/article/module-development/
- Foundry 14 ChatMessage API: https://foundryvtt.com/api/classes/foundry.documents.ChatMessage.html
- D&D 5e package/version listing: https://foundryvtt.com/packages/dnd5e

These establish the design direction. Exact system APIs, service-role requirements, and runtime behavior remain subject to the explicit compatibility checks above.
