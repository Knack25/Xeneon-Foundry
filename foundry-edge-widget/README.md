# Foundry Edge widget and web preview

`widget/preview.html` is the live character dashboard served by the connector. Refresh the hosted preview and select **Attacks** to see weapon attack activities. Each entry offers **Attack** (normal, advantage or disadvantage) and **Damage** (normal or critical). Choose weapon mode and ammunition in the confirmation dialog. Native Foundry attack rules may consume ammunition or thrown weapons; damage rolls do not apply target HP changes. The Attacks tab also provides initiative: existing combat entries are updated; otherwise an initiative roll is posted to chat.

The first hardware package still uses a diagnostic entry point. It records the actual Large/XL viewport and checks HTTPS access to the connector without sending credentials or modifying characters.

With Node 24 or newer:

```powershell
npm test
npm run build -- https://your-connector.example/edge
```

The build writes `dist/` and grants network permission only for the supplied host/port. Import using your iCUE custom-widget workflow; actual iCUE compatibility remains unverified. If the host changes, rebuild the package. The diagnostic uses native ES modules; module loading is part of the hardware check before selecting the production bundle format.

Do not put credentials in the address. The connector `/health` response must contain `service: "foundry-edge-connector"`, `protocol: 1` and a public `release` object. The current release object explicitly reports `automaticInstall.enabled: false`; the dashboard does not yet reload itself for releases.

## Expanded web controls

- **Spells:** cast supported prepared spell activities, choose a standard or pact slot and upcast level. Foundry consumes resources and handles concentration. Recent casts provide separate attack, damage and healing rolls without consuming another slot.
- **Inventory:** expand an item to equip/unequip it or set its quantity.
- **Resources:** set remaining spell slots, character resources and item uses within their current maximums.
- **Details:** edit name, alignment, appearance, personality traits, ideals, bonds, flaws and physical details. These controls edit plain text, not derived statistics or class advancement.

Edits carry the value originally shown and reject a detected conflict. Native Foundry changes remain authoritative; this is optimistic conflict detection, not a transaction locking out other Foundry clients.

Casting supports attack, damage, healing, saving-throw and utility activities. Targets, templates, saving throws by other creatures and applying effects/damage are resolved in Foundry. Activities requiring separate scene/configuration workflows (such as summoning, enchanting or transforming) are marked for use in Foundry. Recent cast follow-ups last ten minutes within the same service session; use the Foundry chat card after expiry or restart.

Verification: 2026-09-20 live Xeneon Edge Test checks covered standalone/combat initiative, equipment, quantity, uses, resources, slots, alignment, upcasting, attack, critical damage, healing and concentration. No physical iCUE claim is made before hardware arrives.

## Session dashboard

- **Quick Actions:** pin and reorder checks, saves, attacks and supported activities. Favorites are resolved against the current character and saved locally per Foundry instance, world and character.
- **Session:** short/long rests, individual Hit Dice, inspiration, death saves, conditions and concentration saves/end. Rests honor Foundry permissions and do not advance world time or bastion turns. Death saves appear when eligible.
- **Combat:** current round, visible current combatant and your initiative, with an optional local turn alert. Hidden combatant names are withheld.
- **Features:** use supported native activities with Foundry resource consumption. Recent activity cards retain attack/damage/healing follow-ups, including after an automatically deleted consumable.
- **Spells:** search, preparation toggles and level, school, concentration and ritual filters. Always-prepared spells cannot be unprepared here.
- **Inventory/Resources:** item search, attunement, moving items into existing containers and currency edits. Container cycles and foreign-character containers are rejected.
- **Display:** per-character theme, font size and turn-alert preference. Portraits use authenticated, bounded same-origin raster delivery; unsupported images use the fallback.
- **Administration:** friendly device names and last-seen timestamps alongside loaded-world connection status and player mappings.

The complete live browser flow passed on 2026-09-20 in the disposable test world, including native rests, Hit Dice, death saves, consumable use and follow-up healing, spell preparation, attunement, containers, currency, portrait display and device renaming. Physical Large/XL touch behavior still needs the Edge hardware.
