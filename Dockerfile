# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

# Bootstrap the version pinned in package.json; all project installs use pnpm.
RUN npm install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json

FROM dependencies AS build
RUN pnpm install --frozen-lockfile
COPY scripts ./scripts
COPY apps ./apps
RUN pnpm build

FROM dependencies AS production-dependencies
RUN pnpm install --prod --frozen-lockfile

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=production-dependencies /app/apps/server/package.json ./apps/server/package.json

# Match Chromium to the locked Playwright version and include Linux libraries.
RUN echo 'Acquire::Retries "3";' > /etc/apt/apt.conf.d/80-retries \
    && node apps/server/node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && mkdir -p /data \
    && chown node:node /data \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# Keep browser installation cached when only application code or the port changes.
COPY --from=build /app/apps/server/dist ./apps/server/dist
ENV PORT=4500

USER node
EXPOSE 4500
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/', {signal: AbortSignal.timeout(3000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
