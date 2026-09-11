# Event Manager Tool

Internal tool for managing conferences and events: contracts, vendors, facility/room scheduling, speaker logistics, catering, and AV planning. Not attendee-facing — internal staff use only. Multi-tenant: every domain row belongs to a `Tenant` (an "organization"), users are global and hold a role per tenant membership. See § Multi-tenancy.

**Stack**: Next.js 14 (App Router) · TypeScript · PostgreSQL · Prisma 6 · Tailwind v4 · NextAuth 5 (Credentials + JWT). Deployed via Docker Compose.

## Quick reference

```bash
npm run dev         # Start development server
npm run build       # Production build
npm run lint        # eslint src/
npm run db:migrate  # Create + apply a dev migration (schema changes ship as prisma/migrations)
npm run db:deploy   # Apply pending migrations (what the Docker CMD runs)
npm run db:push     # Throwaway dev databases only — never on a populated one
npm run db:studio   # Open Prisma Studio
npm run db:seed     # Seed default options + admin user
npm run db:generate # Regenerate the Prisma client after a schema edit
docker compose up   # Run full stack in containers
```

**Deploy.** Production runs the prebuilt image `ghcr.io/ki4hrg/event-manager`: `.github/workflows/build.yml` lints, builds, pushes, then pings the Dockhand webhook. Compose has no `build:` block (`docker compose up` pulls), and the container CMD runs `prisma/baseline.mjs`, `prisma migrate deploy`, then the seed (`Dockerfile`).

No test runner and no structured logger ship with the project. Don't add ad-hoc tests, a test runner config, or `console.error` calls for "logging". If observability is ever needed, introduce a logger project-wide rather than peppering call sites.

## Architecture invariants

These are the load-bearing rules. Breaking one breaks the model the rest of the app assumes.

- **App Router only.** Routes live under `src/app/`. Do not create a `pages/` directory.
- **Server Actions are the mutation channel for the UI.** Route handlers (`route.ts`) are reserved for cases Server Actions can't express: NextAuth callbacks (`src/app/api/auth/[...nextauth]/route.ts`), `multipart/form-data` uploads (`src/app/api/upload/route.ts`), binary file streaming (`src/app/api/files/[fileId]/route.ts`), the MCP connector (`src/app/api/mcp/route.ts`) which speaks JSON-RPC to programmatic callers via bearer auth (OAuth 2.1 JWT or API key), and the MCP OAuth 2.1 endpoints + discovery docs (`src/app/api/oauth/*/route.ts`, `src/app/api/well-known/*/route.ts`). Do not add other JSON CRUD route handlers.
- **No repository / DAL.** Pages, Server Actions, and `src/lib/` helpers all call Prisma directly via the singleton from `@/lib/prisma`. Never `new PrismaClient()` at runtime (`prisma/seed.mjs` and `scripts/*.ts` are the only exceptions — they run outside the Next runtime).
- **Auth is defense-in-depth.** Middleware (`src/middleware.ts`) gates every request except the public prefixes listed in § Security and validation (`/login`, `/api/auth/*`, `/share/*`, the password-reset pages, `/api/mcp`, and the OAuth/discovery routes). `/api/mcp` does its own bearer-token auth via `@/lib/mcpOAuth` + `@/lib/mcpAuth`. Admin route segments add a `layout.tsx` that calls `requirePermission(<RESOURCE>, "VIEW")` (`requireSuperAdmin()` for `/tenants`). Every Server Action also self-protects with `await requirePermission(...)` as its first line — with one carve-out for report data actions, documented in § Server Actions.
- **No global client state.** No Zustand / Jotai / Redux / SWR / React Query. Use React built-ins (`useState`, `useTransition`, `useRef`). Cross-request preferences go in the `UserSetting` table.
- **Tenant-scoped data.** Every top-level domain model (Event, EventSeries, Venue, Contact, Vendor, CustomOption, Equipment, StorageLocation, InventoryItem, WorkflowTemplate) carries `tenantId`; event-scoped children inherit the tenant through the event. Every read on those models filters by tenant and every write sets or asserts it — see § Multi-tenancy. Users, Roles, API keys, and OAuth tables are global.

## Route archetypes

Every page belongs to one of these. When adding a new feature, find the closest archetype and replicate it.

### A. Authenticated CRUD list — `src/app/<entity>/page.tsx`
Server component, `export const dynamic = "force-dynamic"`, awaits `get<Entity>()` from sibling `actions.ts`, renders `<PageWrapper>` + `<PageHeader>`. For lists with no client-side state, render rows inline — either a `<table>` when columns aid comparison (`src/app/events/page.tsx`) or a `<div>`-per-row card list for one-detail-per-row layouts (`src/app/events/[id]/print-orders/page.tsx`). Lift to a `*ListClient` (`"use client"`) the moment any of sort / select / filter / bulk edit is needed. New action is a link to `/<entity>/new`.

### B. Form with Server Action — `src/app/<entity>/new/page.tsx`, `src/app/<entity>/[id]/page.tsx`
Server page fetches lookup data, then passes Server Actions as props to a client `*Form`. Pass the raw imported action when its signature already matches the client's expectation. Wrap it in an inline `"use server"` arrow closure when you need to bind context the client shouldn't supply (e.g. an `eventId` from `params`) — see Archetype C. The `*Form` is `"use client"`, uses `useState` for edit/view toggle, and `useFormStatus()` for the pending submit button. The action calls `revalidatePath(...)` then `redirect(...)`. Example: `src/app/events/EventForm.tsx`, `src/app/events/[id]/page.tsx`.

### C. Event-scoped subresource — `src/app/events/[id]/<order-type>/[<id>]/page.tsx`
Awaits `params: Promise<{ id: string; ... }>`, loads dependencies in parallel via `Promise.all([...])`, calls `notFound()` when missing, and wraps remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id before passing them to the client component. Example: `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:73-190`.

### D. Report — `src/app/events/[id]/reports/[name]/`
Three files plus a `print/` route: server `page.tsx`, `ReportFilters.tsx` (client, accepts `basePath`/`hidePrint`/`shareButton` props), `[Name]Report.tsx` (body, also rendered by the share route), and `print/page.tsx` (uses `PrintHeader`). Report data actions live in `src/app/events/reports/actions.ts` and **must not** call `requireAuth()` — the share route reuses them. See § Reports.

### E. Unauthenticated share view — `src/app/share/[token]/page.tsx`
Validates `getActiveShareLink(token)` (revoke / expiry), fires `recordShareLinkAccess` as a fire-and-forget update, and branches on `link.reportType` to render the matching report component. Auth is bypassed by the `authorized` callback in `src/lib/auth.ts` for the `/share/*` prefix. The multi-report dashboard sibling — `src/app/share/group/[token]/page.tsx` (tabs + per-item filters) and `src/app/share/group/[token]/[itemId]/print/page.tsx` — reads only the auth-free helpers in `src/lib/shareLinks.ts` (`getActiveShareLinkGroup`, `recordShareLinkGroupAccess`); any new reader either share view consumes inherits the auth-free rule.

