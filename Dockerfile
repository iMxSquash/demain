# One image for linux/amd64 and linux/arm64 (ADR-004).
FROM node:26-bookworm-slim AS build

# Next.js sends anonymous telemetry unless told otherwise: nothing leaves the
# server by default.
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# better-sqlite3 ships its prebuilt binaries for both architectures inside the
# package, but npm would still run node-gyp because of its binding.gyp: skipping
# the install scripts avoids needing Python and a compiler in the image.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build && npm prune --omit=dev


FROM node:26-bookworm-slim

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# The full source tree is not needed to serve the app, but `scripts/`, `src/` and
# `drizzle/` must ship so that `node scripts/reset-password.ts` works inside the
# container (Node 24 runs TypeScript natively). `messages/` is read at runtime.
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/messages ./messages

# A named volume mounted here inherits this ownership on first use.
RUN mkdir /data && chown node:node /data

USER node
EXPOSE 3000

# DEMAIN_DATA_DIR is deliberately not set here: a missing required variable must
# stop the container (see src/instrumentation-node.ts).
CMD ["node", "node_modules/next/dist/bin/next", "start"]
