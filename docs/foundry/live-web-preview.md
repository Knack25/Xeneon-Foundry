# Live web preview

## Hosted dashboard and administration

The always-on test service is **https://edge.foundry.jewinashoe.org**. It runs on the VPS without this PC or a player's Foundry browser staying open. Local preview pairings do not transfer; pair the hosted browser once.

Double-click **Manage Hosted Foundry Edges.cmd**. It opens hosted administration and displays the administrator key in its terminal. Sign in, select **Edge Test Player**, and create a pairing code. Enter that code on the hosted dashboard. The key stays in a protected local file and is never included in the URL.

Administration can change a device's player mapping or revoke it. Revocation clears its sheet on the next poll. Edge Test Player owns Hero and Scout; Edge Other Player owns Other Hero. An owned test NPC is excluded from the selector.

## Local development preview

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

Hosted checks passed switching/reload persistence, cross-player remapping, live revocation and logout. Linux native HP/roll actions and container restart persistence passed. Initial HTTPS browser validation used a temporary test-browser DNS override while negative caches expired; certificate validation remained enabled.

Still pending: protected portraits, second-world transitions, release packaging and physical Large/XL iCUE testing. The widget build still opens the connection diagnostic. Browser storage does not establish iCUE storage compatibility.
