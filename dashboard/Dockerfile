# The management console, built for production and served by its own Node
# server. Mirrors web/Dockerfile — same multi-stage shape, so the shipped image
# carries the build output and nothing else.
#
# The one deliberate difference is the port: 3002, matching the dev script, so
# the Cloudflare tunnel route for console.virgo.ph points at `dashboard:3002`
# and there is one number to remember rather than two.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, not read at runtime, so the
# API URL has to be known here. It is a public URL, not a secret.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

# Not root: a compromised render should not be able to write the image.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# `standalone` bundles only the modules actually reached, which is a fraction
# of node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3002

# node's global fetch rather than curl or wget: this image is Next's standalone
# output on alpine and ships neither, so a curl-based check would report
# unhealthy for the rest of the container's life without ever reaching the app.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