### F. Admin-only segment — `src/app/{settings,users,workflows,system,tenants}/`
The segment's `layout.tsx` calls `requirePermission(<RESOURCE>, "VIEW")` — or `requireSuperAdmin()` for `/tenants`. `/users` is the one multi-resource segment: its layout admits anyone holding `hasGlobalView` on USERS, ROLES, or API_KEYS and each tab page re-checks its own resource. Otherwise child pages do not re-check (the permission check inside each Server Action covers mutations). Pages that exist only to edit (`*/new`, `/events/[id]/settings`, `/events/[id]/import`, the dashboard editor) gate the whole page with `requirePermission(..., "WRITE", ...)` rather than rendering a form the action would refuse. Pure-redirect pages can stay plain (`src/app/settings/page.tsx`).

### G. API route handler — `src/app/api/`
Ten exist — the four named above plus the six MCP OAuth/discovery routes. Add another only when a Server Action can't satisfy the requirement (binary stream, multipart upload, framework callback, MCP). When you do, follow Next 14 async-params (`params: Promise<...>`) as in pages, and self-protect exactly like a Server Action: `await requirePermission(...)` first (`src/app/api/upload/route.ts:49`, `src/app/api/files/[fileId]/route.ts:21`). `/api/mcp` and `/api/oauth/*` are the exceptions — they do bearer / PKCE auth instead.

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

- Every authenticated `page.tsx` declares `export const dynamic = "force-dynamic"`. Carve-outs: `src/app/login/page.tsx`, `src/app/share/[token]/page.tsx` (both unauthenticated), and pure-redirect pages (`src/app/settings/page.tsx`, `src/app/equipment/page.tsx`, `src/app/storage-locations/page.tsx`, `src/app/system/page.tsx`).
- Type page props as `params: Promise<{...}>` and `searchParams: Promise<{...}>`, then `await` them.
- Use `Promise.all([...])` to fan out independent fetches inside a page.
- Missing records call `notFound()`. Do not add `error.tsx`, `not-found.tsx`, or `loading.tsx` files — rely on Next's defaults.
- Filter state on list and table pages lives in URL search params (bookmarkable, share-friendly, survives refresh and back-button). On filter change, call `router.push(\`${basePath}?${params.toString()}\`)`. Reserve `router.replace` for URL changes that should NOT add a history entry (e.g. `Toast` clearing `?success=` in `src/components/Toast.tsx:21`, tab state in `src/app/share/group/[token]/GroupTabsClient.tsx`, or dropping a filter param that no longer matches any option in `src/app/events/[id]/packing/PackingListClient.tsx`) — pass `{ scroll: false }`.
- Validate URL list params against an allowed set before passing them into a `Set.has` lookup. See `selectedSections.filter((s) => validSectionValues.has(s as ProfileSection))` in `src/app/events/[id]/reports/event-profile/page.tsx:34-37`. Un-validated list params (`?days=banana`) silently empty results and look like a backend bug. Report data actions treat an unrecognized enum filter value as "no filter" rather than an empty result (`enumFilterSet` in `src/app/events/reports/actions.ts`).
- **Breadcrumbs.** Every entity detail page renders `<Breadcrumbs items={[...]} />` shaped as: (1) top-level section (`{ label: "Events", href: "/events" }`), (2) parent entity (`{ label: event.name, href: \`/events/${eventId}\` }`), (3) immediate parent list (`{ label: "Presentations", href: ... }`), (4) the entity's own name with no `href`. Use the plural list label (`Functions`, `Presentations`, `Setup Orders`) — not the page title.
- Import via `@/...` (`@/* → ./src/*`) across feature boundaries. A "feature" is a directory under `src/app/<feature>/`; sibling imports inside one feature may stay relative. Anything crossing out of a feature dir — into `src/lib/`, `src/components/`, another `src/app/<other-feature>/`, or `src/types/` — uses `@/...`.

### Server Actions

- Co-locate in a sibling `actions.ts` whose first directive is `"use server"`.
- Start every exported action with `await requirePermission(RESOURCE, ACTION, eventId?)` from `@/lib/permissions` (or `await requireSuperAdmin()` from `@/lib/tenant` for platform administration). It returns the session plus `tenantId` — the event's tenant when an event id was given, the active tenant otherwise — which the action hands to the `*Core` it calls. The third argument is `string | null | undefined`: pass a possibly-null event id straight through (file actions on venue-attached files) — null and undefined both resolve to a tenant-level check. **Carve-out:** actions reachable from a public route are auth-free — the read-only report actions in `src/app/events/reports/actions.ts` (reused by `/share/[token]/` and `/share/group/[token]/`) and the token-flow actions in `src/app/forgot-password/actions.ts` and `src/app/reset-password/[token]/actions.ts`. Nothing else.
- Readers whose signature carries only an entity id (`getFunction`, `getAVOrder`, …) fetch first, then gate on the fetched `eventId`: `const row = await prisma.x.findUnique(...); if (!row) return null; await requirePermission(RESOURCE, "VIEW", row.eventId);`. One round-trip, and the UNASSIGNED-VIEW `notFound()` still hides existence. Example: `getFunction` in `src/app/events/functions/actions.ts`.
- Every export from a `"use server"` module becomes an RPC endpoint and must be an async function. Shared constants, unions, sentinels, and lookup maps go in a plain sibling module — `src/app/events/sidebar-sections.ts` next to `sidebar-actions.ts`, `src/app/events/[id]/reports/packing-list/params.ts` for values the page, print, and share surfaces share.
- `*Core(args, userId)` functions live in a sibling `core.ts` with no `"use server"` directive — never in `actions.ts`. A core that trusts a caller-supplied `userId`, exported from a `"use server"` file, would let user A act as user B from the browser. The wrapper passes `session.user.id`; MCP tools pass the bearer-resolved id (`src/app/contacts/core.ts` + `actions.ts`).
- Per-user preferences with no resource (sidebar collapsed, landing page) are the one case an action starts with `await requireAuth()` instead of `requirePermission`; it writes `setUserSetting(session.user.id, ...)` and returns void (`setEventSidebarCollapsed` in `src/app/events/sidebar-actions.ts`). The layout reads the setting server-side and passes an `initialX` prop — no `mounted` gate, no client-side storage.
- Read inputs by type. Strings: `(formData.get("field") as string) || null`. Numbers: `parseInt(formData.get("field") as string)` for required ints, or `formData.get("field") ? parseInt(...) : null` for nullable ints — don't blanket-apply `|| null` to numerics, it turns `"0"` into `null`. Booleans: `formData.get("field") === "true"`. Multi-value: `formData.getAll("field") as string[]`.
- After a mutation, call `revalidatePath(...)` for the entity's own list + detail routes, then `redirect(...)`. Cross-cutting changes (e.g. an option rename propagating across dozens of consumers) rely on `force-dynamic` — don't enumerate every consumer. Don't use `revalidateTag` (the project doesn't tag fetches).
- **Redirect target.** Thin top-level entities (User, Event, Venue, Contact) redirect to the list view after create. Entities that need further setup (Vendor, every order type, Presentation, Function) redirect to the detail view. Duplicates always redirect to the new copy's detail view. Updates always stay on the detail view.
- **Toasts.** Every successful mutation appends `?success=<short message>` to the redirect URL. The destination page mounts `<Toast />` wrapped in `<Suspense fallback={null}>` so `useSearchParams()` inside doesn't bail.
- Return shape: (a) `void` after `redirect()` for create/update from a `<form>`; (b) `void` without redirect for bulk operations called from a client list (the client calls `router.refresh()`); (c) the raw Prisma model for read actions consumed by server components. Do not introduce a `{ success, error }` envelope; do not use `useActionState`.
- For event-scoped detail pages, wrap remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id before passing them to client components (Archetype C).
- Cache shared readers with `cache()` from `react` **only** when the same reader is called more than once per request — typically a `layout.tsx` and its child `page.tsx`. `getEvent` is the current example (`src/app/events/actions.ts:44`).

