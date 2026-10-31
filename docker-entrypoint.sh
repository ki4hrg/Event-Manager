#!/bin/sh
set -e

# The password travels beside the URL (PGPASSWORD), not inside it, so a `/`,
# `@` or `%` in it can't break URL parsing. Prisma doesn't read PGPASSWORD
# (checked 2026-10-31), so put it into DATABASE_URL here, percent-encoded.
if [ -n "$PGPASSWORD" ]; then
  DATABASE_URL="$(node -e '
    const u = new URL(process.env.DATABASE_URL);
    u.password = encodeURIComponent(process.env.PGPASSWORD);
    process.stdout.write(u.toString());
  ')"
  export DATABASE_URL
fi

# Baseline a pre-Migrate database, apply migrations, seed defaults; then start.
node prisma/baseline.mjs
npx prisma migrate deploy
node prisma/seed.mjs
exec "$@"
