# Foundry Edge widget and web preview

`widget/preview.html` is the live character dashboard served by the connector. Refresh the hosted preview and select **Attacks** to see weapon attack activities. Each entry offers **Attack** (normal, advantage or disadvantage) and **Damage** (normal or critical). Choose weapon mode and ammunition in the confirmation dialog. Native Foundry attack rules may consume ammunition or thrown weapons; damage rolls do not apply target HP changes. The Attacks tab also provides initiative: existing combat entries are updated; otherwise an initiative roll is posted to chat.

The first hardware package still uses a diagnostic entry point. It records the actual Large/XL viewport and checks HTTPS access to the connector without sending credentials or modifying characters.

With Node 24 or newer:

```powershell
npm test
npm run build -- https://your-connector.example/edge
```

The build writes `dist/` and grants network permission only for the supplied host/port. Import using your iCUE custom-widget workflow; actual iCUE compatibility remains unverified. If the host changes, rebuild the package. The diagnostic uses native ES modules; module loading is part of the hardware check before selecting the production bundle format.

Do not put credentials in the address. The connector `/health` response must contain `service: "foundry-edge-connector"` and `protocol: 1`.

## Expanded web controls

- **Spells:** cast supported prepared spell activities, choose a standard or pact slot and upcast level. Foundry consumes resources and handles concentration. Recent casts provide separate attack, damage and healing rolls without consuming another slot.
- **Inventory:** expand an item to equip/unequip it or set its quantity.
- **Resources:** set remaining spell slots, character resources and item uses within their current maximums.
- **Details:** edit name, alignment, appearance, personality traits, ideals, bonds, flaws and physical details. These controls edit plain text, not derived statistics or class advancement.

Edits carry the value originally shown and reject a detected conflict. Native Foundry changes remain authoritative; this is optimistic conflict detection, not a transaction locking out other Foundry clients.

Casting supports attack, damage, healing, saving-throw and utility activities. Targets, templates, saving throws by other creatures and applying effects/damage are resolved in Foundry. Activities requiring separate scene/configuration workflows (such as summoning, enchanting or transforming) are marked for use in Foundry. Recent cast follow-ups last ten minutes within the same service session; use the Foundry chat card after expiry or restart.

Verification: 2026-09-20 live Xeneon Edge Test checks covered standalone/combat initiative, equipment, quantity, uses, resources, slots, alignment, upcasting, attack, critical damage, healing and concentration. No physical iCUE claim is made before hardware arrives.