### Forms and mutations

- Use native `<form action={serverAction}>`. The submit button uses `useFormStatus()` inside a `SubmitButton` subcomponent (see `src/app/events/EventForm.tsx:16-28`).
- Default to uncontrolled inputs (`defaultChecked` / `defaultValue`). Lift to controlled state (`checked` + `onChange`) only when the form mediates selection across UI transitions (text-filtering a long list, multi-select with bulk actions, undo). When you do, also emit a hidden `<input type="hidden" name="..." />` for any selected value the filtered view hides, so the payload still carries it. See `RoomSelector` in `src/app/events/functions/FunctionForm.tsx:46-170`.
- Forms with no view/edit toggle go read-only via `<fieldset disabled={!canWrite}>` plus a hidden submit (`src/app/vendors/VendorForm.tsx`, `src/app/contacts/ContactForm.tsx`) — don't duplicate a read-only branch.
- For non-form mutations (delete, status toggle, vendor swap), call the Server Action from inside `useTransition` and disable the trigger while pending (see `src/components/CancelOrDeleteButton.tsx`, `EntityStatusPanel.tsx`).
- Confirmation steps (delete, cancel) use inline state on the trigger, not modal dialogs (`src/components/DeleteButton.tsx`, `InlineDeleteButton.tsx`).
- After a mutation, the pattern is `await action(); router.refresh()`. No `useOptimistic`.

### Components

- Named exports for components, **except** where Next requires `export default` (page, layout, error, loading, not-found, route).
- Add `"use client"` only when the file needs local React state, an effect, a router hook, `useFormStatus`, `useTransition`, or a third-party client library (tiptap, @dnd-kit).
- `dangerouslySetInnerHTML` is allowed only for HTML produced by `RichTextEditor` (`src/components/RichTextEditor.tsx`, tiptap-backed) — currently the nine `menuContent` (catering menus) and setup `detail.description` call sites. Every call site carries a one-line comment naming the editor source (`{/* RichTextEditor output — chain: MenuSectionTable → RichTextEditor */}`); add one when you add a call site.
- A plain helper exported from a `"use client"` module becomes a client-reference proxy when a server component imports it and throws `TypeError: ... is not a function` during RSC serialization. Any utility called from server code lives in a non-client module — `src/lib/partyLabel.ts` is the reference; `party-field.tsx` keeps only the component and client-only helpers.
- Never call `setState` synchronously at the top level of a `useEffect` body (`react-hooks/set-state-in-effect` errors). Wrap it in `startTransition(() => setX(...))` — see `src/app/events/[id]/agenda/AgendaGrid.tsx`.
- A list inside a dnd-kit `SortableContext` with `verticalListSortingStrategy` (`src/app/settings/OptionList.tsx`) can't become a multi-column grid without switching to `rectSortingStrategy` — check for a `SortableContext` before gridding any list, and grid the surrounding cards instead.
- No helper text that narrates a control's behavior ("Stays open so you can keep going."). If a behavior needs a sentence to be understood, change the behavior. Placeholders, labels, empty states, and outcome messages ("Filed 6 items. 2 skipped.") carry information and stay.

### Read-only gating

- Server layouts resolve levels via `permissionLevels()` (`src/lib/permissions.ts`) and hand them to `<PermissionsProvider>` (`src/components/PermissionsProvider.tsx`); client panels call `useCanWrite` / `useCanDelete` / `useCanDo`. The hooks return `true` with no provider above them — a missing provider must never silently disable a working page. Server components call `hasPermission` directly.
- Shared write primitives (`DeleteButton`, `InlineDeleteButton`, `CancelOrDeleteButton`, `LinkedItemsPanel`, `VendorLinkControl`, `FunctionLinkControl`) take a **required** `resource` prop so a new call site can't keep showing an action to a read-only user; pass `requiredLevel="WRITE"` when the action's own gate is WRITE rather than DELETE.

### Data layer

