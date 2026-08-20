# syntax=docker/dockerfile:1
#
# Trademart frontend - Next.js 15 App Router.
#
# Built with `output: 'standalone'` (see next.config.mjs) so the runtime image
# contains only the traced subset of node_modules that the server actually
# needs, instead of the whole dependency tree.
#
# IMPORTANT: every NEXT_PUBLIC_* value is inlined into the browser bundle at
# BUILD time, so NEXT_PUBLIC_API_BASE_URL is a build arg, not just a runtime
# env var. It must be a URL the visitor's browser can resolve - the default `/api`
# is same-origin through nginx, which also sidesteps the backend's CORS allowlist.
#
# NOTE: no package-lock.json is committed in this repo, so `npm install` is used
# instead of `npm ci`. Commit a lockfile and switch to `npm ci` when you want
# byte-reproducible builds.

# ---------------------------------------------------------------- deps --------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# --------------------------------------------------------------- build --------
FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json next.config.mjs tsconfig.json ./
COPY src ./src

RUN npm run build

# ------------------------------------------------------------- runtime --------
FROM node:22-alpine AS runtime

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# .next/standalone already contains server.js, package.json and a minimal
# node_modules. Static assets are not traced into it and must be copied.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
