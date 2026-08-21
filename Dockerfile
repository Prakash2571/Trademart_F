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
# REPRODUCIBLE BUILDS
# -------------------
# `npm ci` only, from a committed package-lock.json. The previous
# `package-lock.json*` wildcard and `npm install` fallback have been removed on
# purpose: they made the image buildable without a lockfile, which meant the
# image contained whatever versions were newest that day. The COPY below now
# fails immediately if the lockfile is absent, which is the intended behaviour -
# an unreproducible production image is worse than a failed build.
#
# To create it (needs network access to the npm registry):
#   npm install --package-lock-only && git add package-lock.json
#
# BASE IMAGE PINNING
# ------------------
# Pinned to a specific Node minor + Alpine version so a base-image refresh
# cannot silently change the runtime under a deployed app.
ARG NODE_IMAGE=node:22.14.0-alpine3.21

# ---------------------------------------------------------------- deps --------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --------------------------------------------------------------- build --------
FROM ${NODE_IMAGE} AS build
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
FROM ${NODE_IMAGE} AS runtime

RUN apk add --no-cache dumb-init

# Build metadata so a deployed container can be tied back to a commit.
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG APP_VERSION=0.2.0

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GIT_SHA=${GIT_SHA} \
    BUILD_TIME=${BUILD_TIME} \
    APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="trademart-frontend" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.created="${BUILD_TIME}"

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