- Use the singleton `prisma` from `@/lib/prisma`. Pages, Server Actions, and `src/lib/` helpers may call `prisma.<model>.<op>()` directly. Prefer a sibling `get*` action when the same query lands in two or more places; one-off lookups may stay inline.
- Tenant-owned lookups by id use `findFirst({ where: { id, tenantId } })` and `update`/`delete({ where: { id, tenantId } })` (extendedWhereUnique) rather than a bare `findUnique` — a foreign id is a not-found, never a cross-tenant read or write. Readers that only hold an event id use the relation filter `tenant: { events: { some: { id: eventId } } }` (`optionsWhereForEvent` in `src/lib/options.ts`).
- Domain types come from `@prisma/client`. For derived list/detail payloads, alias with `Awaited<ReturnType<typeof getX>>[number]`.
- Persist per-user preferences via `setUserSetting` / `getUserSetting` from `@/lib/userSettings` (backed by the `UserSetting` table). Don't add cookies or localStorage for the same need.
- When discriminating on a TypeScript union or Prisma enum, close the chain with an exhaustiveness check: `default: { const _exhaustive: never = value; throw new Error(\`Unhandled: ${value}\`); }` on a `switch`, or `const _exhaustive: never = link.reportType; throw new Error(...);` after the last `if` branch. Reference call sites: the `OptionCategory` switch in `propagateLabelRename` (`src/app/settings/actions.ts`) and the `reportType` switches in `src/app/share/group/[token]/page.tsx` and its `[itemId]/print/page.tsx`. `ShareLink.reportType` is a plain `String` column (adding a report type needs no migration), so those two checks use `as never` — they are what actually catch a missed share surface.
- Convert a `datetime-local` value plus an event timezone to a UTC `Date` with `parseDateTimeInTimezone` from `@/lib/timezones` — never `new Date(string)`. It is the single conversion point used by the functions, breakout-schedule, and catering-order cores.
- `FunctionSchedule.type` holds a `schedule_type` CustomOption **label** and consumers filter on that label. A writer that needs a default resolves it with `await defaultScheduleType(eventId)` (`src/lib/scheduleTypes.ts`) — never a hard-coded token like `"SESSION"`, or the rows silently vanish from type-filtered views.
- A classification that needs both a reliable code branch and admin-editable values is a small Prisma enum for the branch plus a `CustomOption` label for display (`StorageLocation.kind` `PLACE`/`CONTAINER` + `StorageLocation.type` from `location_type`). Register the label category in `propagateLabelRename`.
- Seeded, undeletable config rows carry a boolean `isSystem` (`CustomOption`, `Role`) — don't invent `isBuiltIn` / `isReadOnly` (`Vendor.isSystemVendor` predates the convention). Enum naming is split by purpose: resource-group enums are plural (`PermissionResource.FUNCTIONS`), per-entity refs singular (`StatusModelType.FUNCTION`) — follow one, don't add a third.
- Catalog vs instance: before adding a column to a catalog model, ask whether one catalog row needs to exist in more than one place at once. If so, add an instance model pointing at the catalog (`InventoryItem.equipmentId` → `Equipment`) instead of denormalizing the catalog.
- When `onDelete: Restrict` is the right FK semantics, pair it with a pre-check in the delete core whose only job is a readable error ("X still holds N items. Move or delete them first." in `deleteStorageLocationCore`), and re-read the confirm copy so it doesn't under-describe the behavior.
- `StorageLocation` is the one self-referential model (`parentId` → `children`, `onDelete: SetNull`). Read the whole catalog once via the `cache()`d `getLocationIndex` in `@/lib/storageLocations` and derive subtrees in memory — no recursive CTEs. Cycles are prevented by `assertNoCycle` in the core, not the DB, so every walk carries a visited set.
- `createMany({ skipDuplicates: true })` only dedupes when a unique index covers the row; Postgres treats NULLs as distinct, so a nullable column in the index (`EventKeyStaff @@unique([eventId, contactId, title])`) lets duplicates through. Check the index before relying on it.
- Helpers that use the `prisma` singleton (`resolveCreateStatus`, `autoAssignDefaultWorkflowsCore`) cannot join a `$transaction` — call them before or after the callback, never inside, where they would wait on locks the transaction holds. Never mutate an array declared outside the callback from inside it; a retry would duplicate entries.
- Files attach polymorphically; derive the event for a `FILES` permission check with `resolveEntityEventId` / `resolveFileEventId` from `@/lib/uploads` (venue-attached files resolve to `null` → tenant-level check).
- Any surface that returns Events — page, action, or MCP tool — ANDs in `eventScopeWhere(userId, tenantId)` from `src/app/events/core.ts`. It is the only definition of which events a user may see; omitting it turns the list into an enumeration channel.

### Styling

- Tailwind v4 utility classes everywhere. Concatenate with template literals. Do not introduce `cn()` / `clsx` / `tailwind-merge`.
- Apply `dark:` variants on every element with a color-bearing class (`text-`, `bg-`, `border-`, `divide-`, `ring-`, `placeholder:`). Layout-only classes (`flex`, `gap-2`, `mt-4`) don't need a dark counterpart. Print formatting uses `print:` utility variants plus the rules in `src/app/globals.css:47-62`.
- Reuse the class-string libs in `src/lib/` instead of redeclaring strings inline: `buttonStyles` (`btnPrimary`, `btnPrimarySm`, `btnSecondary`, `btnDanger`, `btnOutlinedSm`), `reportStyles` (`reportTh`, `reportTd`, etc.), `statusConstants`, and `colors`.

### Mobile and print

- **Reports** must render dual layouts: a mobile card view (`sm:hidden`) and a desktop/print table (`hidden sm:block print:block`). See § Reports.
- Other tables may rely on horizontal scroll inside `overflow-x-auto`. Every new full-page layout (sidebars, filter bars, forms) must remain functional at 360 px width.
- The 360 px rule has two mechanisms: filter/action toolbars get `flex-wrap` (`src/app/events/presentations/PresentationList.tsx`); tab strips get `overflow-x-auto` + `whitespace-nowrap` on the `<nav>` (`src/app/events/[id]/agenda/DateTabs.tsx`). Entity detail headers go through `<PageHeader>` (`src/components/PageHeader.tsx`: `flex flex-col gap-3 sm:flex-row sm:justify-between`, `min-w-0` on the title block, `flex-wrap` on the action row) rather than a hand-rolled flex row.
- Form fields are forced to 16px below 640 px in `src/app/globals.css:39-46` to stop iOS Safari focus-zoom. `text-sm` on an input is overridden on phones by design — don't "fix" it.
- Horizontal density: a full-width `flex justify-between` row puts actions ~1000 px from the label they act on. A list or settings row wider than ~600 px either caps its content width or moves to a multi-column grid. `max-w-*` belongs on forms (line length), not on card/list surfaces.
- On interactive report pages, the "Print / Save PDF" button is `<a href="${basePath}/print?...">` — never `window.print()`. On the dedicated `/print` route itself, `PrintButton` (`src/components/print/PrintButton.tsx`) calls `window.print()`.

### Environment and config

- Access `process.env` only inside `@/lib/prisma`, `@/lib/auth`, `@/lib/uploads`, and `@/lib/email`. Funnel any new env var through one of these four, and document it in `.env.example`. `@/lib/uploads` owns `UPLOAD_DIR` and `MAX_UPLOAD_BYTES` (plus the `ALLOWED_UPLOAD_MIME_TYPES` allowlist); `@/lib/email` owns the `MAILGUN_*` vars; `@/lib/auth` also exposes `getOAuthSigningSecret()` so the MCP OAuth JWTs share `AUTH_SECRET`.
- No `NEXT_PUBLIC_*` variables. No feature flag system.

## Security and validation

