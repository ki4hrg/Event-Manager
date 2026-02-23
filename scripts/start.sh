#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma db push --skip-generate

echo "Seeding database..."
npx prisma db seed

echo "Starting application..."
exec node server.js
