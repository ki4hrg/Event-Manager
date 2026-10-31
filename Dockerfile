# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Prisma needs a well-formed URL to initialize at build time; nothing connects.
ENV DATABASE_URL="postgresql://build@localhost:5432/build"
# The build cache is never read by `next start`; keep it out of the image.
RUN npm run build && rm -rf .next/cache

# --- runtime ---
# Not `output: "standalone"`: the entrypoint also runs the Prisma CLI
# (baseline, migrate deploy) and the seed, so the full node_modules ships,
# dev dependencies included (the CLI is one).
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
# Listen on every interface; the default binds to the container hostname only.
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY docker-entrypoint.sh /usr/local/bin/
# COPY keeps the source file's mode; set the bit here so a commit without it
# can't produce a container that exits with `permission denied`.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data/uploads && chown node:node /data/uploads

# Last, so a new commit doesn't invalidate the layers above. "dev" matches
# src/lib/env.ts for a build without the CI build arg.
ARG GIT_REVISION=dev
ENV GIT_REVISION=$GIT_REVISION

# Non-root: the image's built-in `node` user (uid 1000). An uploads volume
# created by an earlier, root image needs a one-off chown to 1000:1000
# (docs/DEPLOYMENT.md); the entrypoint refuses to start the server without it.
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
