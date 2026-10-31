# Decisions

Project decisions that differ from or add to the standards, newest last. Each says why and what
was rejected.

## 2026-10-31: Postgres keeps its `PGDATA=/var/lib/postgresql/data` mount

The standard mounts Postgres 18's volume at `/var/lib/postgresql` (PG18 keeps data in a version
subdirectory). Production's `postgres_data` volume was created at `/var/lib/postgresql/data`, with
`PGDATA` pinned to that path so PG18 uses it. Moving it means a dump and restore of production
data for no functional gain, so the mount stays. Rejected: migrating the volume. Revisit at the
next Postgres major upgrade, which needs a dump and restore anyway. Accepted by John in the
standards conformance audit.

## 2026-10-31: The database password goes into `DATABASE_URL` at container start

The standard passes `DATABASE_URL` without a password plus `PGPASSWORD`, so a `/` or `@` in the
password can't break URL parsing. Prisma doesn't read `PGPASSWORD`: with the password left out of
the URL, both the CLI (`migrate status`) and the client fail authentication, which was checked
against Postgres 16. So compose still passes a password-free URL and `PGPASSWORD`, and
`docker-entrypoint.sh` puts the password into `DATABASE_URL`, percent-encoded, before anything
connects. Rejected: the password written into `DATABASE_URL` in compose, which breaks on special
characters.

## 2026-10-31: Environment checked at boot; the readers keep `process.env`

`src/lib/env.ts` lists every variable with a zod schema and runs at server start from
`src/instrumentation.ts`. The modules that already read env (`lib/auth`, `lib/email`,
`lib/uploads`, `lib/prisma`) still read `process.env`: `lib/auth` reads `NEXTAUTH_URL` at import
time, which `next build` does without secrets, so routing it through the schema would fail the
image build. Rejected for now: reading every variable through `env()`. That needs those reads made
lazy first.
