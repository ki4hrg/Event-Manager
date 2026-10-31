# Architecture

How Event Manager is built: route archetypes, conventions per layer, the route-guard table, reports,
multi-tenancy, the MCP connector. The load-bearing rules are in `CLAUDE.md`; this file is the
reference behind them. Domain detail lives beside it: `docs/multi-tenancy.md`, `docs/oauth-mcp.md`,
`docs/hotels.md`, `docs/forms.md`, `docs/checklists/`.

## Route guards

The proxy (`src/proxy.ts`, Next 16's renamed middleware) runs NextAuth's `authorized` callback
(`src/lib/auth.ts`) on every request its matcher covers: a signed-out request to anything not
listed below is redirected to `/login`, API routes included (NextAuth v5 redirects rather than
answering 401). The proxy is the first layer only; every Server
Action and route handler checks again itself.

**Skipped by the matcher** (so the proxy's 10MB body limit doesn't cut them off; each caps its own
body with `uploadBodyRefusal` from `src/lib/uploads.ts` before reading it):

| Route | Guard |
|---|---|
| `POST /api/upload` | `auth()` session, then `requirePermission(FILES, WRITE, <entity's event>)` after parsing (the entity is in the body) |
| `POST /api/events/[id]/inbox/upload` | `auth()` session + `requirePermissionForUser(EVENTS, WRITE, eventId)`; refusals are JSON 401/403/404, never redirects |
| `POST /f/[token]/upload` | Same-Origin check, active form-link token, per-link rate limit, draft cookie |
| `POST /api/inbound-email` | HMAC-SHA256 + timestamp from the Cloudflare Email Worker (`verifyInboundSignature`), checked after reading a body of at most 25 MiB |

**Public in `authorized`** (the proxy lets them through; each has its own access check):

| Route | Access |
|---|---|
| `/login`, `/api/auth/*` | NextAuth credentials sign-in |
| `/forgot-password`, `/reset-password/[token]` | Auth-free by design; the reset token is the access |
| `/share/[token]`, `/share/group/[token]` | `getActiveShareLink` / `getActiveShareLinkGroup` (revoke, expiry); render reports only |
| `/f/[token]` (public forms) | The form-link token; every action re-resolves it (`src/lib/forms/links.ts`) |
| `/mcp`, `/mcp/*` | Bearer (the route answers 401 itself): OAuth access token (`verifyMcpAccessToken`), else API key (`src/lib/mcpAuth.ts`) |
| `/api/oauth/{register,authorize,token,revoke}` | OAuth 2.1: anonymous DCR, own sign-in form, PKCE S256, token-bound revoke (`docs/oauth-mcp.md`) |
| `/api/well-known/*`, `/.well-known/*` | Public discovery metadata. The matcher has no dotted-path exclusion, so `/.well-known/*` reaches `authorized`; adding one would silently change that |
| `/api/health` | Container healthcheck; must stay unauthenticated |
| `/api/inbound-email` | Also exempt here, though the matcher already skips it |

Share views and public forms are the only public surfaces that read event data. Share views render reports only: the Office downloads (`api/events/[id]/esg`) are authenticated-only and `ReportDownloadLinks` is never passed on a share view.

**Signed in** (everything else): pages assume `session.user`. Admin segments under
`src/app/(admin)/` gate in their `layout.tsx` (`requirePermission(<RESOURCE>, "VIEW")`; any of
USERS / ROLES / API_KEYS for `/users`; `requireSuperAdmin()` for `/tenants`). The authenticated
route handlers check permission before returning anything: `api/events/[id]/esg`
(`requirePermission` first), `api/files/[fileId]` (loads the file row, then `requirePermission`
on its owner), `api/events/[id]/rfps/[rfpId]` (its readers load the RFP's kind, then
`requirePermission` VIEW on that kind's resource).

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

### F. Admin-only segment — `src/app/(admin)/{settings,system,users,workflows,tenants}/`
The admin segments live in the `(admin)` route group (URLs unchanged). `src/app/(admin)/layout.tsx` renders `AdminShell` (nav + content column) once, so it stays mounted across admin pages; it grants nothing. Each segment's own `layout.tsx` gates entry: `requirePermission(<RESOURCE>, "VIEW")` (SETTINGS, SYSTEM, WORKFLOWS), any of USERS / ROLES / API_KEYS for `/users`, `requireSuperAdmin()` for `/tenants`. Child pages do not re-check (the permission check inside each Server Action covers mutations), except a page whose own resource differs from the segment's — `/settings/lists/[category]` gates the list's resource. Each page or segment renders its own heading; the shell has none. Pure-redirect pages can stay plain (`src/app/(admin)/settings/page.tsx`).

### G. Route handler — `src/app/api/`, `src/app/mcp/`
The current set, by reason:
- Framework callback: `api/auth/[...nextauth]`.
- Multipart upload: `api/upload`, `api/events/[id]/inbox/upload`, `f/[token]/upload` (public form). Each is excluded from the proxy matcher and checks `uploadBodyRefusal` before reading the body.
- Webhook: `api/inbound-email` (Cloudflare Email Worker, HMAC; also outside the proxy matcher).
- Binary stream: `api/files/[fileId]`, `api/events/[id]/esg` (.docx / .xlsx ESG + Post-Event Report downloads), `api/events/[id]/rfps/[rfpId]` (.docx RFP and comparison).
- MCP connector: `mcp` (JSON-RPC over API-key or OAuth bearer).
- OAuth 2.1 for the connector: `api/oauth/{register,authorize,token,revoke}`, `api/well-known/{oauth-authorization-server,oauth-protected-resource}` (rewritten from `/.well-known/*` in `next.config.mjs`). See `docs/oauth-mcp.md`.
- Container healthcheck: `api/health`.

Add one only when a Server Action can't satisfy the requirement (binary stream, multipart upload, framework callback, protocol endpoint). Authenticated handlers call `requirePermission(...)` first, like Server Actions (`api/events/[id]/esg/route.ts`). Follow Next 16 async params (`params: Promise<...>`) as in pages.

## Conventions

### Project structure

App Router only: no `pages/` directory. No structured logger yet: don't add `console.error` calls for logging; if observability is needed, introduce a logger project-wide.

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

- Every authenticated `page.tsx` declares `export const dynamic = "force-dynamic"`. Carve-outs: `src/app/login/page.tsx`, `src/app/share/[token]/page.tsx` (both unauthenticated), and `src/app/(admin)/settings/page.tsx` (pure redirect).
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
- Inline confirms (the design standard): `src/components/DeleteButton.tsx`, `InlineDeleteButton.tsx`.
- After a mutation, the pattern is `await action(); router.refresh()`. No `useOptimistic`.
- A form whose update action redirects back to its own page keeps its client state (still in edit mode). Key the form on the record's `updatedAt` so a save remounts it into view mode (`src/app/(admin)/settings/organization/page.tsx`).
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
- Colours are still raw palette classes, each with a `dark:` variant (design tokens are phase 5 of the standards sweep, `docs/HANDOFF.md`). Until a screen moves to tokens, a colour class without its `dark:` partner breaks dark mode there. Print formatting uses `print:` utility variants plus the rules in `src/app/globals.css:35-44`.
- Reuse the class-string libs in `src/lib/` instead of redeclaring strings inline: `buttonStyles` (`btnPrimary`, `btnSecondary`, `btnDanger`, `btnOutlinedSm`), `reportStyles` (`reportTh`, `reportTd`, `labelMicroCaps`, etc.), `statusConstants`, and `colors`.
- Copy follows the standards' verbosity rules. Project-specific: don't name the ESG/APEX part or section in UI copy outside the report itself.

### Mobile and print

- **Reports** must render dual layouts: a mobile card view (`sm:hidden`) and a desktop/print table (`hidden sm:block print:block`). See § Reports.
- Other tables may rely on horizontal scroll inside `overflow-x-auto`. A grid item containing such a table needs `min-w-0`, or the table widens the page instead of scrolling (`src/app/venues/[id]/page.tsx`).
- Phone-width mechanisms used here: filter/toolbar groups get `flex-wrap`; tab strips get `overflow-x-auto whitespace-nowrap` on the `<nav>` (`src/app/events/[id]/agenda/DateTabs.tsx`); title + actions headers stack with `flex flex-col gap-3 sm:flex-row sm:justify-between` and `min-w-0` on the title block (`src/components/PageHeader.tsx`).
- The header nav is inline only at `lg`; below that `MobileNav` renders the same arrays — add top-level links to `mainLinks` in `src/components/Header.tsx`, not as JSX. Admin pages go in `src/lib/adminNav.ts` (`ADMIN_PAGES`, `adminNavGroups`), which feeds the grouped admin nav (`AdminShell` in `src/components/AdminShell.tsx`, rendered once by `src/app/(admin)/layout.tsx`); the header carries one Admin link to its first page (`adminHomeHref`). `/equipment` and `/storage-locations` share the Inventory nav (`inventoryNavGroups` → `InventoryShell`). Grouped section navs render through `SideNav` (`src/components/SideNav.tsx`). Option lists are grouped by functional area in `OPTION_SECTIONS` (`src/lib/optionCategories.ts`); each list has its own page at `/settings/lists/[category]`, and `/settings/<area>` redirects to the area's first list.
- On interactive report pages, the "Print / Save PDF" button is `<a href="${basePath}/print?...">` — never `window.print()`. On the dedicated `/print` route itself, `PrintButton` (`src/components/print/PrintButton.tsx`) calls `window.print()`.

### Environment and config

- Every variable the app expects is listed in `src/lib/env.ts` (zod), checked once at server start from `src/instrumentation.ts`; add new ones there. The readers still use `process.env` (docs/DECISIONS.md): `@/lib/prisma`, `@/lib/auth` (`NEXTAUTH_SECRET` / `AUTH_SECRET`, `NEXTAUTH_URL`), `@/lib/uploads` (`UPLOAD_DIR`, `MAX_UPLOAD_BYTES`), `@/lib/email` (`MAILGUN_*`, `INBOUND_EMAIL_*`, `ANTHROPIC_API_KEY`); `scripts/import-hotel-manager.ts` reads its own `HM_*`. The full list with defaults is `.env.example`.
- No `NEXT_PUBLIC_*` variables. No feature flag system.

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
Five surfaces to wire — see [docs/checklists/share-report-integration.md](./checklists/share-report-integration.md). Missing one of the group surfaces throws `Unhandled report type: <X>` at runtime when a saved dashboard item references the new type.

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

Full reference: [docs/multi-tenancy.md](./multi-tenancy.md). The load-bearing rules:

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
- **Substatus:** `getSubstatusOptions()` from `src/app/(admin)/settings/actions.ts` → `CustomOption[]`, filtered by selected status via `group` field.
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

Full checklist at [docs/checklists/adding-entity.md](./checklists/adding-entity.md). Covers schema, auth/permissions, routes, sidebar, overview, status/workflow, vendor model types, uploads, and the report integrations the new entity should flow through. Cross-reference SupplyOrder (commit a880f43 + the SupplyOrder UI alignment PR) as the most recent end-to-end reference.

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
4. The dispatcher (`src/app/mcp/route.ts`) checks the JSON-RPC envelope (a `method`, `params` and tool `arguments` that are objects, batches of 1–20), then runs `checkToolArgs` (`src/lib/mcpTools/argGate.ts`): `inputSchema` **is enforced**, so keep it accurate. Required keys, types, enums and 32-bit integer range are checked. An optional key may be `null`, or `""` unless it is a boolean (the partial helpers read both as "clear"); a required key or list entry may be `null` only if its type includes `"null"`. Numeric strings become numbers, and undeclared keys are dropped before the handler sees them, so a handler must declare every key it reads, and a shorthand it accepts (a bare string for an object) must be in the type. Handlers still check what values mean and throw `Error` for bad input.
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
| Cookies or `localStorage` for per-user preferences | `setUserSetting` / `getUserSetting` (`@/lib/userSettings`) | Server-side `UserSetting` table is the single store. |
| `findUnique({ where: { id } })` on a tenant-owned model | `findFirst({ where: { id, tenantId } })` | A foreign id must read as not-found. |
| `getOptions(category, tenantId)` or any tenant-explicit Server Action | Active tenant inside the action; `getOptionsForTenant` / `getOptionsForEvent` (`src/lib/options.ts`) for share routes | A client could pass any tenant id to a "use server" export. |
| Adding default options/equipment to `prisma/seed.mjs` | `prisma/tenantDefaults.mjs` | Shared by the seed (every tenant) and `createTenantCore`. |
| Adding a state library (Zustand / Jotai / Redux / SWR / React Query) | React built-ins + URL search params + `UserSetting` | Zero global client state. |

## Further reading

- `prisma/schema.prisma` — full data model (Event, Venue, Room, Function and subtypes, Contact, all order types).
- `src/lib/auth.ts` — `authorized` callback, `requireAuth`, cookie config.
- `src/lib/tenant.ts`, `src/lib/permissions.ts`, `docs/multi-tenancy.md` — active tenant, `PermissionTarget`, super admin.
- `src/lib/conflicts.ts`, `src/app/events/breakout-schedule/actions.ts` — the riskiest logic in the codebase (time-zone math, scheduling conflicts). Use the shared helpers rather than new math: `parseDateTimeInTimezone` (`src/lib/timezones.ts`) for datetime-local + zone → UTC, `formatTimeRange` (`src/lib/agendaUtils.ts`) for schedule-row labels.
- `docs/oauth-mcp.md` — OAuth for the MCP connector: flows, secrets, schema.
- `docs/hotels.md` — Hotels module: model, pickup math (`src/lib/hotelPickup.ts`), ESG/PER mapping, import runbook.
- `docs/checklists/adding-entity.md` — full checklist for new entities/order types.
- `docs/checklists/share-report-integration.md` — five-surface wiring for new shareable reports.
- `reviews/claudemd/conventions-observed.md` — the descriptive convention audit these conventions were derived from.
- `reviews/claudemd/decisions.md` — recorded decisions per row, with rationale.
