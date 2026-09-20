# Session features implementation plan

User authorized continuing down the complete proposed feature list. Execute within existing architecture and test-world-only access; browser preview is the acceptance surface until hardware arrives.

- [x] Quick Actions: local per-instance/world/character favorite IDs, ordered and resolved from current capabilities; no stale snapshots persisted.
- [x] Rests: native short/long rest, manually selected Hit Dice spending, honor Foundry rest permission, never advance world time/bastions from the Edge.
- [x] Conditions/concentration: configured conditions, native concentration save/end, expected state confirmation.
- [x] Death saves/inspiration: native death save gating and explicit inspiration toggle.
- [x] Combat overview: public current combatant/round plus own initiative; no hidden combatant data; optional local turn alert.
- [x] Feature activation: native feat/consumable Activity.use, resource consumption and retained followups.
- [x] Spell preparation/search: prepare toggle respecting always-prepared, level/school/concentration/ritual filters.
- [x] Inventory: search, currency, attunement, existing containers, consumable use; prevent container cycles and cross-actor references.
- [x] Portrait/preferences: bounded authenticated same-origin portrait delivery, per-character colors/font size.
- [x] Devices: friendly labels, last seen, connection diagnostics in admin.
- [x] Integrate, test unit/browser/live disposable fixtures, review, deploy, document and commit.

Independent helper/connector changes assigned to agents; root implements native gameplay and integrates UI. All commands remain explicit, owner checked, no uncertain action replay. No campaign or global clock changes.
