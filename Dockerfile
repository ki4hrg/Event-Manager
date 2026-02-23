FROM node:20-alpine AS base

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

# Run migrations, seed, then start
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node prisma/seed.mjs && npm run start"]
