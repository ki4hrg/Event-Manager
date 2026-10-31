# Deployment

## How it ships

1. A PR runs `ci.yml`: typecheck + lint (`check`), `npm audit --audit-level=high` (`security`), and
   an image build that isn't pushed (`image`). With the `automerge` label, merge-on-green merges it
   once those pass and dispatches `ci.yml` on `main`.
2. On `main`, `image` builds `ghcr.io/ki4hrg/event-manager` for `linux/amd64` (the host's
   architecture) and pushes `:main` and `:sha-<commit>`, passing the commit as `GIT_REVISION`.
3. `deploy` calls the Dockhand git-stack webhook (a plain `GET` with `?secret=`) and fails unless the
   reply says `"success": true`. Dockhand redeploys the `event-manager` stack from
   `docker-compose.yml`, which only pulls (`pull_policy: always`, no `build:`).
4. On start, `docker-entrypoint.sh` puts the database password into `DATABASE_URL`, runs
   `prisma/baseline.mjs` (marks the `0_init` migration applied on a database that predates
   Migrate), `prisma migrate deploy` and the seed, then `next start`. `src/instrumentation.ts`
   checks the environment before the server takes requests (`src/lib/env.ts`); a bad one stops
   the container with the list of problems in its log.

## What's running

`GET /api/health` returns `{ "ok": true, "revision": "<commit>" }`. Compare the revision with the
commit you expect, not the tag. From the host:
`docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' event-manager-app`.

## Environment

Set in the Dockhand stack's environment. Compose refuses to start without the first three.

| Variable | Required | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | yes | The database password. Postgres reads it only when the volume is first created, so for the existing production volume it must be the password that volume was created with (`postgres`). Changing it means `ALTER USER postgres PASSWORD …` in the database first, then this variable. |
| `NEXTAUTH_SECRET` | yes | Signs sessions and the MCP OAuth tokens. At least 32 characters, not the example value (`openssl rand -base64 32`). Changing it signs everyone out and invalidates MCP connector tokens. |
| `NEXTAUTH_URL` | yes | The public HTTPS origin, e.g. `https://events.example.com`. OAuth discovery, email links and the secure-cookie choice derive from it. |
| `PORT` | no | Host and container port, default 3000. |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` | together | Account invites and password reset. `MAILGUN_FROM`, `MAILGUN_BASE_URL` (EU region) optional. |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | together | Event inboxes; the secret is shared with the Cloudflare Email Worker (`workers/email-inbound/`). |
| `ANTHROPIC_API_KEY` | no | Reads inbox mail. Blank leaves mail for staff to handle by hand. |
| `APP_IMAGE` | no | Pin a specific image (`ghcr.io/ki4hrg/event-manager:sha-<commit>`) to roll back. |

`UPLOAD_DIR` and `MAX_UPLOAD_BYTES` keep their image defaults (`/data/uploads`, 100MB).
`GIT_REVISION` comes from the image.

## Volumes

- `postgres_data` at `/var/lib/postgresql/data`, with `PGDATA` pinned to it. The standard mount for
  Postgres 18 is `/var/lib/postgresql`; this one predates it (docs/DECISIONS.md).
- `uploads_data` at `/data/uploads`. The app runs as the image's `node` user (uid 1000). A volume
  written by the earlier root image needs a one-off chown before the first non-root deploy:

  ```sh
  docker run --rm -v event-manager_uploads_data:/data alpine chown -R 1000:1000 /data
  ```

  Check the volume name with `docker volume ls | grep uploads`. Without it, existing files still
  download but new uploads fail with a permission error.

## Rolling back

Set `APP_IMAGE` to the previous `:sha-<commit>` and redeploy, or revert the commit on `main`.
Migrations only go forward; a rollback across a migration needs the database restored too.

## Backups

Not automated yet. Before anything risky:
`docker exec event-manager-db pg_dump -U postgres event_manager > event_manager-$(date +%F).sql`,
and copy the uploads volume.
