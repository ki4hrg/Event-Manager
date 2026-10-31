# syntax=docker/dockerfile:1

# --- deps ---
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:24-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Prisma needs a well-formed URL to initialize at build time; nothing connects.
ENV DATABASE_URL="postgresql://build@localhost:5432/build"
RUN npm run build

# --- runtime ---
# Not `output: "standalone"`: the start command also runs the Prisma CLI
# (baseline, migrate deploy) and the seed, so the full node_modules ships,
# dev dependencies included (the CLI is one).
FROM node:24-alpine AS runtime
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Listen on every interface; the default binds to the container hostname only.
ENV HOSTNAME=0.0.0.0
ARG GIT_REVISION=unknown
ENV GIT_REVISION=$GIT_REVISION

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

# Non-root: the image's built-in `node` user (uid 1000). An uploads volume
# created by an earlier, root image needs a one-off chown to 1000:1000
# (docs/DEPLOYMENT.md).
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
