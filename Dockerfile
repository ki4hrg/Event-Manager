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

# Build
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE ${PORT}

# Run migrations, seed, then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node prisma/seed.mjs && npm run start"]
