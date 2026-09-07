# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

# Bootstrap the version pinned in package.json; all project installs use pnpm.
RUN npm install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json

FROM dependencies AS build
RUN --mount=type=cache,id=parallel-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY scripts ./scripts
COPY apps ./apps
RUN pnpm build

FROM dependencies AS production-dependencies
RUN --mount=type=cache,id=parallel-pnpm,target=/pnpm/store \
    pnpm --filter @parallel/server... install --prod --frozen-lockfile --store-dir=/pnpm/store

# Export only the locked browser driver. Unrelated dependency changes must not
# invalidate the expensive Chromium download and Linux package installation.
FROM production-dependencies AS browser-package
RUN node -e "const fs = require('node:fs'); const path = require('node:path'); const pw = require.resolve('playwright', { paths: ['/app/apps/server'] }); const core = require('node:module').createRequire(pw).resolve('playwright-core/package.json'); fs.cpSync(path.dirname(core), '/browser-tools/playwright-core', { recursive: true });"

FROM node:24-bookworm-slim AS browser-runtime
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=browser-package /browser-tools /opt/browser-tools

# Keep downloaded Linux packages across retries and browser updates.
ARG TARGETARCH
RUN --mount=type=cache,id=parallel-apt-${TARGETARCH},target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=parallel-apt-lists-${TARGETARCH},target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && echo 'Acquire::Retries "3";' > /etc/apt/apt.conf.d/80-retries \
    && node /opt/browser-tools/playwright-core/cli.js install-deps chromium

# A browser download retry can reuse the completed Linux library layer.
RUN node /opt/browser-tools/playwright-core/cli.js install --only-shell chromium \
    && mkdir -p /data \
    && chown node:node /data \
    && chmod -R a+rX /ms-playwright

FROM browser-runtime AS runtime
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=production-dependencies /app/apps/server/package.json ./apps/server/package.json

# Copy application output last so source edits reuse dependencies and Chromium.
COPY --from=build /app/apps/server/dist ./apps/server/dist
ENV PORT=4500

USER node
EXPOSE 4500
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/', {signal: AbortSignal.timeout(3000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
