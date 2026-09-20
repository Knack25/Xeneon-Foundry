# Expanded character controls implementation plan

User requested autonomous completion of the remaining discussed features on 2026-09-20. Existing approved architecture and test-world-only authorization apply.

Goal: extend the existing web dashboard with initiative, spellcasting/slots and equipment/resources/basic character details.
Architecture: explicit protocol operations, permission-checked native module execution, existing durable command coordinator and confirmation UI. Foundry14 / dnd5e5.3.3 remains authoritative. No generic document patch API.

- [x] Initiative: inspect native API; strict input; roll and update existing combatant when supported, with clear behavior outside combat; unit and live checks.
- [x] Sheet controls: bounded operations for equipment state, inventory quantity, limited-use counters, spell slots, resource counters and basic name/appearance/alignment details. Prevent stale absolute edits with expected values. Native item/actor document updates only; preserve derived data.
- [x] Spellcasting: inspect Activity.use and consumption contracts; project spell activities, choose slot/upcast level, perform native consumption and public cast chat; support attack/damage follow-up without accidental second consumption. Surface unsupported activity behavior explicitly.
- [x] Web UI: confirmation controls, fresh actor/world checks and no uncertain-action replay; paired-browser tests at Large/XL-like viewports.
- [x] Deploy only connector/module changes; run live disposable test fixtures; independent review, fix findings, full tests, docs and commit.

Files: connector/src/protocol.js and tests; module/scripts/dnd5e.js plus focused helpers as needed and tests; widget/widget/src/app.js, preview.html and browser tests. Shared protocol still built into module distribution.

Physical iCUE remains blocked on hardware; browser functionality is independently verifiable. Campaigns remain untouched. Leveling/character creation, arbitrary automation and scene targeting are not implied by the three discussed feature groups.

Completed browser-native controls and deployed test-world verification on 2026-09-20. Review found and fixed a cast scope race; retained casts are also keyed by player/actor to prevent request-ID collisions across players. Healing/concentration and native combat initiative verified live. Hardware integration remains pending the device.
