# Event Manager Tool

Internal tool for managing conferences and events: contracts, vendors, facility/room scheduling, speaker logistics, catering, and AV planning. Not attendee-facing — internal staff use only. Multi-tenant: every domain row belongs to a `Tenant` (an "organization"), users are global and hold a role per tenant membership. See § Multi-tenancy.

**Stack**: Next.js 14 (App Router) · TypeScript · PostgreSQL · Prisma 6 · Tailwind v4 · NextAuth 5 (Credentials + JWT). CI (`.github/workflows/build.yml`) lints, builds and pushes `ghcr.io/ki4hrg/event-manager`, then triggers the deploy webhook; Docker Compose runs that prebuilt image (no local `build:`).

## Quick reference

```bash
npm run dev         # Start development server
npm run build       # Production build
npm run lint        # next lint (ESLint)
npm run db:migrate  # Create + apply a dev migration (schema changes ship as prisma/migrations)
npm run db:deploy   # Apply pending migrations (what the Docker CMD runs)
npm run db:push     # Throwaway dev databases only — never on a populated one
npm run db:studio   # Open Prisma Studio
npm run db:seed     # Seed default options + admin user
docker compose up   # Run full stack in containers
```

No test runner and no structured logger ship with the project. Don't add ad-hoc tests, a test runner config, or `console.error` calls for "logging". If observability is ever needed, introduce a logger project-wide rather than peppering call sites.

## Architecture invariants

These are the load-bearing rules. Breaking one breaks the model the rest of the app assumes.

- **App Router only.** Routes live under `src/app/`. Do not create a `pages/` directory.
- **Server Actions are the mutation channel for the UI.** Route handlers (`route.ts`) are reserved for cases Server Actions can't express — the full list is in Archetype G. Do not add JSON CRUD route handlers.
- **No repository / DAL.** Pages, Server Actions, and `src/lib/` helpers all call Prisma directly via the singleton from `@/lib/prisma`. Never `new PrismaClient()` at runtime (`prisma/seed.mjs` and `scripts/*.ts` are the only exceptions — they run outside the Next runtime).
- **Auth is defense-in-depth.** Middleware (`src/middleware.ts`) gates every request except the public surfaces exempted in the `authorized` callback (`src/lib/auth.ts`): `/login`, `/api/auth/*`, `/share/*`, `/forgot-password`, `/reset-password/*`, `/mcp` (own bearer auth via `@/lib/mcpAuth`), `/api/oauth/*`, `/api/well-known/*` + `/.well-known/*` (OAuth discovery), and `/api/health` (container healthcheck). The matcher in `src/middleware.ts` deliberately has no dotted-path exclusion, so `/.well-known/*` reaches `authorized` — adding one would silently change that. Admin route segments add a `layout.tsx` that calls `requirePermission(<RESOURCE>, "VIEW")` (`requireSuperAdmin()` for `/tenants`). Every Server Action also self-protects with `await requirePermission(...)` as its first line — with a carve-out for readers reachable from public routes, documented in § Server Actions.
- **No global client state.** No Zustand / Jotai / Redux / SWR / React Query. Use React built-ins (`useState`, `useTransition`, `useRef`). Cross-request preferences go in the `UserSetting` table.
- **Tenant-scoped data.** Every top-level domain model (Event, EventSeries, Venue, Contact, Vendor, CustomOption, Equipment, StorageLocation, InventoryItem, WorkflowTemplate) carries `tenantId`; event-scoped children inherit the tenant through the event. Every read on those models filters by tenant and every write sets or asserts it — see § Multi-tenancy. Users, Roles, API keys, and OAuth tables are global.

## Route archetypes

Every page belongs to one of these. When adding a new feature, find the closest archetype and replicate it.

### A. Authenticated CRUD list — `src/app/<entity>/page.tsx`
Server component, `export const dynamic = "force-dynamic"`, awaits `get<Entity>()` from sibling `actions.ts`, renders `<PageWrapper>` + `<PageHeader>`. For lists with no client-side state, render rows inline — either a `<table>` when columns aid comparison (`src/app/events/page.tsx`) or a `<div>`-per-row card list for one-detail-per-row layouts (`src/app/events/[id]/print-orders/page.tsx`). Lift to a `*ListClient` (`"use client"`) the moment any of sort / select / filter / bulk edit is needed. New action is a link to `/<entity>/new`.

### B. Form with Server Action — `src/app/<entity>/new/page.tsx`, `src/app/<entity>/[id]/page.tsx`
Server page fetches lookup data, then passes Server Actions as props to a client `*Form`. Pass the raw imported action when its signature already matches the client's expectation. Wrap it in an inline `"use server"` arrow closure when you need to bind context the client shouldn't supply (e.g. an `eventId` from `params`) — see Archetype C. The `*Form` is `"use client"`, uses `useState` for edit/view toggle, and `useFormStatus()` for the pending submit button. The action calls `revalidatePath(...)` then `redirect(...)`. Example: `src/app/events/EventForm.tsx`, `src/app/events/[id]/page.tsx`.

### C. Event-scoped subresource — `src/app/events/[id]/<order-type>/[<id>]/page.tsx`
Awaits `params: Promise<{ id: string; ... }>`, loads dependencies in parallel via `Promise.all([...])`, calls `notFound()` when missing, and wraps remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id before passing them to the client component. Example: `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:62-200`.

### D. Report — `src/app/events/[id]/reports/[name]/`
Three files plus a `print/` route: server `page.tsx`, `ReportFilters.tsx` (client, accepts `basePath`/`hidePrint`/`shareButton` props), `[Name]Report.tsx` (body, also rendered by the share route), and `print/page.tsx` (uses `PrintHeader`). Report data readers live in `src/app/events/reports/data.ts` — a plain module, **not** `"use server"` — and **must not** call any auth guard (`requirePermission` / `requireAuth`) — the share route reuses them. See § Reports.

### E. Unauthenticated share view — `src/app/share/[token]/page.tsx`
Validates `getActiveShareLink(token)` (revoke / expiry), fires `recordShareLinkAccess` as a fire-and-forget update, and branches on `link.reportType` to render the matching report component. Auth is bypassed by the `authorized` callback in `src/lib/auth.ts` for the `/share/*` prefix. The multi-report dashboard share view is a sibling: `/share/group/[token]/page.tsx` (tabs, `?tab=<itemId>` via `router.replace`) and `/share/group/[token]/[itemId]/print/page.tsx`, validated by `getActiveShareLinkGroup`. Each tab namespaces its filter params with `i_${itemId}_` (`itemPrefix()`), so every report's `ReportFilters` takes a `paramPrefix` prop — a new filter must plumb it through or sibling tabs collide. Share views never call `getOptions` (it reads the session's active tenant); use `getOptionsForEvent`.

### F. Admin-only segment — `src/app/{settings,users,workflows}/`
The segment's `layout.tsx` calls `requirePermission(<RESOURCE>, "VIEW")` — or `requireSuperAdmin()` for `/tenants`. Child pages do not re-check (the permission check inside each Server Action covers mutations). Pure-redirect pages can stay plain (`src/app/settings/page.tsx`).

