FROM node:25-alpine AS base

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build with dummy DATABASE_URL (not used at build time, just needed for Prisma to initialize)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE ${PORT}

RUN mkdir -p /data/uploads

# Baseline pre-Migrate databases, apply migrations, seed, then start
CMD ["sh", "-c", "node prisma/baseline.mjs && npx prisma migrate deploy && node prisma/seed.mjs && npm run start"]
