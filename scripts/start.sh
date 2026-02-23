#!/bin/sh
set -e

echo "Running database migrations..."
node node_modules/prisma/build/index.js db push --skip-generate

echo "Seeding database..."
node prisma/seed.mjs

echo "Starting application..."
exec node server.js
