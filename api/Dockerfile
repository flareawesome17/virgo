# Multi-stage: build with dev dependencies, ship without them.
# The runtime image carries only dist/, migrations/ and production deps.

# ── deps ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
# Copy only the manifests first so this layer is cached until dependencies
# actually change — editing source does not trigger a reinstall.
COPY package.json package-lock.json ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# The migration runner resolves `process.cwd()/migrations`, and WORKDIR is
# /app — so these must land at /app/migrations.
COPY migrations ./migrations

# Drop root. The node image ships this user; copied files stay world-readable.
USER node

EXPOSE 3000

# Node 22 has global fetch, so the health check needs no extra tooling.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
