FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS node
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app/foundry-edge-connector
COPY foundry-edge-connector/package.json foundry-edge-connector/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY release/component-versions.json /app/release/component-versions.json
COPY foundry-edge-updater/src/identity.js foundry-edge-updater/src/errors.js /app/foundry-edge-updater/src/
COPY foundry-edge-connector/src ./src
COPY foundry-edge-connector/public ./public
COPY foundry-edge-widget/widget /app/foundry-edge-widget/widget
RUN mkdir /data && chown pwuser:pwuser /data
USER pwuser
ENV NODE_ENV=production
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8790/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/start.js"]