- **Authentication** is enforced first at middleware (`src/middleware.ts` re-exports the NextAuth `auth` callback). The `authorized` callback in `src/lib/auth.ts:67-89` exempts `/login`, `/api/auth/*`, `/share/*`, `/forgot-password`, `/reset-password/*`, `/api/mcp`, `/api/oauth/*`, `/api/well-known/*`, and `/.well-known/*`. The matcher in `src/middleware.ts` deliberately omits Next's default `\\..*` exclusion so `/.well-known/*` reaches middleware and needs its explicit exemption — re-adding the exclusion would silently change that. Every authenticated page can assume `session.user` exists.
- **Server Actions self-protect** with `await requirePermission(...)` (see § Server Actions for the report-actions carve-out). Reasoning: defense in depth, and a reviewer sees the protection at the top of the file without auditing middleware coverage.
- **Admin authorization.** Admin-only route segments (`/settings`, `/workflows`, `/system`) have a `layout.tsx` that calls `requirePermission(<RESOURCE>, "VIEW")`; `/users` admits any of USERS / ROLES / API_KEYS view via `hasGlobalView`; `/tenants` calls `requireSuperAdmin()`. Pages inside don't re-check (except the `/users` tabs); Server Actions still gate themselves.
- **Ownership is a second check.** `requirePermission(RESOURCE, ACTION, eventId)` proves the caller may act on that event — it does **not** prove the supplied entity id belongs to it. Every event-scoped mutation also binds the entity: `where: { id, eventId }` for top-level rows, a relation filter (`where: { id, function: { eventId } }`) for nested rows, or an `assert<Entity>InEvent(id, eventId)` pre-check for creates (`assertSupplyOrderInEvent` in `src/app/events/supply-orders/core.ts`); bulk ops always carry `where: { id: { in: ids }, eventId }`. Actions taking a polymorphic `(entityType, entityId, eventId)` tuple need three layers — `gateWorkflowAction`, `assertEntityInEvent`, `assertInstanceMatches` in `src/app/events/workflows/actions.ts`; batch readers swap the second for `filterEntityIdsInEvent`. GLOBAL resources (`STORAGE_LOCATIONS`, `VENDORS`, …) have no second boundary — a caller holding WRITE is authorized against every row in the tenant, and existence guards there are correctness checks, not authorization.
- **Path inputs.** Any client-supplied id that becomes part of a filesystem path passes `isValidEntityId` (`src/lib/uploads.ts:26`) first; ids are otherwise trusted only inside Prisma `where` clauses.
- **One-time email links** use `generatePasswordResetToken` / `consumePasswordResetToken` (`src/lib/email.ts`): `randomBytes(32).toString("base64url")` like share tokens, single-use via `usedAt`, prior unused tokens for the user invalidated on each send. Generalize these for any new link flow (verification, magic link) rather than re-implementing.
- **OAuth redirects.** An OAuth error may be redirected to `redirect_uri` only after that URI has matched the client's registered list (RFC 6749 §4.1.2.1); before that it renders in the browser, or the authorize endpoint becomes an open redirect. `AuthorizationRequestResult.redirectUri: string | null` in `src/lib/mcpOAuth.ts` encodes this — don't widen it.
- **Tenant isolation** is enforced in the data layer, not middleware: the permission layer picks the tenant (§ Multi-tenancy) and every query on a tenant-owned model carries it.
- **Input handling.** No runtime schema library (no zod / yup / valibot). Trust the TypeScript types for FormData shape. Use `throw new Error(...)` for runtime invariants (uniqueness preview, cross-field invariants — see `src/app/users/actions.ts:69-74`, `src/app/account/actions.ts:11-13`). Empty strings normalize to `null` with `|| null`.
- **Share links.** Tokens are validated by `getActiveShareLink` (`src/lib/shareLinks.ts:55-64`), which checks `revokedAt` and `expiresAt`. The share branch in `src/app/share/[token]/page.tsx` and its `/share/group/[token]/` sibling are the only public surfaces that read event data.

## Reports

Before adding a report route, check whether the request is a presentation variant of an existing one — a `?compact=true`-style toggle keeps one route, one filter bar, and one set of share wirings instead of duplicating the five share surfaces ("Schedule by Day" folded into `event-schedule?compact=true`). Every report under `/events/[id]/reports/[name]/` must render cleanly on mobile, print without UI chrome, and work in the unauthenticated `/share/[token]/` view. Equipment Responsibility and Vendor Handoff are the reference implementations.

### File layout
- `src/app/events/reports/actions.ts` — shared server actions for all reports. Must **NOT** call `requireAuth()`.
- `src/app/events/[id]/reports/[name]/page.tsx` — server component; fetches data and renders the filter bar + report.
- `src/app/events/[id]/reports/[name]/ReportFilters.tsx` — `"use client"`; accepts `shareButton?`, `hidePrint?`, `basePath?` props for share-view reuse.
- `src/app/events/[id]/reports/[name]/[Name]Report.tsx` — report body; consumed by both the authenticated route and `/share/[token]/`.
- `src/app/events/[id]/reports/[name]/print/page.tsx` — dedicated PDF route using `PrintHeader`.
- When a report must mirror an operational page, put the shared "what counts" rules in a plain `src/lib/` module (`src/lib/packingItems.ts` feeds both `getPackingListItems` and the auth-free `getPackingListData`) — a share-route-safe report must never import a `"use server"` module.

### Required: mobile-friendly tables
Every table renders BOTH a mobile card layout (`sm:hidden print:hidden`) and a desktop/print table (`hidden sm:block print:block overflow-x-auto`). Mobile card row: bold item name, qty right-aligned, role/provider/operator stacked muted, italic notes. See `EquipmentResponsibilityReport.tsx` for the canonical structure.

A 2-column table may skip the mobile card only when both columns fit in 360 px — concretely: ≤ 2 columns and the longest realistic cell is ≤ ~24 characters (e.g. `HH:MM – HH:MM` paired with a short room name). Anything wider — three columns, long item names, role/provider stacks — must dual-render. A `table-fixed` table without a mobile card variant is wrong on mobile: `overflow-x-auto` does nothing because the table never exceeds the viewport.

### Required: nav, anchors, section dividers
- Render `<ReportNav sections={[...]} itemGroups={[...]} />` from `src/components/ReportNav.tsx` as the first child of the report body. It's `sticky top-2 z-10` with `id="top"`, so every section divider's `↑ Top` link targets it.
- `sections` are top-level anchors (Key Contacts, Schedule, Equipment, Unscheduled). `itemGroups` is `{ label, links }[]` — each renders as its own `<details>` toggle so long lists stay collapsed. Legacy: `links={[...]}` behaves as `sections`; `items={[...]}` with optional `itemsLabel` renders as a single item group.
- Use `<SectionDivider id="..." title="..." />` from `src/components/SectionDivider.tsx` to group logical regions. Each divider includes a `↑ Top` control automatically — `SectionDivider` is `"use client"` because that control calls `window.scrollTo({ top: 0 })` (an `#top` anchor stopped at the sticky nav instead of the page header); `ReportNav` keeps `id="top"`.
- Every anchored card must include `scroll-mt-24` so jumped-to sections land below the sticky nav.

