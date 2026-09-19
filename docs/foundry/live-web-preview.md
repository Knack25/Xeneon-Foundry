# Live web preview

Run **Start Foundry Preview.cmd** from the repository. It opens <http://127.0.0.1:8791> and displays a short-lived pairing code. Enter that code once. Pairing persists in this browser's local storage; use **Forget device** to remove it.

This development launcher uses the protected test-account file prepared locally during setup. No password belongs in source control or a URL. It runs only on this PC, binds to loopback, and connects only to the configured `xeneon-edge-test` world. The preview's background Foundry browser uses **Edge Service**, a Trusted Player account. The player's ordinary browser is not required.

The preview shows the mapped player's owned PCs, HP, AC, abilities, saves, skills, and read-only spells, inventory, features and resources. Damage, healing, replacement temporary HP, checks, saves and skill rolls modify the **live test character**. Chat retains the service author and identifies the requesting player and selected character.

It polls Foundry every three seconds. Changing the world or losing access clears the sheet. Requests have persistent IDs; uncertain actions are never automatically replayed. Use **Check action status** after a lost response and inspect Foundry before deliberately repeating an action.

## Verified on 2026-09-19

- Foundry 14.367, D&D 5e 5.3.3, Edge Chromium browser.
- Pairing, character load, a temp-HP change and restoration, one skill roll, and pairing persistence after page reload.
- 1100×650 browser viewport with no horizontal overflow or JavaScript errors.
- Browser regression: ownership loss hides the previous sheet before a delayed replacement finishes loading.
- Native adapter separately verified damage absorption, healing limit, check/save/skill rolls, and private-mode rejection.

This is a working development preview, not the completed standalone deployment. Still pending: full admin UI, protected portraits, additional test characters and two-player/world-transition acceptance checks, Linux browser supervision/deployment, release packaging, and physical Large/XL iCUE testing. The widget build still opens the connection diagnostic; this preview has its own entry point. Browser local storage does not establish compatibility with iCUE storage.