### G. Route handler — `src/app/api/`, `src/app/mcp/`
The current set, by reason:
- Framework callback: `api/auth/[...nextauth]`.
- Multipart upload: `api/upload`.
- Binary stream: `api/files/[fileId]`, `api/events/[id]/esg` (.docx / .xlsx ESG + Post-Event Report downloads).
- MCP connector: `mcp` (JSON-RPC over API-key or OAuth bearer).
- OAuth 2.1 for the connector: `api/oauth/{register,authorize,token,revoke}`, `api/well-known/{oauth-authorization-server,oauth-protected-resource}` (rewritten from `/.well-known/*` in `next.config.mjs`). See `docs/oauth-mcp.md`.
- Container healthcheck: `api/health`.

Add one only when a Server Action can't satisfy the requirement (binary stream, multipart upload, framework callback, protocol endpoint). Authenticated handlers call `requirePermission(...)` first, like Server Actions (`api/events/[id]/esg/route.ts`). Follow Next 14 async-params (`params: Promise<...>`) as in pages.

## Conventions

### Project structure

```
src/
  app/              Next.js App Router. Pages, route handlers, colocated actions.ts.
  components/       Cross-feature shared components.
    print/          Print/PDF layout helpers (PrintHeader, PrintButton, ...).
    ui/             Generic UI primitives (ViewToggle, etc.).
  lib/              Utilities, helpers, Prisma + auth singletons, class-string libs.
  types/            Module augmentations only (next-auth.d.ts).
prisma/             schema.prisma + seed.mjs.
scripts/            One-off CLI scripts (run outside Next).
```

Feature-specific components colocate with their `actions.ts` under `src/app/<feature>/`. `src/components/` is reserved for components reused across two or more features. Pages remain thin — fetch + delegate to the colocated client component. Helper files under `src/lib/` use camelCase (`breakoutLabels.ts`, `agendaUtils.ts`, `userSettings.ts`), not kebab-case.

### Pages and routing

- Every authenticated `page.tsx` declares `export const dynamic = "force-dynamic"`. Carve-outs: `src/app/login/page.tsx`, `src/app/share/[token]/page.tsx` (both unauthenticated), and `src/app/settings/page.tsx` (pure redirect).
- Type page props as `params: Promise<{...}>` and `searchParams: Promise<{...}>`, then `await` them.
- Use `Promise.all([...])` to fan out independent fetches inside a page.
- Missing records call `notFound()`. Do not add `error.tsx`, `not-found.tsx`, or `loading.tsx` files — rely on Next's defaults.
- Filter state on list and table pages lives in URL search params (bookmarkable, share-friendly, survives refresh and back-button). On filter change, call `router.push(\`${basePath}?${params.toString()}\`)`. Reserve `router.replace` for URL changes that should NOT add a history entry (e.g. `Toast` clearing `?success=` in `src/components/Toast.tsx:21`).
- Validate URL list params against an allowed set before passing them into a `Set.has` lookup. See `selectedSections.filter((s) => validSectionValues.has(s as ProfileSection))` in `src/app/events/[id]/reports/event-profile/page.tsx:28-31`. Un-validated list params (`?days=banana`) silently empty results and look like a backend bug. Report data actions apply the same rule on their side: an unrecognized enum filter value means "no filter", not an empty result (`enumFilterSet` in `getPackingListData`) — share-link URLs get hand-edited.
- **Breadcrumbs.** Every entity detail page renders `<Breadcrumbs items={[...]} />` shaped as: (1) top-level section (`{ label: "Events", href: "/events" }`), (2) parent entity (`{ label: event.name, href: \`/events/${eventId}\` }`), (3) immediate parent list (`{ label: "Presentations", href: ... }`), (4) the entity's own name with no `href`. Use the plural list label (`Functions`, `Presentations`, `Setup Orders`) — not the page title.
- Import via `@/...` (`@/* → ./src/*`) across feature boundaries. A "feature" is a directory under `src/app/<feature>/`; sibling imports inside one feature may stay relative. Anything crossing out of a feature dir — into `src/lib/`, `src/components/`, another `src/app/<other-feature>/`, or `src/types/` — uses `@/...`.

### Server Actions

- Co-locate in a sibling `actions.ts` whose first directive is `"use server"`. Every export of a `"use server"` file becomes a callable RPC endpoint and must be an async function — shared constants, types-with-values, and URL-param parsing go in a plain sibling module (`src/app/events/sidebar-sections.ts` next to `sidebar-actions.ts`; a report's `params.ts`).
- Start every exported action with `await requirePermission(RESOURCE, ACTION, eventId?)` from `@/lib/permissions` (or `await requireSuperAdmin()` from `@/lib/tenant` for platform administration). It returns the session plus `tenantId` — the event's tenant when an event id was given, the active tenant otherwise — which the action hands to the `*Core` it calls. `await requireAuth()` (`@/lib/auth`) is the guard for signed-in-only actions that touch no permission resource (`/account`, API-key minting, the OAuth approval). **Carve-out:** the password-reset actions under `src/app/forgot-password/` and `src/app/reset-password/[token]/` are deliberately auth-free, and the `/f/[token]` actions authorize by re-resolving their token. **Auth-free readers never live in a `"use server"` file:** every export there gets an action id, and the build registers it on each route that imports it — including public ones like `/share/*` — so it becomes callable with no session via a `Next-Action` POST. The share views' readers are plain modules: the report readers in `src/app/events/reports/data.ts` and `getEvent` in `src/app/events/event.ts`. A new reader the share views call goes in such a module, stays auth-free, and takes its tenant from the event, never the session. To verify, build and check `.next/server/server-reference-manifest.json` has no worker under `app/share/*`.
- Read inputs by type. Strings: `(formData.get("field") as string) || null`. Numbers: `parseInt(formData.get("field") as string)` for required ints, or `formData.get("field") ? parseInt(...) : null` for nullable ints — don't blanket-apply `|| null` to numerics, it turns `"0"` into `null`. Booleans: `formData.get("field") === "true"`. Multi-value: `formData.getAll("field") as string[]`.
- After a mutation, call `revalidatePath(...)` for the entity's own list + detail routes, then `redirect(...)`. Cross-cutting changes (e.g. an option rename propagating across dozens of consumers) rely on `force-dynamic` — don't enumerate every consumer. Don't use `revalidateTag` (the project doesn't tag fetches).
- **Redirect target.** Thin top-level entities (User, Event, Venue, Contact) redirect to the list view after create. Entities that need further setup (Vendor, every order type, Presentation, Function) redirect to the detail view. Duplicates always redirect to the new copy's detail view. Updates always stay on the detail view.
- **Toasts.** Every successful mutation appends `?success=<short message>` to the redirect URL. The destination page mounts `<Toast />` wrapped in `<Suspense fallback={null}>` so `useSearchParams()` inside doesn't bail.
- Return shape: (a) `void` after `redirect()` for create/update from a `<form>`; (b) `void` without redirect for bulk operations called from a client list (the client calls `router.refresh()`); (c) the raw Prisma model for read actions consumed by server components. Do not introduce a `{ success, error }` envelope; do not use `useActionState`. Exception: actions called from `useTransition` return `{ error }` for a `UserFacingError` — see § MCP connector, Documented exceptions.
- For event-scoped detail pages, wrap remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id before passing them to client components (Archetype C).
- Cache shared readers with `cache()` from `react` **only** when the same reader is called more than once per request — typically a `layout.tsx` and its child `page.tsx`. `getEvent` is the current example (`src/app/events/event.ts`).

