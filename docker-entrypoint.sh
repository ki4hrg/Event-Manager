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

# Setup runs only for the server. A one-off command (`docker run <image> …`) gets
# the URL above and nothing else: no migrations or seed applied behind it.
if [ "$*" = "npm run start" ]; then
  # Uploads must be writable by this user (uid 1000); an old root-owned volume
  # isn't until it's chowned (docs/DEPLOYMENT.md). Fail here, loudly, rather
  # than serve with every upload failing.
  dir="${UPLOAD_DIR:-/data/uploads}"
  if ! { mkdir -p "$dir" && touch "$dir/.write-check" && rm -f "$dir/.write-check"; } 2>/dev/null; then
    echo "UPLOAD_DIR $dir is not writable by uid $(id -u). Run the one-off chown in docs/DEPLOYMENT.md." >&2
    exit 1
  fi
  # Baseline a pre-Migrate database, apply migrations, seed defaults.
  node prisma/baseline.mjs
  npx prisma migrate deploy
  node prisma/seed.mjs
fi

exec "$@"