### Anchor ID conventions
- Top-level sections: kebab-case (`top`, `summary`, `key-contacts`, `function-schedule`, `equipment-summary`, `details`, `unscheduled`).
- Per-entity: `${kind}-${id}` (`function-${fn.id}`, `presentation-${presentation.id}`, `party-${partyId}`).
- When an entity appears under multiple parents in the same report, compound IDs are permitted: `${kind}-${id}-${parentId}` — entity first, then disambiguating parent. See `presentation-${item.entry.slot.presentation.id}-${item.entry.block.id}` in `src/app/events/[id]/reports/room-schedule/RoomScheduleReport.tsx:236`. The constraint is uniqueness on the page — kebab-case, no `:` / `/` / spaces.
- Never use raw composite keys containing `:` as HTML IDs — compute a clean anchor id separately from the React `key`.
- Anchor ids derived from free text (vendor/provider labels) are computed positionally (`procurement-group-${i}`), not slugified — uniqueness on the page is the only requirement, and a slug of user text can collide or emit non-CSS-safe characters.

### Filter bar conventions
- `ReportFilters` accepts `hidePrint?: boolean` — pass it from `src/app/share/[token]/page.tsx` so only the `ShareShell` header Print button shows.
- On mobile (`sm:hidden`), filter chips collapse behind a "Show filters / X active" toggle. Actions (Clear, Share, Print) remain always visible. Desktop unchanged (`hidden sm:flex`).
- `ReportFilters` accepts `paramPrefix?: string` and prepends it to every filter key it reads or writes — the dashboard share view namespaces each tab's params as `i_<itemId>_` (`itemPrefix()` in `src/app/share/group/[token]/page.tsx`). A new filter that skips the prefix collides with sibling tabs.
- A boolean toggle follows `usedOnly` on Room Schedule: string-boolean query param (`?usedOnly=true`), an optional field on `ShareLinkFilters` (`src/lib/shareLinks.ts`) read via `resolveSharedBoolean`, threaded through the page, print, share, and share-group surfaces.
- A report page receiving `?addToDashboard=<groupId>` renders `<AddToDashboardBanner>` and passes the matching `dashboardChoices` entry to `ShareReportButton`, which relabels its trigger "Add to <name>". Wire this alongside the share surfaces.

### Aggregation conventions
- Never use `"Multiple"` rollups. Split rows along the dimension that produced the ambiguity (e.g. by `(item, role, provider)`) so each row is concrete.
- Sort order: category → item name → role priority (Provider & Operator > Provider > Operator) → provider name.
- Sort by "the function's real start time" with `mainScheduleStart` / `compareByMainFunctionTime` (`src/lib/functionSchedules.ts`) — earliest public schedule, else the longest. Label schedule-row times with `formatTimeRange(start, end, timezone)` (`src/lib/agendaUtils.ts`): same-day collapses to `9:00 AM – 10:30 AM`, cross-day expands both sides to full datetimes. Room Schedule is the exception: a function crossing midnight renders one row per day with clipped labels (`9:00 PM →` / `Continues all day` / `→ 1:30 AM`), never an "All day" rollup.
- A shipping container is a `SupplyOrderItem` with `containerLocationId` set, not a separate entity — equipment-shaped aggregations over supply items exclude those lines (`containerLocationId: null`); packing rollups deliberately keep them.
- `<LastUpdated>` belongs on detail-style report cards (Function Detail, Vendor Handoff, Event Profile order cards), not on schedule rows — overview reports stay scannable.

### Print/PDF conventions
- Dedicated print route (`/print`); do NOT print the interactive screen directly.
- Use `PrintHeader` (`src/components/print/PrintHeader.tsx`) with `eventName`, `title`, `backHref`.
- Filter controls are not rendered on print pages — the URL carries them in.
- "Print / Save PDF" follows the two-layer rule in § Mobile and print.
- Use Tailwind class strings from `src/lib/reportStyles.ts` — do not re-declare inline.
- Wrap print regions in `<section>` — `src/app/globals.css:47-62` gives sections `break-inside: avoid-page` so a short section moves whole to the next page; individual cards keep `print:break-inside-avoid`. Tables that repeat headings across groups need `table-fixed` + explicit `<colgroup>` widths. Browser page headers/footers can't be suppressed from CSS — that's the user's print-dialog setting.

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
| Report style classes | `src/lib/reportStyles.ts` | `reportTh`, `reportTd`, etc. |

## Multi-tenancy

Full reference: [docs/multi-tenancy.md](./docs/multi-tenancy.md). The load-bearing rules:

- **Model.** `Tenant { id, name, slug }`; `TenantMembership { tenantId, userId, roleId }` is the only source of a user's permissions inside a tenant. `User.isSuperAdmin` marks platform admins (every permission everywhere, `/tenants`, role definitions). Role definitions are global, so `createRole`/`updateRole`/`deleteRole`/`duplicateRole` call `requireSuperAdmin()`, not `requirePermission(ROLES, ...)`.
- **Which tenant.** `src/lib/tenant.ts` owns it. The *active* tenant is a `UserSetting` (`active_tenant_id`) switched from the header (`TenantSwitcher` → `switchTenant`); `getTenantContext()` is the request-cached read, `requireActiveTenantId()` redirects to `/no-tenant` for accounts with no membership. Event-scoped checks ignore the active tenant and use the event's own (`getEventTenantId`, cached); the event layout re-points the active tenant to match and redirects once.
- **Permission API.** `requirePermission(resource, action, eventId?)` (session) returns `session.tenantId`. `requirePermissionForUser(userId, resource, action, target)` (cores, MCP) takes a `PermissionTarget`. `loadPermissionsForUser(userId, tenantId)`. `hasGlobalView(perms, resource)` unchanged. `requireEventTenantId(eventId)` for a core that hangs a global check or a contact create off an event.
- **Cores.** Global cores take `(args, userId, tenantId)`; event-scoped cores keep `(args, userId)`. Child rows (rooms, vendor contacts, workflow steps/items) are guarded by asserting the parent is the tenant's own first (module-private `assertVenueInTenant` in `src/app/venues/core.ts`, `assertVendorInTenant` in `src/app/vendors/core.ts`, `assertTemplateInTenant` in `src/app/workflows/actions.ts`, `assertEventRefsInTenant` in `src/app/events/core.ts`) — never by trusting the child id.
- **Scopes.** Resolving a GLOBAL-only resource (VENDORS / CONTACTS / WORKFLOWS) with an `eventId` yields ASSIGNED scope and therefore NONE — the event sidebar once hid Vendors from everyone this way. Resolve each resource at its own scope using `EVENT_SCOPED_PERMISSION_RESOURCES` / `GLOBAL_PERMISSION_RESOURCES` in `src/lib/eventPermissions.ts`. `EventStaff.accessLevel` is a cap applied once in `resolvePermissionForUser`: it narrows a role's ASSIGNED level for one event and never widens it, which is why setting one needs no extra permission and no self-escalation guard. There is no NONE level; removing the staff row revokes access.
- **Uniqueness** is per tenant: `EventSeries (tenantId, name)`, `CustomOption (tenantId, category, label)`, `Equipment (tenantId, category, name)`.
- **Defaults.** New tenants are seeded inside `createTenantCore`'s transaction from `prisma/tenantDefaults.mjs`; the seed runs the same function for every existing tenant.
- **Users admin** (`/users`) is the active tenant's member list; "Add User" adds an existing account as a member or invites a new one. Removing a member deletes the membership plus their staff rows on that tenant's events; deleting the account is super-admin only. Event staff pickers only offer tenant members.
- **Migrations.** Schema changes touching populated tables ship in `prisma/migrations/` (`0_init` baseline + `prisma/baseline.mjs` for db-push-era databases); the Docker CMD runs `migrate deploy`.

