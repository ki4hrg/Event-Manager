# Event Manager

Internal tool for staff who run conferences and events: contracts, vendors, rooms and schedules,
speakers, catering, AV, hotels and RFPs, with shareable reports and an MCP connector for Claude.
Multi-tenant: each organization sees only its own events.

## Run it locally

Needs Node 24 and Docker.

```bash
cp .env.example .env                               # then set NEXTAUTH_SECRET
docker compose -f docker-compose.dev.yml up -d     # Postgres on localhost:5432
npm ci
npm run db:deploy && npm run db:seed               # schema, default options, admin user
npm run dev                                        # http://localhost:3000
```

The seed creates `admin@example.com` / `admin123`. Change it before the database holds anything
real.

## Checks

`npm run typecheck && npm run lint && npm run build`. CI runs the same on every pull request, plus
`npm audit --audit-level=high`.

## Deploy

GitHub Actions builds `ghcr.io/ki4hrg/event-manager` on `main` and triggers the Dockhand webhook;
`docker-compose.yml` only pulls that image. Environment, volumes, rollback and the revision check:
`docs/DEPLOYMENT.md`.

## Docs

`CLAUDE.md` (rules for agents) · `docs/ARCHITECTURE.md` (how it's built) ·
`docs/multi-tenancy.md` · `docs/oauth-mcp.md` · `docs/hotels.md` · `docs/forms.md` ·
`docs/checklists/` · `docs/DEPLOYMENT.md` · `docs/DECISIONS.md` · `docs/HANDOFF.md` (standards sweep status).
