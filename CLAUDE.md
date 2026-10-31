# Event Manager

Internal tool for staff who run conferences and events: contracts, vendors, rooms and schedules,
speakers, catering, AV, hotels, RFPs. Not attendee-facing. Multi-tenant: every domain row belongs
to a `Tenant` (an organization); users are global and hold a role per tenant membership.

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 on PostgreSQL · NextAuth 5 (credentials,
JWT) · Tailwind v4 · npm. Follows https://github.com/ki4hrg/standards (Next.js app profile); the
`standards` plugin is enabled in `.claude/settings.json` and its `ship` skill is how work lands.
How it's built: `docs/ARCHITECTURE.md` (route guards, archetypes, conventions, reports, MCP) ·
tenancy: `docs/multi-tenancy.md` · MCP OAuth: `docs/oauth-mcp.md` · hotels: `docs/hotels.md` ·
checklists: `docs/checklists/` · sweep status: `docs/HANDOFF.md`.

## Commands

- `npm run dev` needs `.env` (copy `.env.example`) and a database:
  `docker compose -f docker-compose.dev.yml up -d`, then `npm run db:deploy && npm run db:seed`.
- `npm run typecheck && npm run lint && npm run test && npm run build` pass before anything is
  called done. `test` is Vitest against a real Postgres that Testcontainers starts (Docker must be
  running); `test/fixtures.ts` builds tenants, users and roles. Tests sit next to the code
  (`core.test.ts`) and cover refusals: bad input, wrong user, wrong tenant.
- `npm run db:migrate` creates and applies a migration after a schema change. Migrations in
  `prisma/migrations/` are what ship; the image runs `migrate deploy`. `npm run db:push` is for
  throwaway databases only, never a populated one.
- On a small machine, cap the heap for typecheck and build: `NODE_OPTIONS=--max-old-space-size=1536`.

## Rules that are easy to break

**Auth and boundaries**

- **The proxy is the first layer, never the only one.** `src/proxy.ts` gates every request except
  the public surfaces and the large-body routes in the route-guard table (`docs/ARCHITECTURE.md`).
  Every Server Action and route handler still starts with its own guard: `requirePermission(...)`
  (`@/lib/permissions`), `requireAuth()` for signed-in-only actions, `requireSuperAdmin()` for
  platform admin. Keep the table current when a route's guard changes.
- **Every export of a `"use server"` file is a public RPC endpoint**, registered on each route that
  imports it, including `/share/*`. So: only async functions there; cores that take a `userId` live
  in a sibling `core.ts` without the directive; readers the share views use
  (`src/app/events/reports/data.ts`, `getEvent` in `src/app/events/event.ts`) live in plain
  modules, call no auth guard and take the tenant from the event, never the session.