## Vendor model types

Vendors are tagged with one or more "model types" (`CATERING_ORDER`, `AV_ORDER`, `SETUP_ORDER`, `PRINT_ORDER`, `SUPPLY_ORDER`, `MEDIA_DELIVERABLE`) indicating which order types they service; this drives vendor picker filtering. The `ModelType` union lives in `src/app/vendors/core.ts` (re-exported from `actions.ts`); display labels in `src/app/vendors/model-types.ts` (no `"use server"` directive, so client components can import). Always import `MODEL_TYPES` / `MODEL_LABELS` from `model-types.ts` for display — never re-declare inline.

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
Use the same sentinel string for "no value" across `<select>` options, internal state, and URL params. Prefer `__blank__` for `<select>` values; if a URL param has to be human-readable (`?room=none`), translate at the page boundary once and use `__blank__` internally. Never invent a third string (e.g. mixing `none` / `no` / `__none__` / `__blank__` inside one feature) — pick one and convert at the edge. Empty string (`""`) means "All / no filter". Presence filters (has vendor / missing vendor) are a separate tri-state — `""` / `"yes"` / `"none"` — shared verbatim between URL param, state, and `<select>`; don't conflate them with `__blank__`, which means "this field is null".

Status filter idiom:
```ts
if (filters.status === "__blank__") {
  if (o.status != null) return false;
} else if (filters.status && o.status !== filters.status) return false;
```

## Adding a new entity / order type

Full checklist at [docs/checklists/adding-entity.md](./docs/checklists/adding-entity.md). Covers schema, auth/permissions, routes, sidebar, overview, status/workflow, vendor model types, uploads, and the report integrations the new entity should flow through. Cross-reference SupplyOrder (commit a880f43 + the SupplyOrder UI alignment PR) as the most recent end-to-end reference.

## Breakout session labels

Anywhere a breakout session (a `Function` with `type === "BREAKOUT_BLOCK"`) is displayed by name, prepend its `BreakoutGroup.name` so "Session 1" reads as "Learn & Lead Session 1":

```ts
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";

formatBreakoutSessionName(session.name, session.breakoutGroup?.name)
```

The helper falls back to just the session name when no group is provided. When adding a view that shows a function name where the function could be a breakout block, include `breakoutGroup: { select: { name: true } }` in the Prisma query and apply the helper. Apply it to filtering/sorting too — users see and search the prepended form.

## MCP connector

`src/app/api/mcp/route.ts` exposes a hand-rolled JSON-RPC 2.0 endpoint speaking the MCP protocol (stateless `tools/list` + `tools/call`). Bearer auth via `Authorization: Bearer <token>` — an OAuth 2.1 access token (claude.ai remote connectors) is tried first, then API-key lookup; users mint their own keys at `/account/api-keys`, and each key inherits its owning user's memberships, roles, and event assignments across every tenant. Every tool except `list_tenants` takes a `tenant` argument (slug or id): `classifiedTools()` injects it into each schema and the dispatcher resolves it via `resolveTenantForUser` and strips it before the handler runs (`TENANT_ARG` / `TENANT_FREE_TOOLS` in `src/lib/mcpTools/index.ts`). It may be omitted only when the user belongs to exactly one tenant; unknown and off-limits handles fail identically. `McpToolContext` is `{ userId, tenantId }`. Admins audit/revoke any user's key at `/users/api-keys` — gated by the `API_KEYS` `PermissionResource` (seeded admin-only). Minting itself is `requireAuth()` only, scoped to the caller's userId.

### Where things live
- **Route** — `src/app/api/mcp/route.ts`. POST-only; dispatches JSON-RPC; maps `PermissionError` → MCP error codes; serializes results through `serializeForMcp` (`src/lib/mcpSerialize.ts`). GET returns 405.
- **Bearer auth** — `src/lib/mcpAuth.ts`. SHA-256 lookup against `ApiKey.hashedKey`; rejects revoked keys; stamps `lastUsedAt` fire-and-forget. Keys are random 32-byte base64url tokens (NOT bcrypt — high-entropy randoms need a single indexed hash lookup, not a per-row compare).
- **OAuth 2.1** — `src/lib/mcpOAuth.ts`: HS256 JWT access tokens (signed with `AUTH_SECRET` via `getOAuthSigningSecret()` in `src/lib/auth.ts`, never stored), PKCE S256, opaque rotating refresh tokens. Authorization codes and refresh tokens are stored SHA-256 only, same reasoning as API keys. Endpoints: `src/app/api/oauth/{register,authorize,token,revoke}/route.ts`; discovery docs under `src/app/api/well-known/*`, rewritten from `/.well-known/oauth-*` in `next.config.mjs`; the approval page is `src/app/oauth/authorize/`. Registration is anonymous and public-client-only (PKCE is the binding); the `"mcp"` scope is cosmetic — authorization stays per-tool-call. A POST that yields no JSON-RPC reply (e.g. `notifications/initialized`) returns `202 Accepted` with an empty body, never `204` — claude.ai's native connector rejects 204. Full flow: `docs/oauth-mcp.md`.
- **Tool registry** — `src/lib/mcpTools/index.ts` aggregates per-entity files. Each tool is a `{ name, description, inputSchema, handler }` — see `src/lib/mcpTools/types.ts`.
- **Serialization** — `src/lib/mcpSerialize.ts` walks the result tree; converts `Date` → ISO 8601 string, `Prisma.Decimal` → string (preserves precision on financial fields).
- **Self-service UI** — `src/app/account/api-keys/` (page + actions + form + list). Linked from `/account`.

