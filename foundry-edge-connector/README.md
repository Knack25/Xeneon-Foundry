# Foundry Edge connector (early diagnostic)

Requires Node 24+. Run `npm test`, then `node src/server.js`.

The current service binds only `127.0.0.1:8790` (`PORT` can override the port). It provides a public, non-sensitive `/health` endpoint for the Edge connection check. Put it behind your existing HTTPS reverse proxy for remote hardware testing, stripping any configured path prefix before forwarding. The health endpoint permits cross-origin reads but never credentials.

Device pairing, Foundry browser supervision, subscriptions and remote character commands are not implemented in this diagnostic. Do not expose the Foundry module's local probe API through a generic HTTP/script endpoint.

See the approved spec and implementation plan under `docs/superpowers/` and the compatibility record in `docs/foundry/`.