- **Large-body routes** (the standards' body-limit rule): the ones that skip the proxy are listed
  in the route-guard table; each caps its body with `uploadBodyRefusal` (`src/lib/uploads.ts`).
- **Anything reading `AUTH_SECRET` falls back to `NEXTAUTH_SECRET`**, the only secret the compose
  files provision (`getOAuthSigningSecret` in `src/lib/auth.ts`).
- **MCP tools and cores use `requirePermissionForUser(userId, resource, action, target)`**, which
  throws `PermissionError`; `target` is an event id or `{ tenantId }`, never omitted. MCP tools call
  `*Core` functions, never Server Actions (those read the session).

**Data**

- **Tenant scope on every query.** Tenant-owned lookups by id are `findFirst({ where: { id,
  tenantId } })` (or `update`/`delete` with both), never a bare `findUnique`: a foreign id must read
  as not-found. Never accept a tenant id from the client; actions use the active tenant, share
  views use `getOptionsForEvent`.
- **Event ownership.** Event-scoped writes put the event in the `where`; every client-supplied
  foreign id is proven against the event or its tenant first (`assertEventRefs` / `partyRefs` in
  `src/lib/eventRefs.ts`), and bulk actions narrow `ids` to the event's rows. Any list that returns
  events ANDs in `eventScopeWhere(userId, tenantId)`, or it leaks events the caller can't open.
- **Helpers that use the global `prisma`** (`autoAssignDefaultWorkflowsCore`,
  `resolveCreateStatus`, `refreshWorkflowStatus`) can't join a `$transaction`: call them before or
  after it.
- **Functions:** cores that create, delete or reschedule them call `syncFunctionNumbers(eventId)`
  after writing and `retireFunctionNumbers` before deleting. Show or pick a function by
  `formatFunctionLabel` (`src/lib/functionNumbers.ts`), selecting `functionNumber` and
  `breakoutGroup.name`.
- **Option-label columns** (`FunctionSchedule.type` and similar) store a `CustomOption` label;
  resolve a default (`defaultScheduleType()`), never hard-code one, or rows drop out of filters.
- **New tenant defaults** go in `prisma/tenantDefaults.mjs`, not `prisma/seed.mjs`.

**UI**

- **Refusals reach the person.** In production a thrown Server Action message becomes "Minified
  React error #441" (#252). Cores throw `UserFacingError`; an action called from `useTransition`
  wraps its own body (after the permission check) in `withUserErrors`, which returns `{ error }`,
  and the client shows `isUserError(result)` (`src/lib/userErrors.ts`). Wrapping on the client
  catches nothing: by then the message is gone.
- **Never call a function exported from a `"use client"` module on the server**: it's a proxy there
  and throws at render. Shared pure helpers go in `src/lib/`.
- **Reports** render a mobile card layout and a desktop/print table, print from their own `/print`
  route (never `window.print()` on the interactive page), and are wired into five share surfaces
  (`docs/checklists/share-report-integration.md`; a missed group surface throws at runtime). Never
  a "Multiple" rollup row: split along the dimension that caused it.

**Accepted project conventions** (detail in `docs/ARCHITECTURE.md`)

- No global client-state library (Zustand, Jotai, Redux, SWR, React Query): React built-ins, URL
  search params and the `UserSetting` table.
- Filter state lives in URL search params; `__blank__` is the one "no value" sentinel, `""` means
  all. Validate list params against an allowed set; an unknown value means no filter.
- Per-user preferences go in `UserSetting` (`@/lib/userSettings`), not cookies or localStorage
  (except the theme choice, which the design standard applies before first paint).
- No `cn()` / `clsx` / `tailwind-merge`: template literals plus `src/lib/buttonStyles.ts`,
  `reportStyles.ts`, `statusConstants.ts`, `colors.ts`.
- No `error.tsx`, `not-found.tsx` or `loading.tsx`: `notFound()` and Next's defaults.
- Server Action returns: `void` after `redirect()` from a form (with `?success=` for the toast),
  `void` for bulk actions the client follows with `router.refresh()`, `{ error }` only through
  `withUserErrors`. After create, thin entities (User, Event, Venue, Contact) redirect to their
  list, ones that need setup (Vendor, orders, Presentation, Function) to the detail page;
  duplicates go to the new copy, updates stay on the detail page.
- Close every switch or if-chain over a union or enum with a `never` exhaustiveness check.

## Layout

- `src/app/` App Router: pages, colocated `actions.ts` (`"use server"`) and `core.ts` (plain),
  feature components. `src/app/(admin)/` admin segments, each gated by its `layout.tsx`.
  `src/app/share/` public share views · `src/app/f/` public forms · `src/app/api/`, `src/app/mcp/`
  route handlers.
- `src/lib/` helpers and singletons (`prisma`, `auth`, `permissions`, `tenant`, `uploads`,
  `email`), `src/lib/mcpTools/` MCP tool registry · `src/components/` components shared by two or
  more features · `src/types/` module augmentations.
- `prisma/` schema, migrations, seed, tenant defaults · `scripts/` one-off CLI scripts (the only
  place besides the seed that may `new PrismaClient()`) · `workers/email-inbound/` Cloudflare Email
  Worker.
- `docs/plans/` multi-PR plans · `docs/proposals/` feature proposals · `reviews/` past review
  output and `reviews/refactors/candidates.md` (refactors parked for later).

## Exceptions to the standards

These differ from the standards on purpose or until a sweep phase lands (`docs/HANDOFF.md`):

- Stack (phase 6, out of scope): npm, Prisma, NextAuth, a hand-rolled MCP JSON-RPC endpoint.
- Few tests yet, and no runtime input validation at most entry points (phase 3 in progress).
- Raw palette classes with `dark:` variants instead of design tokens (phase 5).
- Postgres keeps `PGDATA=/var/lib/postgresql/data` on its existing volume: moving to the standard
  mount means migrating production data (accepted 2026-10-31).

## Proposing rules

A rule you learn on the job goes in `docs/claude-candidates.md` (date, rule, why, PR), not here.
When a change moves, renames or removes something this file or `docs/` names, update it in the same
PR.