### Permission boundary
MCP tools resolve a userId from the bearer token and call `requirePermissionForUser(userId, resource, action, target)` from `@/lib/permissions` — `target` is a `PermissionTarget`: an event id string (tenant derived from the event) or `{ tenantId }` for a global check, never omitted — which **throws `PermissionError`** on denial (it never calls `redirect()`/`notFound()` — those are Next-navigation throws and can't fire from a non-render context). The session-bound `requirePermission()` is a thin wrapper that catches `PermissionError` and translates to the legacy redirect/notFound behavior for the UI. **Don't bypass the wrapper from a UI page** — an uncaught `PermissionError` surfaces as an opaque 500.

The report actions in `src/app/events/reports/actions.ts` remain auth-free (the share-route carve-out). The MCP tools in `src/lib/mcpTools/reports.ts` call `requirePermissionForUser(userId, EVENTS, VIEW, eventId)` before delegating — keeping access enforcement at the MCP boundary while leaving the underlying actions reusable by the share route.

### Adding a new MCP tool
1. Pick or create `src/lib/mcpTools/<entity>.ts`. Export a `McpToolDefinition[]`.
2. Each handler must (a) call `requirePermissionForUser` first, (b) call Prisma directly via `@/lib/prisma` — do NOT call sibling Server Actions (they use session auth via `auth()`), (c) return raw shapes; the dispatcher serializes them.
3. Register the new array in `src/lib/mcpTools/index.ts`.
4. JSON Schema in `inputSchema` is descriptive only; no runtime validation at the MCP boundary (same trust model as Server Actions trusting FormData typing). Tools throw `Error` for bad input.
5. A write tool that takes an id the caller can't get from another tool's output ships the read tool that yields it in the same change (`list_equipment_catalog` beside `create_inventory_item` in `src/lib/mcpTools/inventory.ts`).
6. Gate on the permission the UI enforces for the same read, not the resource that merely shares its name — `list_equipment_catalog` gates `STORAGE_LOCATIONS` VIEW because `getEquipment()` is auth-only so every order form can render a picker; gating on admin-only `EQUIPMENT` would make MCP stricter than the screen.

### `list_<entity>` vs `get_<entity>` convention
Every entity exposes a pair: `list_<entity>` returns the list-page summary include (one or two levels of nested IDs/labels and a few flat fields); `get_<entity>` returns the full detail include. End every `list_*` tool's description with: `Returns summary shape — use \`get_<entity>\` for full detail (<short comma list of the extra includes>).` Descriptions are the only signal the LLM has — keep them specific and in sync.

### Writes — `*Core(args, userId)` extraction pattern
When wiring an MCP write tool that mirrors an existing Server Action, factor out a pure `xxxCore(args, userId)` function from the action body (`xxxCore(args, userId, tenantId)` for cores that do a global check or create a top-level tenant-owned row; event-scoped cores derive the tenant from the event). The Server Action wrapper retains `FormData` parsing, `revalidatePath`, and `redirect`; the core owns `requirePermissionForUser` and the Prisma op (including any `$transaction`). MCP tools call the core directly with typed args. Single source of truth for business rules; no drift between UI and MCP behavior.

### Documented exceptions
- `mintApiKey` in `src/app/account/api-keys/actions.ts` **returns** a `{ fullKey, ... }` object — the deliberate exception to the "actions return void / redirect" convention. The plaintext key is shown once (we only persist `SHA-256(fullKey)`); the client renders a copy-once panel. Don't replicate unless you have an equivalent one-time-reveal requirement.
- `src/app/oauth/authorize/actions.ts` redirects off-site to the client's `redirect_uri`, so it deliberately skips `revalidatePath` and the `?success=` toast — the destination isn't ours to render.

## Anti-patterns

| Don't | Do | Why / where |
|---|---|---|
| `new PrismaClient()` in a route, action, or component | `import { prisma } from "@/lib/prisma"` | One connection pool per process. |
| New `app/api/<resource>/route.ts` for JSON CRUD | A Server Action in `actions.ts` | Route handlers are reserved for what Server Actions can't express. |
| New repository / service / DAL class wrapping Prisma | Call `prisma.<model>.<op>()` directly | Abstractions fragment the layer. |
| `revalidateTag(...)` or `fetch(..., { next: { tags } })` | `revalidatePath(<list>); revalidatePath(<detail>)` | Project doesn't tag fetches. |
| `useActionState`, `{ success, error }` envelopes | Throw on error; `redirect("/...?success=...")` on success | Established return shape across all action files. |
| `useOptimistic`, manual local rewrites after mutation | `await action(); router.refresh()` | Single mutation pattern. |
| `cn(...)`, `clsx`, `tailwind-merge`, ad-hoc class helpers | Template-literal concatenation; reuse `buttonStyles` / `reportStyles` / `statusConstants` / `colors` | No helper exists; adding one starts a split. |
| Redeclaring `btn*` / `report*` class strings inline | Import from `src/lib/buttonStyles.ts` / `src/lib/reportStyles.ts` | Single source of truth for visual style. |
| `window.print()` on an interactive report page | `<a href="${basePath}/print?...">` | The print route renders the chrome-free layout. |
| `error.tsx`, `not-found.tsx`, or `loading.tsx` files | `notFound()` from `next/navigation`; let Next render the default error UI | Zero such files exist. |
| `"Multiple"` rollup rows in reports | Split rows by `(item, role, provider)` | Concrete rows beat ambiguous summaries. |
| `null` / `undefined` as a `<select>` option value | Sentinel `value="__blank__"`; empty string means "All" | See § Order list § Absence sentinels. |
| Composite keys like `${a}:${b}` as HTML IDs | Compute a clean anchor id separately from the React `key` | Colon is not a CSS-friendly id char. |
| `process.env.X` outside `lib/prisma`, `lib/auth`, `lib/uploads`, `lib/email` | Funnel new env access through one of those modules | Four touchpoints, 0 `NEXT_PUBLIC_*`. |
| `export const FOO = ...` from a `"use server"` file | Plain sibling module (`sidebar-sections.ts`, `params.ts`) | Every export becomes an RPC endpoint and must be an async function. |
| A `*Core` exported from `actions.ts` | Sibling `core.ts` without `"use server"` | A browser could call it with any `userId`. |
| `new Date(datetimeLocalString)`; hard-coded `"SESSION"` schedule type | `parseDateTimeInTimezone`; `defaultScheduleType(eventId)` | Timezone-correct dates; schedule types are CustomOption labels. |
| Helper text narrating a control's behavior | Make the behavior self-evident; keep labels, placeholders, empty states, outcomes | See § Components. |
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

Format: `- [area] one-line description (PR/file reference if relevant)`. Don't update CLAUDE.md directly. Don't ask whether to add an entry — just add it. The parking lot is processed during periodic reviews.

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
- `src/lib/eventPermissions.ts` — event-scoped vs global resource lists, `PermissionMap`, `canDo`.
- `src/lib/mcpOAuth.ts`, `docs/oauth-mcp.md` — MCP OAuth 2.1 flow.
- `src/lib/conflicts.ts`, `src/app/events/breakout-schedule/actions.ts` — the riskiest logic in the codebase (time-zone math, scheduling conflicts).
- `docs/checklists/adding-entity.md` — full checklist for new entities/order types.
- `docs/checklists/share-report-integration.md` — five-surface wiring for new shareable reports.
- `reviews/claudemd/conventions-observed.md` — the descriptive convention audit this file is derived from.
- `reviews/claudemd/decisions.md` — recorded decisions per row, with rationale.