### Forms and mutations

- Use native `<form action={serverAction}>`. The submit button uses `useFormStatus()` inside a `SubmitButton` subcomponent (see `src/app/events/EventForm.tsx:11-24`).
- Default to uncontrolled inputs (`defaultChecked` / `defaultValue`). Lift to controlled state (`checked` + `onChange`) only when the form mediates selection across UI transitions (text-filtering a long list, multi-select with bulk actions, undo). When you do, also emit a hidden `<input type="hidden" name="..." />` for any selected value the filtered view hides, so the payload still carries it. See `RoomSelector` in `src/app/events/functions/FunctionForm.tsx:45-160`.
- For non-form mutations (delete, status toggle, vendor swap), call the Server Action from inside `useTransition` and disable the trigger while pending (see `src/components/CancelOrDeleteButton.tsx`, `EntityStatusPanel.tsx`).
- Confirmation steps (delete, cancel) use inline state on the trigger, not modal dialogs (`src/components/DeleteButton.tsx`, `InlineDeleteButton.tsx`).
- After a mutation, the pattern is `await action(); router.refresh()`. No `useOptimistic`.
- A form whose update action redirects back to its own page keeps its client state (still in edit mode). Key the form on the record's `updatedAt` so a save remounts it into view mode (`src/app/settings/organization/page.tsx`).
- Type-ahead entity search uses `useDebouncedSearch(fetcher)` (`src/lib/useDebouncedSearch.ts`: 300 ms, ≥ 2 chars, stale responses dropped) rather than a hand-rolled `setTimeout` effect.
- Paired start/end inputs (date, datetime-local, time) use `syncRangeEnd` (uncontrolled, from the start's `onChange`) or `rangeEndFor` / `rangeEndMin` (controlled) from `src/lib/dateRange.ts`: the end renders `min={start}`, and the core throws on end < start. Optional ends pass `fillEmpty: false`; hotel stays use `gapDays: 1`. RFP space/line-item clock times are exempt (end < start means overnight).

### Read-only UI

- The event/admin layout resolves levels with `permissionLevels()` and hands them to `PermissionsProvider`; client components call `useCanWrite` / `useCanDelete` / `useCanDo` (`src/components/PermissionsProvider.tsx`), server components call `hasPermission`. The hooks return `true` with no provider above them — a missing provider must never disable a working page. The Server Action's own `requirePermission` remains the real gate; this only hides controls the action would refuse.
- Shared write primitives (`DeleteButton`, `InlineDeleteButton`, `CancelOrDeleteButton`, `LinkedItemsPanel`, `VendorLinkControl`, `FunctionLinkControl`, `FunctionMultiLinkControl`) take a required `resource` prop; `EquipmentTable` (`src/components/EquipmentTable.tsx`) requires it too — pass the owning order's resource.
- Forms with no view/edit toggle go read-only via `<fieldset disabled={!canWrite}>` plus a hidden submit (`src/app/vendors/VendorForm.tsx`), not a duplicated read-only branch.
- Pages that exist only to edit (`*/new`, `/events/[id]/settings`, `/events/[id]/import`, the share-dashboard editor) gate the whole page with `requirePermission(..., "WRITE", ...)` instead of rendering a form the action would refuse.

### Components

- Named exports for components, **except** where Next requires `export default` (page, layout, error, loading, not-found, route).
- Add `"use client"` only when the file needs local React state, an effect, a router hook, `useFormStatus`, `useTransition`, or a third-party client library (tiptap, @dnd-kit).
- Never call a function exported from a `"use client"` module from server code — on the server the import is a client-reference proxy and the call throws `TypeError: ... is not a function` at render. Pure helpers used by both sides live in `src/lib/` (`src/lib/partyLabel.ts` was moved out of `party-field.tsx` for this).
- Don't call `setState` synchronously at the top of a `useEffect` body (`react-hooks/set-state-in-effect` fails lint). Derive the value during render instead, or wrap the call in `startTransition` (`src/components/EventSidebar.tsx`).
- `dangerouslySetInnerHTML` is allowed only for HTML produced by `RichTextEditor` (`src/components/RichTextEditor.tsx`, tiptap-backed) — currently the four `menuContent` call sites in catering reports and `MenuSectionTable`. When you add a new call site, drop a one-line comment naming the editor source.

### Data layer

- Use the singleton `prisma` from `@/lib/prisma`. Pages, Server Actions, and `src/lib/` helpers may call `prisma.<model>.<op>()` directly. Prefer a sibling `get*` action when the same query lands in two or more places; one-off lookups may stay inline.
- Tenant-owned lookups by id use `findFirst({ where: { id, tenantId } })` and `update`/`delete({ where: { id, tenantId } })` (extendedWhereUnique) rather than a bare `findUnique` — a foreign id is a not-found, never a cross-tenant read or write. Readers that only hold an event id use the relation filter `tenant: { events: { some: { id: eventId } } }` (`optionsWhereForEvent` in `src/lib/options.ts`).
- **Event ownership.** Tenant filters don't stop a caller with access to event A from passing an id that belongs to event B. Event-scoped mutations put the event in the `where` (`where: { id, eventId }`, or a relation filter like `{ id, function: { eventId } }` for deeper children; bulk ops `where: { id: { in: ids }, eventId }`); creates that link to an existing row assert it first (`assertXInEvent`). Every client-supplied foreign id (FormData, MCP args, URL params) that lands in an FK column, a junction row, or a read's `where` is proven first — event-scoped ids (functions, presentations, breakout groups, tracks) against the event, tenant-owned ids (vendors, contacts, equipment, rooms, storage, inventory) against the event's tenant — via `assertEventRefs` / `partyRefs` (`src/lib/eventRefs.ts`). A child row's `where: { id, parent: { eventId } }` doesn't cover the *other* ids it's being pointed at. Bulk actions narrow `ids` to the event's own rows before any per-id `createMany`. Readers that take only an entity id fetch first, then gate on the fetched `eventId` (`getFunction`, `getAVOrder`). Global catalogs (`STORAGE_LOCATIONS`, `VENDORS`) have no second boundary — their existence checks are correctness guards, not authorization.
- **Visible events.** Any list that returns events — page, action, or MCP tool — ANDs in `eventScopeWhere(userId, tenantId)` (`src/app/events/core.ts`), or it becomes a way to enumerate events the caller can't open. `EventStaff.accessLevel` only *caps* a role's ASSIGNED level for one event; it never widens it.
- **Venues and rooms.** An event's venues come through `EventVenue`; the primary is the lowest `sortOrder` (read with `eventVenuesInclude`, so `venues[0]` is primary). Room pickers load `getEventRooms(eventId)` (`src/lib/eventVenues.ts`), never rooms by a single `venueId`.
- **Option-label columns.** `FunctionSchedule.type` and similar columns store a `CustomOption` label, so writers needing a default resolve one (`defaultScheduleType()` in `src/lib/scheduleTypes.ts`) — never a hard-coded token, or the row silently drops out of filtered views. `CustomOption.group` doubles as a fixed key for renamable lists (substatus → status, `meal_type` → APEX meal bucket, `proposal_status` → stage); `updateOption` writes `group` only when the form posts it, so a list without a group control must not send one.
- **Function numbers.** Every core that creates, deletes or reschedules functions calls `syncFunctionNumbers(eventId)` after its writes and `retireFunctionNumbers` before deletes (`src/lib/functionNumbering.ts`).
- **Transactions.** Helpers that use the global `prisma` (`autoAssignDefaultWorkflowsCore`, `resolveCreateStatus`) can't join a `$transaction` — call them before or after the callback, never inside. Don't mutate outer arrays inside the callback (a retry duplicates entries).
- `createMany({ skipDuplicates: true })` only skips rows a unique index catches — Postgres treats NULLs as distinct, so a nullable column in the index (`EventKeyStaff (eventId, contactId, title)`) lets duplicates through.
- Seeded config rows that the admin UI must not delete carry `isSystem` (`CustomOption`, `Role`) — reuse that name for the next config model.
- When `onDelete: Restrict` is the right FK semantics, pair it with a pre-check whose only job is a readable error ("X still holds N items") — see `deleteStorageLocationCore`.
- Domain types come from `@prisma/client`. For derived list/detail payloads, alias with `Awaited<ReturnType<typeof getX>>[number]`.
- Persist per-user preferences via `setUserSetting` / `getUserSetting` from `@/lib/userSettings` (backed by the `UserSetting` table). Don't add cookies or localStorage for the same need.
- When discriminating on a TypeScript union or Prisma enum, close the chain with an exhaustiveness check: `default: { const _exhaustive: never = value; throw new Error(\`Unhandled: ${value}\`); }` on a `switch`, or `const _exhaustive: never = link.reportType; throw new Error(...);` after the last `if` branch. Reference call sites: `HotelLabelCategory` switch in `mergeHotelLabel` (`src/lib/hotelLabels.ts`), `ShareLink.reportType` if-chain in `src/app/share/[token]/page.tsx`.

### Styling

- Tailwind v4 utility classes everywhere. Concatenate with template literals. Do not introduce `cn()` / `clsx` / `tailwind-merge`.
- Apply `dark:` variants on every element with a color-bearing class (`text-`, `bg-`, `border-`, `divide-`, `ring-`, `placeholder:`). Layout-only classes (`flex`, `gap-2`, `mt-4`) don't need a dark counterpart. Print formatting uses `print:` utility variants plus the rules in `src/app/globals.css:35-44`.
- Reuse the class-string libs in `src/lib/` instead of redeclaring strings inline: `buttonStyles` (`btnPrimary`, `btnSecondary`, `btnDanger`, `btnOutlinedSm`), `reportStyles` (`reportTh`, `reportTd`, `labelMicroCaps`, etc.), `statusConstants`, and `colors`.
- **UI copy is terse.** No helper text that narrates a control's behavior or explains a design choice ("Stays open so you can keep going.") — if a behavior needs a sentence, make the behavior self-evident instead. Labels, placeholders, empty states and outcome messages ("Filed 6 items into Registration Box. 2 skipped.") carry information and stay. Don't name the ESG/APEX part or section in UI copy outside the report itself.

### Mobile and print

- **Reports** must render dual layouts: a mobile card view (`sm:hidden`) and a desktop/print table (`hidden sm:block print:block`). See § Reports.
- Other tables may rely on horizontal scroll inside `overflow-x-auto`. A grid item containing such a table needs `min-w-0`, or the table widens the page instead of scrolling (`src/app/venues/[id]/page.tsx`).
- Every new full-page layout (sidebars, filter bars, forms) must remain functional at 360 px width. The mechanisms: filter/toolbar groups get `flex-wrap`; tab strips get `overflow-x-auto whitespace-nowrap` on the `<nav>` (`src/app/events/[id]/agenda/DateTabs.tsx`); title + actions headers stack with `flex flex-col gap-3 sm:flex-row sm:justify-between` and `min-w-0` on the title block (`src/components/PageHeader.tsx`).
- The header nav is inline only at `lg`; below that `MobileNav` renders the same arrays — add top-level links to `mainLinks` / `adminLinks` in `src/components/Header.tsx`, not as JSX.
- On interactive report pages, the "Print / Save PDF" button is `<a href="${basePath}/print?...">` — never `window.print()`. On the dedicated `/print` route itself, `PrintButton` (`src/components/print/PrintButton.tsx`) calls `window.print()`.

### Environment and config

- Access `process.env` only inside `@/lib/prisma`, `@/lib/auth`, `@/lib/uploads` (`UPLOAD_DIR`, `MAX_UPLOAD_BYTES`), and `@/lib/email` (`MAILGUN_*`). Funnel any new env var through one of these. Anything reading `AUTH_SECRET` must fall back to `NEXTAUTH_SECRET` — the only secret the compose files provision (`getOAuthSigningSecret` in `src/lib/auth.ts`).
- No `NEXT_PUBLIC_*` variables. No feature flag system.

## Security and validation

- **Authentication** is enforced first at middleware (`src/middleware.ts` re-exports the NextAuth `auth` callback). The `authorized` callback in `src/lib/auth.ts` exempts the public surfaces listed in § Architecture invariants. Every other page can assume `session.user` exists.
- **Server Actions self-protect** with `await requirePermission(...)` (see § Server Actions for the public-reader carve-out). Event-scoped writes also prove the row belongs to the event — see § Data layer, Event ownership. Reasoning: defense in depth, and a reviewer sees the protection at the top of the file without auditing middleware coverage.
- **Admin authorization.** Admin-only route segments (`/settings`, `/users`, `/workflows`, `/system`) have a `layout.tsx` that calls `requirePermission(<RESOURCE>, "VIEW")`; `/tenants` calls `requireSuperAdmin()`. Pages inside don't re-check; Server Actions still gate themselves.
- **Tenant isolation** is enforced in the data layer, not middleware: the permission layer picks the tenant (§ Multi-tenancy) and every query on a tenant-owned model carries it.
- **Input handling.** No runtime schema library (no zod / yup / valibot). Trust the TypeScript types for FormData shape. Use `throw new Error(...)` for runtime invariants (uniqueness preview, cross-field invariants — see `src/app/users/actions.ts:46-55`, `src/app/account/actions.ts:11-13`). Empty strings normalize to `null` with `|| null`.
- **Share links.** Tokens are validated by `getActiveShareLink` (`src/lib/shareLinks.ts:18-26`), which checks `revokedAt` and `expiresAt`. The share views (`src/app/share/[token]/`, `src/app/share/group/[token]/`) are the only public surfaces that read event data. They render reports only — the Office downloads (`api/events/[id]/esg`) are authenticated-only and `ReportDownloadLinks` is never passed on a share view.

## Reports

Every report under `/events/[id]/reports/[name]/` must render cleanly on mobile, print without UI chrome, and work in the unauthenticated `/share/[token]/` view. Equipment Responsibility and Vendor Handoff are the reference implementations.

Before adding a report, check whether the view is a variant of an existing one (columns shown, density, page breaks over the same data). Prefer a toggle on the existing report (`event-schedule?compact=true`) over a new route — every report costs five share surfaces.

### File layout
- `src/app/events/reports/data.ts` — shared data readers for all reports. A plain module (no `"use server"`, or the readers become public endpoints on the share routes). Must **NOT** call any auth guard.
- `src/app/events/[id]/reports/[name]/params.ts` (when needed) — URL-param parsing, sentinels and valid-value sets shared by the page, `/print`, and the share surfaces; a plain module because `actions.ts` can only export async functions.
- When a report mirrors an operational page, both read through one plain `src/lib/` builder (`buildPackingItems` in `src/lib/packingItems.ts` feeds the packing page and the Packing List report) rather than the report importing the page's `"use server"` reader.
- `src/app/events/[id]/reports/[name]/page.tsx` — server component; fetches data and renders the filter bar + report.
- `src/app/events/[id]/reports/[name]/ReportFilters.tsx` — `"use client"`; accepts `shareButton?`, `hidePrint?`, `basePath?`, `paramPrefix?` props for share-view reuse. Built from `useUrlChipFilter(paramPrefix, basePath)` (`src/lib/useUrlChipFilter.ts`) and `<ReportFilterShell>` (`src/components/ReportFilterShell.tsx`) — see § Filter bar conventions.
- `src/app/events/[id]/reports/[name]/[Name]Report.tsx` — report body; consumed by both the authenticated route and `/share/[token]/`.
- `src/app/events/[id]/reports/[name]/print/page.tsx` — dedicated PDF route using `PrintHeader`.

### Required: mobile-friendly tables
Every table renders BOTH a mobile card layout (`sm:hidden print:hidden`) and a desktop/print table (`hidden sm:block print:block overflow-x-auto`). Mobile card row: bold item name, qty right-aligned, role/provider/operator stacked muted, italic notes. See `EquipmentResponsibilityReport.tsx` for the canonical structure.

A 2-column table may skip the mobile card only when both columns fit in 360 px — concretely: ≤ 2 columns and the longest realistic cell is ≤ ~24 characters (e.g. `HH:MM – HH:MM` paired with a short room name). Anything wider — three columns, long item names, role/provider stacks — must dual-render. A `table-fixed` table without a mobile card variant is wrong on mobile: `overflow-x-auto` does nothing because the table never exceeds the viewport.

### Required: nav, anchors, section dividers
- Render `<ReportNav sections={[...]} itemGroups={[...]} />` from `src/components/ReportNav.tsx` as the first child of the report body. It's `sticky top-2 z-10` with `id="top"`, so every section divider's `↑ Top` link targets it.
- `sections` are top-level anchors (Key Contacts, Schedule, Equipment, Unscheduled). `itemGroups` is `{ label, links }[]` — each renders as its own `<details>` toggle so long lists stay collapsed. Legacy: `links={[...]}` behaves as `sections`; `items={[...]}` with optional `itemsLabel` renders as a single item group.
- Use `<SectionDivider id="..." title="..." />` from `src/components/SectionDivider.tsx` to group logical regions. Each divider includes a `↑ Top` link automatically.
- Every anchored card must include `scroll-mt-24` so jumped-to sections land below the sticky nav.

### Anchor ID conventions
- Top-level sections: kebab-case (`top`, `summary`, `key-contacts`, `function-schedule`, `equipment-summary`, `details`, `unscheduled`).
- Per-entity: `${kind}-${id}` (`function-${fn.id}`, `presentation-${presentation.id}`, `party-${partyId}`).
- When an entity appears under multiple parents in the same report, compound IDs are permitted: `${kind}-${id}-${parentId}` — entity first, then disambiguating parent. See `presentation-${item.entry.slot.presentation.id}-${item.entry.block.id}` in `src/app/events/[id]/reports/room-schedule/RoomScheduleReport.tsx:200`. The constraint is uniqueness on the page — kebab-case, no `:` / `/` / spaces.
- Never use raw composite keys containing `:` as HTML IDs — compute a clean anchor id separately from the React `key`.
- Anchors for groups keyed by free text (vendor/provider labels) are positional (`procurement-group-${i}`), never a slug of user text.
- A mobile card and its desktop row must not share an id — the hidden first match wins the jump. Give the card its own id and pass it as the link's `mobileId` to `ReportNav`.

### Filter bar conventions
- Build every filter bar from `useUrlChipFilter(paramPrefix, basePath)` and `<ReportFilterShell>`; don't hand-roll `router.push`, prefixing, the collapse or the action buttons. The hook prefixes every key (`setList` / `toggle` / `toggleAll` / `setFlag` / `clear`, `update` for anything else) and returns `printHref`. The shell takes the controls as children — `FilterGroup` + `FilterChip` / `FilterBucketChip` for chips, plain selects/checkboxes otherwise — plus `activeCount`, `onClear?`, `shareButton`, `printHref` (`null` when `hidePrint`) and `collapsible?`.
- `ReportFilters` accepts `hidePrint?: boolean` — pass it from `src/app/share/[token]/page.tsx` so only the `ShareShell` header Print button shows.
- On mobile (`sm:hidden`), filter controls collapse behind a "Show filters / X active" toggle. Actions (Clear, Share, Print) remain always visible. Desktop unchanged (`hidden sm:flex`). The shell does both.

### Aggregation conventions
- Never use `"Multiple"` rollups. Split rows along the dimension that produced the ambiguity (e.g. by `(item, role, provider)`) so each row is concrete.
- Sort order: category → item name → role priority (Provider & Operator > Provider > Operator) → provider name.

### Print/PDF conventions
- Dedicated print route (`/print`); do NOT print the interactive screen directly.
- Use `PrintHeader` (`src/components/print/PrintHeader.tsx`) with `eventName`, `title`, `backHref`. In-app print links open in the same tab; `backHref` is the way back.
- Page breaks: `section` elements avoid breaking inside (`src/app/globals.css`), cards use `print:break-inside-avoid`, and tables whose columns must line up across groups are `table-fixed` with an explicit `<colgroup>`.
- Filter controls are not rendered on print pages — the URL carries them in.
- "Print / Save PDF" follows the two-layer rule in § Mobile and print.
- Use Tailwind class strings from `src/lib/reportStyles.ts` — do not re-declare inline.

### Share-view integration
Five surfaces to wire — see [docs/checklists/share-report-integration.md](./docs/checklists/share-report-integration.md). Missing one of the group surfaces throws `Unhandled report type: <X>` at runtime when a saved dashboard item references the new type.

### Shared components reference
| Component | Location | Purpose |
|---|---|---|
| `ReportNav` | `src/components/ReportNav.tsx` | Sticky jump-to nav with `id="top"` |
| `SectionDivider` | `src/components/SectionDivider.tsx` | Labeled section ruler with back-to-top link |
| `PrintHeader` | `src/components/print/PrintHeader.tsx` | Print page header (event name, title, back link) |
| `ShareReportButton` | `src/components/ShareReportButton.tsx` | Create/manage share links from a report page |
| `ShareShell` | `src/app/share/[token]/ShareShell.tsx` | Layout shell for the share route |
| Report style classes | `src/lib/reportStyles.ts` | `reportTh`, `reportTd`, `labelMicroCaps`, etc. |

## Multi-tenancy

Full reference: [docs/multi-tenancy.md](./docs/multi-tenancy.md). The load-bearing rules:

- **Model.** `Tenant { id, name, slug }`; `TenantMembership { tenantId, userId, roleId }` is the only source of a user's permissions inside a tenant. `User.isSuperAdmin` marks platform admins (every permission everywhere, `/tenants`, role definitions). Role definitions are global, so `createRole`/`updateRole`/`deleteRole`/`duplicateRole` call `requireSuperAdmin()`, not `requirePermission(ROLES, ...)`.
- **Which tenant.** `src/lib/tenant.ts` owns it. The *active* tenant is a `UserSetting` (`active_tenant_id`) switched from the header (`TenantSwitcher` → `switchTenant`); `getTenantContext()` is the request-cached read, `requireActiveTenantId()` redirects to `/no-tenant` for accounts with no membership. Event-scoped checks ignore the active tenant and use the event's own (`getEventTenantId`, cached); the event layout re-points the active tenant to match and redirects once.
- **Permission API.** `requirePermission(resource, action, eventId?)` (session) returns `session.tenantId`. `requirePermissionForUser(userId, resource, action, target)` (cores, MCP) takes a `PermissionTarget`. `loadPermissionsForUser(userId, tenantId)`. `hasGlobalView(perms, resource)` unchanged. `requireEventTenantId(eventId)` for a core that hangs a global check or a contact create off an event.
- **Cores.** Global cores take `(args, userId, tenantId)`; event-scoped cores keep `(args, userId)`. Child rows (rooms, vendor contacts, workflow steps/items) are guarded by asserting the parent is the tenant's own first (`assertVenueInTenant`, `assertVendorInTenant`, `assertTemplateInTenant`) — never by trusting the child id.
- **Uniqueness** is per tenant: `EventSeries (tenantId, name)`, `CustomOption (tenantId, category, label)`, `Equipment (tenantId, category, name)`.
- **Defaults.** New tenants are seeded inside `createTenantCore`'s transaction from `prisma/tenantDefaults.mjs`; the seed runs the same function for every existing tenant.
- **Users admin** (`/users`) is the active tenant's member list; "Add User" adds an existing account as a member or invites a new one. Removing a member deletes the membership plus their staff rows on that tenant's events; deleting the account is super-admin only. Event staff pickers only offer tenant members.
- **Migrations.** Schema changes touching populated tables ship in `prisma/migrations/` (`0_init` baseline + `prisma/baseline.mjs` for db-push-era databases); the Docker CMD runs `migrate deploy`.

## Vendor model types

Vendors are tagged with one or more "model types" (`CATERING_ORDER`, `AV_ORDER`, `SETUP_ORDER`, `PRINT_ORDER`) indicating which order types they service; this drives vendor picker filtering. The union lives in `src/app/vendors/actions.ts`; display labels in `src/app/vendors/model-types.ts` (no `"use server"` directive, so client components can import). Always import `MODEL_TYPES` / `MODEL_LABELS` from `model-types.ts` for display — never re-declare inline.

`searchAssignedEventVendors(query, eventId, modelType?)` treats vendors with an empty `models` array as general-purpose (appear in every picker). To add a new model type: extend the `ModelType` union + `MODEL_TYPES` array, then pass the new value where the new order type's form invokes the search. `VendorPanel`, `EventVendorList`, and the filter logic handle any `ModelType` generically.

## Order list and bulk edit pattern

Order types that ship with bulk-edit follow this structure exactly. New order types may ship lean (no `*ListClient`, no multi-select, no bulk actions) — see `src/app/events/[id]/print-orders/page.tsx`. Replicate the structure below when bulk-edit is added later.

### File layout
- `src/app/events/[order-type]/[OrderType]List.tsx` — `"use client"` component with list view, table view, selection, and bulk edit.
- `src/app/events/[order-type]/actions.ts` — server actions including `get*`, `delete*`, `delete*s` (bulk), and `bulkUpdate*`.
- `src/app/events/[id]/[order-type]/page.tsx` — thin server component: fetches data, defines inline `"use server"` wrapper actions, renders `<[OrderType]List>`.

### Selection and bulk edit
- `useState<Set<string>>` for row selection. Selection bar appears when `selected.size > 0`; shows count, "Bulk edit" toggle, "Delete selected", "Clear selection". `showBulkEdit` state controls the inline edit panel.
- **Status:** `EDIT_STATUS_OPTIONS` from `src/lib/statusConstants.ts`.
- **Substatus:** `getSubstatusOptions()` from `src/app/settings/actions.ts` → `CustomOption[]`, filtered by selected status via `group` field.
- **Vendor:** `getResponsiblePartyVendors(eventId, "X_ORDER")` + `flattenResponsiblePartyOptions()`. Replace pattern (many:many): `deleteMany` then `createMany` on the junction.
  ```ts
  await prisma.xOrderVendor.deleteMany({ where: { xOrderId: { in: ids } } });
  await prisma.xOrderVendor.createMany({ data: ids.map(id => ({ xOrderId: id, vendorId })) });
  ```
- **Function link:** `getFunctionOptions(eventId)`. Many:many junctions (AVOrder, SetupOrder, PrintOrder via `*OrderFunction`) — bulk-add is safe (skip existing on the unique constraint). 1:1 FK (CateringOrder via `CateringOrder.functionId`) — bulk-replace the FK directly.
- **Presentation link:** many:many for AVOrder and SetupOrder (via `*OrderPresentation`) — bulk-add skip-existing. 1:1 FK for PrintOrder — bulk-replace. CateringOrder doesn't link to presentations.
- After apply: call server action, reset state, `router.refresh()`.

### Absence sentinels across the stack
Use the same sentinel string for "no value" across `<select>` options, internal state, and URL params. Prefer `__blank__` for `<select>` values; if a URL param has to be human-readable (`?room=none`), translate at the page boundary once and use `__blank__` internally. Never invent a third string (e.g. mixing `none` / `no` / `__none__` / `__blank__` inside one feature) — pick one and convert at the edge. Empty string (`""`) means "All / no filter".

Status filter idiom:
```ts
if (filters.status === "__blank__") {
  if (o.status != null) return false;
} else if (filters.status && o.status !== filters.status) return false;
```

## Adding a new entity / order type

Full checklist at [docs/checklists/adding-entity.md](./docs/checklists/adding-entity.md). Covers schema, auth/permissions, routes, sidebar, overview, status/workflow, vendor model types, uploads, and the report integrations the new entity should flow through. Cross-reference SupplyOrder (commit a880f43 + the SupplyOrder UI alignment PR) as the most recent end-to-end reference.

## Function and breakout session labels

Wherever a Function is displayed or picked by name, render it with `formatFunctionLabel` (`src/lib/functionNumbers.ts`) so it carries its number and, for a breakout session (a `Function` with `type === "BREAKOUT_BLOCK"`), its group: "#12 · Learn & Lead Session 1". Include `functionNumber: true` and `breakoutGroup: { select: { name: true } }` in the Prisma select, and filter/sort on the formatted label (`matchesFunctionQuery`) — users see and search that form.

`formatBreakoutSessionName(name, groupName)` (`src/lib/breakoutLabels.ts`) is the unnumbered building block, called directly only where a number must not appear. The default order name taken from `?functionId=` (`extractSourceName` in `src/lib/source-context.ts`) stays unnumbered too.

## MCP connector

`src/app/mcp/route.ts` exposes a hand-rolled JSON-RPC 2.0 endpoint speaking the MCP protocol (stateless `tools/list` + `tools/call`). API-key bearer auth via `Authorization: Bearer <key>`; users mint their own keys at `/account/api-keys`, and each key inherits its owning user's memberships, roles, and event assignments across every tenant. Every tool except `list_tenants` takes a `tenant` argument (slug or id): `classifiedTools()` injects it into each schema and the dispatcher resolves it via `resolveTenantForUser` and strips it before the handler runs (`TENANT_ARG` / `TENANT_FREE_TOOLS` in `src/lib/mcpTools/index.ts`). It may be omitted only when the user belongs to exactly one tenant; unknown and off-limits handles fail identically. `McpToolContext` is `{ userId, tenantId }`. Admins audit/revoke any user's key at `/users/api-keys` — gated by the `API_KEYS` `PermissionResource` (seeded admin-only). Minting itself is `requireAuth()` only, scoped to the caller's userId.

### Where things live
- **Route** — `src/app/mcp/route.ts`. POST-only; dispatches JSON-RPC; maps `PermissionError` → MCP error codes; serializes results through `mcpSerialize`. GET returns 405.
- **Bearer auth** — `src/lib/mcpAuth.ts`. SHA-256 lookup against `ApiKey.hashedKey`; rejects revoked keys; stamps `lastUsedAt` fire-and-forget. Keys are random 32-byte base64url tokens (NOT bcrypt — high-entropy randoms need a single indexed hash lookup, not a per-row compare). The same SHA-256-only rule covers OAuth authorization codes and refresh tokens.
- **OAuth 2.1** — claude.ai web/mobile connectors authenticate with OAuth (PKCE S256, public clients only, anonymous dynamic registration); `/mcp` tries the OAuth JWT first, then the API key. `src/lib/mcpOAuth.ts` + the `api/oauth/*` / `api/well-known/*` routes; full reference in `docs/oauth-mcp.md`. The access-token scope is cosmetic — authorization stays per tool call.
- **Tool registry** — `src/lib/mcpTools/index.ts` aggregates per-entity files. Each tool is a `{ name, description, inputSchema, handler }` — see `src/lib/mcpTools/types.ts`.
- **Serialization** — `src/lib/mcpSerialize.ts` walks the result tree; converts `Date` → ISO 8601 string, `Prisma.Decimal` → string (preserves precision on financial fields).
- **Self-service UI** — `src/app/account/api-keys/` (page + actions + form + list). Linked from `/account`.

### Permission boundary
MCP tools resolve a userId from the bearer token and call `requirePermissionForUser(userId, resource, action, target)` from `@/lib/permissions` — `target` is a `PermissionTarget`: an event id string (tenant derived from the event) or `{ tenantId }` for a global check, never omitted — which **throws `PermissionError`** on denial (it never calls `redirect()`/`notFound()` — those are Next-navigation throws and can't fire from a non-render context). The session-bound `requirePermission()` is a thin wrapper that catches `PermissionError` and translates to the legacy redirect/notFound behavior for the UI. **Don't bypass the wrapper from a UI page** — an uncaught `PermissionError` surfaces as an opaque 500.

The report readers in `src/app/events/reports/data.ts` remain auth-free (the share-route carve-out). The MCP tools in `src/lib/mcpTools/reports.ts` call `requirePermissionForUser(userId, EVENTS, VIEW, eventId)` before delegating — keeping access enforcement at the MCP boundary while leaving the underlying readers reusable by the share route.

### Adding a new MCP tool
1. Pick or create `src/lib/mcpTools/<entity>.ts`. Export a `McpToolDefinition[]`.
2. Each handler must (a) call `requirePermissionForUser` first, (b) call Prisma directly via `@/lib/prisma` — do NOT call sibling Server Actions (they use session auth via `auth()`), (c) return raw shapes; the dispatcher serializes them.
3. Register the new array in `src/lib/mcpTools/index.ts`.
4. JSON Schema in `inputSchema` is descriptive only; no runtime validation at the MCP boundary (same trust model as Server Actions trusting FormData typing). Tools throw `Error` for bad input.
5. Partial-update args use `partialString` / `partialInt` / `partialBoolean` from `src/lib/mcpTools/types.ts` (absent → unchanged, `null` → clear), so a new optional column doesn't force callers to resend it.
6. Every id a write tool requires must be discoverable from another tool's output — `create_inventory_item` needs `equipmentId`, so `list_equipment_catalog` shipped with it.
7. Gate at the permission the app enforces for the same operation, not the resource that shares the name (`list_equipment_catalog` checks `STORAGE_LOCATIONS` VIEW because `getEquipment()` serves every order form's picker; `EQUIPMENT` is admin-only).

### `list_<entity>` vs `get_<entity>` convention
Every entity exposes a pair: `list_<entity>` returns the list-page summary include (one or two levels of nested IDs/labels and a few flat fields); `get_<entity>` returns the full detail include. End every `list_*` tool's description with: `Returns summary shape — use \`get_<entity>\` for full detail (<short comma list of the extra includes>).` Descriptions are the only signal the LLM has — keep them specific and in sync.

### Writes — `*Core(args, userId)` extraction pattern
When wiring an MCP write tool that mirrors an existing Server Action, factor out a pure `xxxCore(args, userId)` function from the action body (`xxxCore(args, userId, tenantId)` for cores that do a global check or create a top-level tenant-owned row; event-scoped cores derive the tenant from the event). The Server Action wrapper retains `FormData` parsing, `revalidatePath`, and `redirect`; the core owns `requirePermissionForUser` and the Prisma op (including any `$transaction`). MCP tools call the core directly with typed args. Single source of truth for business rules; no drift between UI and MCP behavior. Cores live in a sibling `core.ts` with **no** `"use server"` directive (`src/app/contacts/core.ts`): every export of a `"use server"` file is callable from the browser, and a core that trusts a passed-in `userId` would let any signed-in user act as anyone else.

### Documented exceptions
- `mintApiKey` in `src/app/account/api-keys/actions.ts` **returns** a `{ fullKey, ... }` object — the deliberate exception to the "actions return void / redirect" convention. The plaintext key is shown once (we only persist `SHA-256(fullKey)`); the client renders a copy-once panel. Don't replicate unless you have an equivalent one-time-reveal requirement.
- **User-facing refusals.** Next replaces a thrown message with a generic one in production. Cores throw `UserFacingError` (`src/lib/userErrors.ts`) for expected refusals the user can act on ("Pick at least one section"); an action called from `useTransition` wraps its body (after the permission check) in `withUserErrors`, which returns `{ error }` for those and rethrows the rest; the client shows it via `isUserError(result)`. Event-scoped wrapper closures `return` the action's result. Invariant and authorization throws stay plain `Error` / `PermissionError`. `<form action>` create/update actions that redirect keep throwing.
- The OAuth approval action (`src/app/oauth/authorize/actions.ts`) redirects off-site to the client's `redirect_uri`, so it skips `revalidatePath` and the `?success=` toast. Errors redirect back only after `redirect_uri` has matched the client's registered list; before that they render locally, or the endpoint becomes an open redirect.

## Anti-patterns

| Don't | Do | Why / where |
|---|---|---|
| `new PrismaClient()` in a route, action, or component | `import { prisma } from "@/lib/prisma"` | One connection pool per process. |
| New `app/api/<resource>/route.ts` for JSON CRUD | A Server Action in `actions.ts` | Route handlers are reserved for what Server Actions can't express. |
| New repository / service / DAL class wrapping Prisma | Call `prisma.<model>.<op>()` directly | Abstractions fragment the layer. |
| `revalidateTag(...)` or `fetch(..., { next: { tags } })` | `revalidatePath(<list>); revalidatePath(<detail>)` | Project doesn't tag fetches. |
| `useActionState`, `{ success, error }` envelopes | Throw on error; `redirect("/...?success=...")` on success; `withUserErrors` for a `useTransition` caller's user-facing refusals | Established return shape across all action files; the `{ error }` exception is in § Documented exceptions. |
| `useOptimistic`, manual local rewrites after mutation | `await action(); router.refresh()` | Single mutation pattern. |
| `cn(...)`, `clsx`, `tailwind-merge`, ad-hoc class helpers | Template-literal concatenation; reuse `buttonStyles` / `reportStyles` / `statusConstants` / `colors` | No helper exists; adding one starts a split. |
| Redeclaring `btn*` / `report*` class strings inline | Import from `src/lib/buttonStyles.ts` / `src/lib/reportStyles.ts` | Single source of truth for visual style. |
| `window.print()` on an interactive report page | `<a href="${basePath}/print?...">` | The print route renders the chrome-free layout. |
| `error.tsx`, `not-found.tsx`, or `loading.tsx` files | `notFound()` from `next/navigation`; let Next render the default error UI | Zero such files exist. |
| `"Multiple"` rollup rows in reports | Split rows by `(item, role, provider)` | Concrete rows beat ambiguous summaries. |
| `null` / `undefined` as a `<select>` option value | Sentinel `value="__blank__"`; empty string means "All" | See § Order list § Absence sentinels. |
| Composite keys like `${a}:${b}` as HTML IDs | Compute a clean anchor id separately from the React `key` | Colon is not a CSS-friendly id char. |
| `process.env.X` outside `lib/prisma`, `lib/auth`, `lib/uploads`, `lib/email` | Funnel new env access through one of those modules | Four touchpoints, 0 `NEXT_PUBLIC_*`. |
| Cookies or `localStorage` for per-user preferences | `setUserSetting` / `getUserSetting` (`@/lib/userSettings`) | Server-side `UserSetting` table is the single store. |
| Adding zod / yup / valibot for FormData parsing | Trust TS types; `throw new Error(...)` for runtime invariants | Trusted-staff trust model; tenant isolation lives in the queries, not in input validation. |
| `findUnique({ where: { id } })` on a tenant-owned model | `findFirst({ where: { id, tenantId } })` | A foreign id must read as not-found. |
| `getOptions(category, tenantId)` or any tenant-explicit Server Action | Active tenant inside the action; `getOptionsForTenant` / `getOptionsForEvent` (`src/lib/options.ts`) for share routes | A client could pass any tenant id to a "use server" export. |
| Adding default options/equipment to `prisma/seed.mjs` | `prisma/tenantDefaults.mjs` | Shared by the seed (every tenant) and `createTenantCore`. |
| Adding a state library (Zustand / Jotai / Redux / SWR / React Query) | React built-ins + URL search params + `UserSetting` | Zero global client state. |
| Building a modal `<Dialog>` for delete/cancel confirmation | Inline confirm state on the trigger | See `DeleteButton.tsx` / `InlineDeleteButton.tsx`. |

## CLAUDE.md candidates

When you encounter any of the following during a task, append a one-line entry to `reviews/claudemd/candidates.md`:

- An explicit decision between two approaches ("we picked X over Y because Z")
- A new utility, helper, or pattern that should become canonical
- A constraint discovered through debugging or investigation ("can't do X because Y")
- A convention you inferred from existing code that isn't in CLAUDE.md
- A rule in CLAUDE.md that turned out to be wrong, ambiguous, or missing an exception

Format: `- [area] one-line description (PR/file reference if relevant)`. Don't ask whether to add an entry — just add it. The parking lot is processed during periodic reviews. New rules and conventions go through the parking lot, not straight into CLAUDE.md; but when a change in flight moves, renames or removes something CLAUDE.md names (a path, a helper, a route), update CLAUDE.md in the same change so it matches the current state of the project.

## Refactor candidates

When a `/simplify` (or ad-hoc) review flags real duplication or restructuring that's bigger than the change in flight, append a one-line entry to `reviews/refactors/candidates.md` instead of expanding scope.

| Finding | Action |
|---|---|
| Small, in-scope cleanup (≤~20 lines, doesn't touch unrelated files) | Fix now |
| False positive, or conflicts with a real constraint | Skip silently |
| Real, worth doing, but bigger than the current change | Park in `reviews/refactors/candidates.md` |

Format: `- [area] one-line description (file references, originating PR/commit if useful)`. Don't act on parked entries unprompted.

## Further reading

- `prisma/schema.prisma` — full data model (Event, Venue, Room, Function and subtypes, Contact, all order types).
- `src/lib/auth.ts` — `authorized` callback, `requireAuth`, cookie config.
- `src/lib/tenant.ts`, `src/lib/permissions.ts`, `docs/multi-tenancy.md` — active tenant, `PermissionTarget`, super admin.
- `src/lib/conflicts.ts`, `src/app/events/breakout-schedule/actions.ts` — the riskiest logic in the codebase (time-zone math, scheduling conflicts). Use the shared helpers rather than new math: `parseDateTimeInTimezone` (`src/lib/timezones.ts`) for datetime-local + zone → UTC, `formatTimeRange` (`src/lib/agendaUtils.ts`) for schedule-row labels.
- `docs/oauth-mcp.md` — OAuth for the MCP connector: flows, secrets, schema.
- `docs/hotels.md` — Hotels module: model, pickup math (`src/lib/hotelPickup.ts`), ESG/PER mapping, import runbook.
- `docs/checklists/adding-entity.md` — full checklist for new entities/order types.
- `docs/checklists/share-report-integration.md` — five-surface wiring for new shareable reports.
- `reviews/claudemd/conventions-observed.md` — the descriptive convention audit this file is derived from.
- `reviews/claudemd/decisions.md` — recorded decisions per row, with rationale.
