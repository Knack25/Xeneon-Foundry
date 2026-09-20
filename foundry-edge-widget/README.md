# Foundry Edge widget and web preview

`widget/preview.html` is the live character dashboard served by the connector. Refresh the hosted preview and select **Attacks** to see weapon attack activities. Each entry offers **Attack** (normal, advantage or disadvantage) and **Damage** (normal or critical). Choose weapon mode and ammunition in the confirmation dialog. Native Foundry attack rules may consume ammunition or thrown weapons; damage rolls do not apply target HP changes. Spell attacks and initiative are not included in this increment.

The first hardware package still uses a diagnostic entry point. It records the actual Large/XL viewport and checks HTTPS access to the connector without sending credentials or modifying characters.

With Node 24 or newer:

```powershell
npm test
npm run build -- https://your-connector.example/edge
```

The build writes `dist/` and grants network permission only for the supplied host/port. Import using your iCUE custom-widget workflow; actual iCUE compatibility remains unverified. If the host changes, rebuild the package. The diagnostic uses native ES modules; module loading is part of the hardware check before selecting the production bundle format.

Do not put credentials in the address. The connector `/health` response must contain `service: "foundry-edge-connector"` and `protocol: 1`.
