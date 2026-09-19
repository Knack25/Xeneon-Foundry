# Foundry Edge widget (compatibility diagnostic)

This is the first diagnostic, not the character dashboard. It records the actual Large/XL viewport and checks HTTPS access to the connector without sending credentials or modifying characters.

With Node 24 or newer:

```powershell
npm test
npm run build -- https://your-connector.example/edge
```

The build writes `dist/` and grants network permission only for the supplied host/port. Import using your iCUE custom-widget workflow; actual iCUE compatibility remains unverified. If the host changes, rebuild the package. The diagnostic uses native ES modules; module loading is part of the hardware check before selecting the production bundle format.

Do not put credentials in the address. The connector `/health` response must contain `service: "foundry-edge-connector"` and `protocol: 1`.
