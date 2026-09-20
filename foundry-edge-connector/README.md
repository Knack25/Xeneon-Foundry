# Foundry Edge connector

Node 24 service for individually paired devices, active-world player mappings, authorized character reads, native D&D actions and a supervised Foundry browser. The service account is a dedicated Player/Trusted Player with ownership of supported PCs. No GM login is used by the deployed connector.

Hosted test deployment: **https://edge.foundry.jewinashoe.org**. Administration: `/admin`. Only `xeneon-edge-test` is configured; loading an unconfigured world disconnects character access.

## Development

Run `npm ci`, then `npm test`. The repository launchers use separately protected credential files. `node src/server.js` without configuration still runs only the loopback health diagnostic.

`tests/admin-browser.mjs` exercises the actual browser flow against disposable test fixtures. Set `PREVIEW_ADMIN_KEY_FILE` to a protected administrator-key file and optionally `PREVIEW_URL` to the hosted origin. It creates and revokes its own device. It expects Edge Test Player, Edge Other Player, Edge Test Scout and Edge Other Hero fixtures.

## Container deployment

Build from the repository root: `docker build -f foundry-edge-connector/Dockerfile -t foundry-edge:0.1.0 .`. The Dockerfile-specific allowlist excludes secrets, databases, browser state and unrelated projects. Base image digests are pinned; npm uses the lockfile.

Create `secrets/foundry.json` alongside `compose.yaml`:

```json
{
  "url": "https://foundry.example.org",
  "worlds": {
    "world-id": { "userId": "SERVICE_USER_ID", "password": "SERVICE_PASSWORD" }
  }
}
```

Create a separate random administrator key of at least 32 characters in `secrets/admin-key.txt`. These are read-only mounts, never image layers or public world settings. Verify the image user with `docker run --rm --entrypoint id foundry-edge:0.1.0`; the pinned image uses UID/GID **1001**. Give this user read access to the secret files (mode600), and keep the host secret directory private.

Set `PUBLIC_URL` and the Traefik hostname in `compose.yaml`. Set `TRUSTED_PROXY_IPS` in an adjacent `.env` file to the exact proxy source address seen by this container. This deployment uses Docker gateway `172.16.5.1` because Traefik runs in host networking. Recheck it after recreating the network. Forwarded headers are ignored unless the socket peer is explicitly trusted; the nearest forwarded client address is validated. Login/pairing limits allow five failed attempts per minute per address; successful requests do not consume that limit.

Start with `docker compose -p foundry-edge up -d --no-build`. The host port binds only to loopback; Traefik exposes HTTPS. `/health` reports liveness plus the public release identity; `/ready` reports the same identity and returns 503 while Foundry is disconnected. The release object contains connector/dashboard versions, supported protocol range, data-schema version and `automaticInstall:{enabled:false,reason:"release-source-not-configured"}`. It contains no credentials. The browser has no exposed debugging port and uses a small viewport, no-canvas/low-motion client settings and bounded reconnect backoff. Chromium's [WebGL-only software fallback](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md) avoids the excessive CPU observed when emulating all GPU compositing.

## Operations

- Use `/admin` to issue single-use 10-minute codes, map devices in the loaded world and revoke devices. Give players only their pairing codes.
- Back up `edge-data` and private secrets. For a consistent backup, stop only the connector, archive its named volume, then start it. Do not edit live SQLite files.
- Rotate the administrator key by replacing its private file and recreating the connector. Admin sessions expire; device pairings persist. Rotate service passwords in Foundry and their config entries together, then recreate the connector.
- Browser replacement changes connection generation. Unacknowledged actions remain unknown and never automatically replay. Completed request status and mappings persist in SQLite.
- Browser profiles are ephemeral. Client preferences reset on reconnect; connector rendering settings are reapplied. Game state stays in Foundry.
- Test upgrades against the supported Foundry/D&D versions. Keep matching database backups for rollback if a future schema migration is incompatible.

Device administration supports friendly names and last-seen timestamps. The additive SQLite migration preserves existing pairings. Only successful device authentication updates last seen; administrator reads do not. Renaming requires the administrator session and CSRF token.

Authenticated character portraits are available through `/v1/characters/:id/portrait`, with current mapping and scope checks. The module restricts delivery to bounded same-origin raster images.

Target: Foundry **14.367**, D&D5e **5.3.3**. This is a deployed test-world beta. Second-world transition checks and physical iCUE release remain pending. See [compatibility evidence](../docs/foundry/compatibility-14-5.3.3.md).

## Update safety foundation

The service session reports active Foundry users every three seconds; a report older than fifteen seconds, a disconnect or malformed data is unknown rather than an empty world. A maintenance attempt requires five uninterrupted minutes with no active user except the configured service account. Players and GMs reset the timer.

Open dashboard confirmations hold a 45-second device-owned lease renewed every 15 seconds. Normal sheet polling does not. Accepted, dispatched and outcome-unknown durable commands block maintenance. Once maintenance admission closes, new commands receive `maintenance` with HTTP 503 and are not inserted, while an existing request ID remains readable for safe idempotent status handling.

This is only a safety gate. The connector does not check for, download or install releases, and `automaticInstall.enabled` remains `false`. It has no production signing key/source, updater polling loop, Docker socket, updater control channel, staging, replacement, backup/recovery or update UI. No production Foundry module `manifest`/`download` URLs exist until a signed test-channel release is published and exercised.
