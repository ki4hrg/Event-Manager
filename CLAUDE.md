# Event Manager Tool

Internal tool for managing conferences and events: contracts, vendors, facility/room scheduling, speaker logistics, catering, and AV planning. Not attendee-facing — internal staff use only, single-tenant.

**Stack**: Next.js 14 (App Router) · TypeScript · PostgreSQL · Prisma 6 · Tailwind v4 · NextAuth 5 (Credentials + JWT). Deployed via Docker Compose.

## Quick reference

```bash
npm run dev         # Start development server
npm run build       # Production build
npm run lint        # next lint (ESLint)
npm run db:push     # Push schema changes to database
npm run db:migrate  # Create + apply a dev migration
npm run db:studio   # Open Prisma Studio
npm run db:seed     # Seed default options + admin user
docker compose up   # Run full stack in containers
```

No test runner and no structured logger ship with the project — see "Tests and observability" below before adding either.

## Architecture invariants

These are the load-bearing rules. Breaking one breaks the model the rest of the app assumes.

- **App Router only.** Routes live under `src/app/`. Do not create a `pages/` directory.
- **Server Actions are the mutation channel for the UI.** Route handlers (`route.ts`) are reserved for cases Server Actions can't express: NextAuth callbacks (`src/app/api/auth/[...nextauth]/route.ts`), `multipart/form-data` uploads (`src/app/api/upload/route.ts`), binary file streaming (`src/app/api/files/[fileId]/route.ts`), and the MCP connector (`src/app/api/mcp/route.ts`) which speaks JSON-RPC to programmatic callers via API-key bearer auth. Do not add other JSON CRUD route handlers — use Server Actions instead.
- **No repository / DAL.** Pages, Server Actions, and `src/lib/` helpers all call Prisma directly via the singleton from `@/lib/prisma`. Never `new PrismaClient()` at runtime (`prisma/seed.mjs` and `scripts/*.ts` are the only exceptions — they run outside the Next runtime).
- **Auth is defense-in-depth.** Middleware (`src/middleware.ts`) gates every request except `/login`, `/api/auth/*`, `/share/*`, and `/api/mcp` (which does its own bearer-token auth via `@/lib/mcpAuth`). Admin route segments add a `layout.tsx` that calls `requireAdmin()`. Every Server Action also self-protects with `await requireAuth()` (or `await requireAdmin()`) as its first line — with one carve-out for report data actions, documented in "Server Actions" below. See "Security and validation".
- **No global client state.** No Zustand / Jotai / Redux / SWR / React Query. Use React built-ins (`useState`, `useTransition`, `useRef`). Cross-request preferences go in the `UserSetting` table.
- **Single-tenant.** No organization / workspace model exists in `prisma/schema.prisma`. Don't introduce multi-org access controls.

## Route archetypes

Every page belongs to one of these. When adding a new feature, find the closest archetype and replicate it.

### A. Authenticated CRUD list — `src/app/<entity>/page.tsx`
Server component, `export const dynamic = "force-dynamic"`, awaits `get<Entity>()` from sibling `actions.ts`, renders `<PageWrapper>` + `<PageHeader>`. For lists with no client-side state, render rows inline — either a `<table>` when columns aid comparison (`src/app/events/page.tsx`) or a `<div>`-per-row card list for one-detail-per-row layouts (`src/app/events/[id]/print-orders/page.tsx`). Lift to a `*ListClient` (`"use client"`) the moment any of sort / select / filter / bulk edit is needed. New action is a link to `/<entity>/new`.

### B. Form with Server Action — `src/app/<entity>/new/page.tsx`, `src/app/<entity>/[id]/page.tsx`
Server page fetches lookup data, then passes Server Actions as props to a client `*Form`. Pass the raw imported action when its signature already matches what the client component expects. Wrap it in an inline `"use server"` arrow closure when you need to bind context the client shouldn't have to supply (e.g. an `eventId` from `params`, or a sub-entity id) — see Archetype C. The `*Form` is `"use client"`, uses `useState` for edit/view toggle, and `useFormStatus()` for the pending submit button. The action calls `revalidatePath(...)` then `redirect(...)`. Example: `src/app/events/EventForm.tsx`, `src/app/events/[id]/page.tsx`.

### C. Event-scoped subresource — `src/app/events/[id]/<order-type>/[<id>]/page.tsx`
Awaits `params: Promise<{ id: string; ... }>`, loads dependencies in parallel via `Promise.all([...])`, calls `notFound()` when missing, and wraps remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id before passing them to the client component. Example: `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:62-200`.

### D. Report — `src/app/events/[id]/reports/[name]/`
Three files plus a `print/` route: server `page.tsx`, `ReportFilters.tsx` (client, accepts `basePath`/`hidePrint`/`shareButton` props), `[Name]Report.tsx` (body, also rendered by the share route), and `print/page.tsx` (uses `PrintHeader`). Report data actions live in `src/app/events/reports/actions.ts` and **must not** call `requireAuth()` — the share route reuses them. See "Reports" for the full pattern.

### E. Unauthenticated share view — `src/app/share/[token]/page.tsx`
Validates `getActiveShareLink(token)` (revoke / expiry), fires `recordShareLinkAccess` as a fire-and-forget update, and branches on `link.reportType` to render the matching report component. Auth is bypassed by the `authorized` callback in `src/lib/auth.ts` for the `/share/*` prefix.

### F. Admin-only segment — `src/app/{settings,users,workflows}/`
The segment's `layout.tsx` calls `requireAdmin()`. Child pages do not re-check (`requireAdmin()` inside the Server Actions covers mutations). Pure-redirect pages can stay plain (`src/app/settings/page.tsx`).

### G. API route handler — `src/app/api/`
Only three exist; add a fourth only when a Server Action can't satisfy the requirement (binary stream, multipart upload, framework callback). When you do, follow Next 14 async-params (`params: Promise<...>`) as in pages.

## Conventions

### Project structure

```
src/
  app/              Next.js App Router. 76 page.tsx, 22 actions.ts, 3 route.ts.
  components/       Cross-feature shared components.
    print/          Print/PDF layout helpers (PrintHeader, PrintButton, ...).
    ui/             Generic UI primitives (ViewToggle, etc.).
  lib/              Utilities, helpers, Prisma + auth singletons, class-string libs.
  types/            Module augmentations only (next-auth.d.ts).
prisma/             schema.prisma + seed.mjs.
scripts/            One-off CLI scripts (run outside Next).
```

Feature-specific components colocate with their `actions.ts` under `src/app/<feature>/` (e.g. `src/app/events/EventForm.tsx`, `src/app/events/setup-orders/SetupOrderList.tsx`). `src/components/` is reserved for components reused across two or more features. Pages remain thin — fetch + delegate to the colocated client component.

Helper files under `src/lib/` use camelCase (`breakoutLabels.ts`, `agendaUtils.ts`, `optionUtils.ts`, `userSettings.ts`, `shareLinks.ts`, `roomGroups.ts`), not kebab-case.

### Pages and routing

- Every authenticated `page.tsx` declares `export const dynamic = "force-dynamic"`. The only carve-outs are `src/app/login/page.tsx`, `src/app/share/[token]/page.tsx` (both unauthenticated), and `src/app/settings/page.tsx` (pure redirect, no body).
- Type page props as `params: Promise<{...}>` and `searchParams: Promise<{...}>`, then `await` them. Same applies to new route handlers.
- Use `Promise.all([...])` to fan out independent fetches inside a page.
- Missing records call `notFound()`. Do not add `error.tsx`, `not-found.tsx`, or `loading.tsx` files — rely on Next's defaults.
- Filter state on list and table pages lives in URL search params (same reasoning as Reports — bookmarkable, share-friendly, survives refresh and back-button). On filter change, call `router.push(\`${basePath}?${params.toString()}\`)` so the URL stays in sync (see `src/app/events/[id]/reports/event-profile/ReportFilters.tsx:36-44`). Reserve `router.replace` for URL changes that should NOT add a history entry (e.g. `Toast` clearing `?success=` in `src/components/Toast.tsx:21`). Don't park filter state in `useState` alone.
- Validate URL list params against an allowed set before passing them into a `Set.has` lookup or downstream filter. See the `selectedSections.filter((s) => validSectionValues.has(s as ProfileSection))` pattern in `src/app/events/[id]/reports/event-profile/page.tsx:28-31`. Un-validated list params (`?days=banana`) silently empty the result and look like a backend bug.
- **Breadcrumbs.** Every entity detail page renders `<Breadcrumbs items={[...]} />` with this shape: (1) top-level section (`{ label: "Events", href: "/events" }`), (2) parent entity (`{ label: event.name, href: \`/events/${eventId}\` }`), (3) immediate parent list (`{ label: "Presentations", href: \`/events/${eventId}/presentations\` }`), (4) the entity's own name with no `href`. See `src/app/events/[id]/presentations/[presentationId]/page.tsx:288-293`. Use the plural list label (`Functions`, `Presentations`, `Setup Orders`) — not the page title (`Function List`).
- Import via `@/...` (`@/* → ./src/*`) across feature boundaries. A "feature" is a directory under `src/app/<feature>/` (e.g. all of `src/app/events/setup-orders/`); sibling imports inside one feature may stay relative. Anything crossing out of a feature dir — into `src/lib/`, `src/components/`, another `src/app/<other-feature>/`, or `src/types/` — uses `@/...`.

### Server Actions

- Co-locate in a sibling `actions.ts` whose first directive is `"use server"`.
- Start every exported action with `await requireAuth()` (or `await requireAdmin()` for admin-gated actions). Read-only **report** actions in `src/app/events/reports/actions.ts` are the deliberate exception — the unauthenticated share route reuses them, so they must remain auth-free.
- Read inputs by type. Strings: `(formData.get("field") as string) || null` before writing to Prisma. Numbers: `parseInt(formData.get("field") as string)` for required ints, or `formData.get("field") ? parseInt(formData.get("field") as string) : null` for nullable ints (see `src/app/events/setup-orders/actions.ts:254-256`) — don't blanket-apply `|| null` to numerics, it turns the string `"0"` into `null`. Booleans: `formData.get("field") === "true"` (see `src/app/vendors/actions.ts:131`). Multi-value fields: `formData.getAll("field") as string[]` (see `src/app/settings/actions.ts:68`).
- After a mutation, call `revalidatePath(...)` for the entity's own list + detail routes, then `redirect(...)`. Example: `updateSetupOrder(id, eventId, ...)` revalidates `/events/${eventId}/setup-orders` (list) and `/events/${eventId}/setup-orders/${id}` (detail). Cross-cutting changes (e.g. a settings label rename in `updateOption` propagating across dozens of consumers) rely on `force-dynamic` on the affected pages — don't try to enumerate every consumer. Do not use `revalidateTag` — the project doesn't tag fetches.
- **Redirect target.** Thin top-level entities (User, Event, Venue, Contact) redirect to the list view after create. Entities that need further setup on their detail page (Vendor, every order type, Presentation, Function) redirect to the detail view after create. Duplicates always redirect to the detail view of the new copy. Updates always stay on the detail view.
- **Toasts.** Every successful mutation appends `?success=<short message>` to the redirect URL. The destination page mounts `<Toast />` wrapped in `<Suspense fallback={null}>` so `useSearchParams()` inside doesn't bail.
- Return shape: three forms. (a) `void` after `redirect()` for create/update from a `<form>`. (b) `void` without redirect for bulk operations called from a client list (the client calls `router.refresh()` — see "Order list and bulk edit pattern" and `bulkUpdatePresentations` in `src/app/events/presentations/actions.ts:226-242`). (c) The raw Prisma model for read actions consumed by server components. Do not introduce a `{ success, error }` envelope. Do not use `useActionState`.
- For event-scoped detail pages, wrap remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id before passing them to client components (see Archetype C example).
- Cache shared readers with `cache()` from `react` **only** when the same reader is called more than once per request — typically because a `layout.tsx` and its child `page.tsx` both fetch the same entity. `getEvent` is the current example (`src/app/events/actions.ts:15`); don't wrap readers used in a single place.

### Forms and mutations

- Use native `<form action={serverAction}>`. The submit button uses `useFormStatus()` inside a `SubmitButton` subcomponent (see `src/app/events/EventForm.tsx:11-24`).
- Default to uncontrolled inputs (`defaultChecked` / `defaultValue`). Lift to controlled state (`checked` + `onChange`) only when the form mediates selection across UI transitions like text-filtering a long list, multi-select with bulk actions, or undo. When you do, also emit a hidden `<input type="hidden" name="..." />` for any selected value that the filtered view hides, so the submitted payload still carries it. See `RoomSelector` in `src/app/events/functions/FunctionForm.tsx:45-160` for the pattern.
- For non-form mutations (delete, status toggle, vendor swap), call the Server Action from inside `useTransition` and disable the trigger while pending (see `src/components/CancelOrDeleteButton.tsx`, `EntityStatusPanel.tsx`).
- Confirmation steps (delete, cancel) use inline state on the trigger, not modal dialogs (`src/components/DeleteButton.tsx`, `InlineDeleteButton.tsx`).
- After a mutation, the pattern is `await action()` then `router.refresh()`. No `useOptimistic`.

### Components

- Named exports for components, **except** where Next requires `export default` (page, layout, error, loading, not-found, route).
- Add `"use client"` only when the file needs local React state, an effect, a router hook, `useFormStatus`, `useTransition`, or a third-party client library (tiptap, @dnd-kit). Otherwise stay on the server.
- `dangerouslySetInnerHTML` is allowed only for HTML produced by `RichTextEditor` (`src/components/RichTextEditor.tsx`, tiptap-backed) — currently the four `menuContent` call sites in catering reports and `MenuSectionTable`. Render everything else as text. When you add a new call site, drop a one-line comment naming the editor source so a reviewer can see the chain at a glance.

### Data layer

- Use the singleton `prisma` from `@/lib/prisma`. Pages, Server Actions, and `src/lib/` helpers may call `prisma.<model>.<op>()` directly — there is no repository or query layer. Prefer fetching via a sibling `get*` action when the same query lands in two or more places; one-off lookups (e.g. resolving a `?functionId=` source param in `src/app/events/[id]/print-orders/new/page.tsx`) may stay inline in the page.
- Domain types come from `@prisma/client`. For derived list/detail payloads, alias with `Awaited<ReturnType<typeof getX>>[number]` (e.g. `src/app/events/setup-orders/SetupOrderList.tsx:18`).
- Persist per-user preferences via `setUserSetting` / `getUserSetting` from `@/lib/userSettings` (backed by the `UserSetting` table). Don't add cookies or localStorage for the same need.
- When discriminating on a TypeScript union or Prisma enum, close the chain with an exhaustiveness check: `default: { const _exhaustive: never = value; throw new Error(\`Unhandled: ${value}\`); }` on a `switch`, or `const _exhaustive: never = link.reportType; throw new Error(...);` after the last `if` branch. Adding a member to the union then fails the build instead of silently falling through. Applies to the `OptionCategory` cascade switch in `src/app/settings/actions.ts` and the `ShareLink.reportType` if-chain in `src/app/share/[token]/page.tsx:40-215`.

### Styling

- Tailwind v4 utility classes everywhere. Concatenate with template literals. Do not introduce a `cn()` / `clsx` / `tailwind-merge` helper.
- Apply `dark:` variants on every element with a color-bearing class (`text-`, `bg-`, `border-`, `divide-`, `ring-`, `placeholder:`). Layout-only classes (`flex`, `gap-2`, `mt-4`, `w-full`) don't need a dark counterpart. Print formatting uses `print:` utility variants plus the rules in `src/app/globals.css:35-44`.
- Reuse the class-string libs in `src/lib/` instead of redeclaring strings inline: `buttonStyles` (`btnPrimary`, `btnSecondary`, `btnDanger`, `btnOutlinedSm`), `reportStyles` (`reportTh`, `reportTd`, etc.), `statusConstants`, and `colors`.

### Mobile and print

- **Reports** must render dual layouts: a mobile card view (`sm:hidden`) and a desktop/print table (`hidden sm:block print:block`). See the "Reports" section.
- Other tables may rely on horizontal scroll inside `overflow-x-auto`. Every new full-page layout (sidebars, filter bars, forms) must remain functional at 360 px width.
- On interactive report pages, the "Print / Save PDF" button is `<a href="${basePath}/print?...">` — never `window.print()`. On the dedicated `/print` route itself, `PrintButton` (`src/components/print/PrintButton.tsx`) calls `window.print()`.

### Environment and config

- Access `process.env` only inside `@/lib/prisma`, `@/lib/auth`, and `@/lib/uploads`. Funnel any new env var through one of these.
- No `NEXT_PUBLIC_*` variables. No feature flag system.

### Tests and observability

The project intentionally ships without a test suite or structured logger. Don't add ad-hoc tests, a test runner config, or `console.error` calls for "logging". If observability is ever needed, introduce a logger project-wide rather than peppering call sites.

## Security and validation

- **Authentication.** Enforced first at middleware (`src/middleware.ts` re-exports the NextAuth `auth` callback as middleware). The `authorized` callback in `src/lib/auth.ts:74-85` exempts `/login`, `/api/auth/*`, and `/share/*`. Every authenticated page can assume `session.user` exists; it does not need to re-check.
- **Server Actions self-protect.** Every exported action starts with `await requireAuth()` or `await requireAdmin()`. Reasoning: defense in depth, and a reviewer can see the protection at the top of the file without auditing middleware coverage. The report-actions carve-out is stated once in "Server Actions" above.
- **Admin authorization.** Admin-only route segments (`/settings`, `/users`, `/workflows`) have a `layout.tsx` that calls `requireAdmin()`. Pages inside don't re-check; Server Actions still call `requireAdmin()` themselves.
- **Input handling.** No runtime schema library (no zod / yup / valibot). Trust the TypeScript types for FormData shape. Use `throw new Error(...)` for the cases that must be checked at runtime (uniqueness preview, cross-field invariants — see `src/app/users/actions.ts:46-55`, `src/app/account/actions.ts:11-13`). Empty strings are normalized to `null` with `|| null`.
- **Share links.** Tokens are validated by `getActiveShareLink` (`src/lib/shareLinks.ts:18-26`), which checks `revokedAt` and `expiresAt`. The share branch in `src/app/share/[token]/page.tsx` is the only public surface that reads event data.

## Reports

Every report under `/events/[id]/reports/[name]/` must render cleanly on mobile, print without UI chrome, and work in the unauthenticated `/share/[token]/` view. Equipment Responsibility and Vendor Handoff are the reference implementations — replicate their structure.

### File layout
- `src/app/events/reports/actions.ts` — shared server actions for all reports. Must **NOT** call `requireAuth()`.
- `src/app/events/[id]/reports/[name]/page.tsx` — server component; fetches data and renders the filter bar + report.
- `src/app/events/[id]/reports/[name]/ReportFilters.tsx` — `"use client"`; accepts `shareButton?`, `hidePrint?`, `basePath?` props for share-view reuse.
- `src/app/events/[id]/reports/[name]/[Name]Report.tsx` — report body; consumed by both the authenticated route and `/share/[token]/`, so changes apply everywhere automatically.
- `src/app/events/[id]/reports/[name]/print/page.tsx` — dedicated PDF route using `PrintHeader`.

### Required: mobile-friendly tables
Every table renders BOTH a mobile card layout and a desktop/print table:
```tsx
<>
  <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
    {rows.map((row) => (
      <div key={...} className="p-2">
        {/* bold item name, qty right-aligned, role/provider/operator stacked muted, italic notes */}
      </div>
    ))}
  </div>
  <div className="hidden sm:block print:block overflow-x-auto">
    <table className="w-full text-sm border-collapse">{/* same data */}</table>
  </div>
</>
```
A 2-column table may skip the mobile card only when both columns fit in 360 px — concretely: ≤ 2 columns and the longest realistic cell is ≤ ~24 characters (e.g. a `HH:MM – HH:MM` time paired with a short room name). Anything wider — three columns, long item names, role/provider stacks — must dual-render. A `table-fixed` table without a mobile card variant is wrong on mobile: `overflow-x-auto` does nothing because the table never exceeds the viewport width.

### Required: nav, anchors, section dividers
- Render `<ReportNav sections={[...]} itemGroups={[...]} />` from `src/components/ReportNav.tsx` as the first child of the report body. It's `sticky top-2 z-10` with `id="top"`, so every section divider's `↑ Top` link targets it automatically.
- `sections` are the top-level anchors users jump to (e.g. Key Contacts, Schedule, Equipment, Unscheduled) — always visible inline.
- `itemGroups` is `{ label, links }[]` — each renders as its own `<details>` toggle so long lists stay collapsed.
- Legacy props still work: `links={[...]}` behaves as `sections`; `items={[...]}` with optional `itemsLabel` renders as a single item group.
- Use `<SectionDivider id="..." title="..." />` from `src/components/SectionDivider.tsx` to group logical regions. Each divider includes a `↑ Top` link automatically.
- Every anchored card must include `scroll-mt-24` so jumped-to sections land below the sticky nav.

### Anchor ID conventions
- Top-level sections: kebab-case (`top`, `summary`, `key-contacts`, `function-schedule`, `equipment-summary`, `details`, `unscheduled`).
- Per-entity: `${kind}-${id}` (`function-${fn.id}`, `presentation-${presentation.id}`, `party-${partyId}`).
- When an entity appears under multiple parents within the same report (e.g. a presentation rendered once per breakout block), compound IDs are permitted: `${kind}-${id}-${parentId}` — the rendered entity first, then the disambiguating parent. See `presentation-${item.entry.slot.presentation.id}-${item.entry.block.id}` in `src/app/events/[id]/reports/room-schedule/RoomScheduleReport.tsx:200`. The constraint is uniqueness on the page — kebab-case, no `:` / `/` / spaces.
- Never use raw composite keys containing `:` or other CSS-unfriendly characters as HTML IDs — compute a clean anchor id separately from the React `key`.

### Filter bar conventions
- `ReportFilters` accepts `hidePrint?: boolean` — pass it from `src/app/share/[token]/page.tsx` so only the `ShareShell` header Print button shows.
- On mobile (`sm:hidden`), filter chips collapse behind a "Show filters / X active" toggle button. Actions (Clear, Share, Print) remain always visible. Desktop layout unchanged (`hidden sm:flex`).
- Filter state lives in URL search params (bookmarkable, share-friendly, server-rendered).

### Aggregation conventions
- When summarizing items across multiple sources, **never** use `"Multiple"` rollups. Split rows along the dimension that produced the ambiguity (e.g. by `(item, role, provider)`) so each row is concrete.
- Sort order: category → item name → role priority (Provider & Operator > Provider > Operator) → provider name.

### Print/PDF conventions
- Dedicated print route (`/print`); do NOT print the interactive screen directly.
- Use `PrintHeader` (`src/components/print/PrintHeader.tsx`) with `eventName`, `title`, `backHref`.
- Filter controls are not rendered on print pages — the URL carries them in.
- The "Print / Save PDF" button follows the two-layer rule documented under "Mobile and print" — link on the interactive page, `window.print()` only on the dedicated `/print` route.
- Use Tailwind class strings from `src/lib/reportStyles.ts` — do not re-declare inline.

### Share-view integration

Adding a new report means wiring **five share-link surfaces**. Miss one of the group surfaces and the dashboard switch falls through to `_exhaustive: never` and throws `Unhandled report type: <X>` at runtime when a saved item references the new type. Use the checklist below — `EVENT_SCHEDULE` (commits 721f199, aef1f20) is the most recent end-to-end reference.

1. **`src/lib/shareLinks.ts`** — add a `<TYPE>: "<Label>"` entry to `SHARE_REPORT_LABELS`. Add any new filter field (e.g. `includeNonPublic?: boolean`) to `ShareLinkFilters`.
2. **`src/app/events/[id]/share-links/dashboards/[groupId]/DashboardEditor.tsx`** — add the new type to `REPORT_PATHS`. The "Add report" picker iterates `Object.keys(REPORT_PATHS)`, so this single line surfaces it in the picker, builds the `?addToDashboard=` link, and lets the per-item edit row resolve its route.
3. **`src/app/share/[token]/page.tsx`** — add an `if (link.reportType === "<TYPE>")` branch (single-report share). Import the report component and its `ReportFilters` (with the `<Xs>ReportFilters` alias convention). Pass `basePath={`/share/${token}`}` + `hidePrint` (the `ShareShell` header already provides Print). Resolve stored vs URL filters with `storedFilters`/`getString(sp.X)` and `resolveSharedBoolean` for booleans. Run `getOptions` and the data action in `Promise.all`.
4. **`src/app/share/[token]/print/page.tsx`** — mirror the same branch in the print page. `Promise.all` the data + lookup fetches.
5. **`src/app/share/group/[token]/page.tsx`** and **`src/app/share/group/[token]/[itemId]/print/page.tsx`** — add a `case "<TYPE>":` to the switch in each. The group surfaces namespace filter params per item via `paramPrefix={prefix}` (`i_${itemId}_`), so the `ReportFilters` component must accept and prepend a `paramPrefix?: string` prop to every URL key it reads/writes (see `src/app/events/[id]/reports/room-schedule/ReportFilters.tsx` for the canonical wiring).

Additional invariants:
- The report data action stays auth-free (the share routes reuse it).
- `stripUpdatedBy(...)` runs on the result for share surfaces (not on the authenticated page).
- Filter intersection (`intersect(effectiveX, new Set(...))`) runs only when `!filtersLocked`, after the data fetch — same shape as the existing branches.

### Shared components reference
| Component | Location | Purpose |
|---|---|---|
| `ReportNav` | `src/components/ReportNav.tsx` | Sticky jump-to nav with `id="top"` |
| `SectionDivider` | `src/components/SectionDivider.tsx` | Labeled section ruler with back-to-top link |
| `PrintHeader` | `src/components/print/PrintHeader.tsx` | Print page header (event name, title, back link) |
| `ShareReportButton` | `src/components/ShareReportButton.tsx` | Create/manage share links from a report page |
| `ShareShell` | `src/app/share/[token]/ShareShell.tsx` | Layout shell for the share route |
| Report style classes | `src/lib/reportStyles.ts` | `reportTh`, `reportTd`, etc. |

## Vendor model types

Vendors are tagged with one or more "model types" that indicate which order types they service. This drives vendor picker filtering so users only see relevant vendors.

### Where things live
- **`ModelType` union** — `src/app/vendors/actions.ts`:
  ```ts
  export type ModelType = "CATERING_ORDER" | "AV_ORDER" | "SETUP_ORDER" | "PRINT_ORDER";
  ```
- **Display constants** — `src/app/vendors/model-types.ts` (no `"use server"` directive, so client components can import):
  ```ts
  export const MODEL_TYPES = [
    { value: "CATERING_ORDER", label: "Catering Order" },
    { value: "AV_ORDER", label: "AV Order" },
    { value: "SETUP_ORDER", label: "Setup Order" },
    { value: "PRINT_ORDER", label: "Print Order" },
  ] as const;

  export const MODEL_LABELS: Record<string, string> = Object.fromEntries(
    MODEL_TYPES.map(({ value, label }) => [value, label])
  );
  ```
  Always import from this file for display — never re-declare the array or labels inline.

### Filter behavior
`searchAssignedEventVendors(query, eventId, modelType?)` in `src/app/vendors/actions.ts` applies:
```ts
OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }]
```
Vendors with an empty `models` array are treated as general-purpose and appear in every picker regardless of `modelType`.

### Adding a new model type
1. Add the string value to `ModelType` in `src/app/vendors/actions.ts`.
2. Add a `{ value, label }` entry to `MODEL_TYPES` in `src/app/vendors/model-types.ts` — `MODEL_LABELS` is derived automatically.
3. In the new order type's page/component, pass the new `ModelType` value to `searchAssignedEventVendors`.
4. No changes needed to `VendorPanel`, `EventVendorList`, or the filter logic — they handle any `ModelType` generically.

## Order list and bulk edit pattern

Order types that ship with bulk-edit follow this structure exactly. New order types may ship lean (no `*ListClient`, no multi-select, no bulk actions) — see `src/app/events/[id]/print-orders/page.tsx` for the lean variant. When bulk-edit is added later, replicate the structure below.

### File layout
- `src/app/events/[order-type]/[OrderType]List.tsx` — `"use client"` component with list view, table view, selection, and bulk edit.
- `src/app/events/[order-type]/actions.ts` — server actions including `get*`, `delete*`, `delete*s` (bulk), and `bulkUpdate*`.
- `src/app/events/[id]/[order-type]/page.tsx` — thin server component: fetches data, defines inline `"use server"` wrapper actions, renders `<[OrderType]List>`.

### Selection state
- `useState<Set<string>>` for row selection.
- Selection bar appears when `selected.size > 0`; shows count, "Bulk edit" toggle, "Delete selected", "Clear selection".
- `showBulkEdit` state controls the inline edit panel below the bar.

### Bulk edit panel
- Status: `EDIT_STATUS_OPTIONS` from `src/lib/statusConstants.ts`.
- Substatus: `getSubstatusOptions()` from `src/app/settings/actions.ts` → `CustomOption[]`, filtered by selected status via `group` field.
- Vendor: `getResponsiblePartyVendors(eventId, "X_ORDER")` + `flattenResponsiblePartyOptions()` — vendor replace pattern: `deleteMany` then `createMany` on the junction table.
- Function link: `getFunctionOptions(eventId)` — for many:many junctions (AVOrder, SetupOrder, PrintOrder via `*OrderFunction`), bulk-add is safe (skip existing on the unique constraint). For 1:1 FK (CateringOrder via `CateringOrder.functionId`), bulk-replace the FK directly.
- Presentation link: many:many for AVOrder and SetupOrder (via `AVOrderPresentation` / `SetupOrderPresentation`) — bulk-add with skip-existing. 1:1 FK for PrintOrder (`PrintOrder.presentationId`) — bulk-replace the FK directly. CateringOrder doesn't link to presentations.
- After apply: call server action, reset state, `router.refresh()`.

### Vendor replace pattern (many:many)
```ts
await prisma.xOrderVendor.deleteMany({ where: { xOrderId: { in: ids } } });
await prisma.xOrderVendor.createMany({ data: ids.map(id => ({ xOrderId: id, vendorId })) });
```

### Status filter — null sentinel
Status filter selects include a `(blank)` option with `value="__blank__"` to filter rows where `status` is null:
```ts
if (filters.status === "__blank__") {
  if (o.status != null) return false;
} else if (filters.status && o.status !== filters.status) return false;
```
Empty string (`""`) means "All / no filter". Never use `null` or `undefined` as a select option value — use the `__blank__` sentinel instead.

### Absence sentinels across the stack
Use the same sentinel string for "no value" across `<select>` options, internal component state, and URL params. Prefer `__blank__` for `<select>` values; if a URL param has to be human-readable (`?room=none`, `?schedule=none`), translate at the page boundary once and use `__blank__` internally. Never invent a third string (e.g. mixing `none` / `no` / `__none__` / `__blank__` inside one feature) — pick one and convert at the edge.

## Adding a new entity / order type

When introducing a new order-type or top-level entity, wire it into every shared surface below — most are easy to miss because they don't fail the build (the new value just doesn't appear). Use the checklist; cross-reference SupplyOrder (commit a880f43 + the SupplyOrder UI alignment PR) as the most recent end-to-end reference.

Mark a surface ✗ if it's relevant to the new entity but not yet wired. Some lines won't apply to every entity (e.g. an entity without equipment items skips Equipment Responsibility) — judgement call, but bias toward including unless there's a clear reason not to.

### Schema / database
- `prisma/schema.prisma` — model, relations, `onDelete` cascades, junction tables (use `functionLinks` / `presentationLinks` naming, not `functions` / `presentations` — see refactor candidates), indexes
- `StatusModelType` enum — entry for the new entity (drives status defaults)
- `EntityStatus?` field on the model if it has a workflow status
- `FileUpload` model — add an optional FK + index if the entity supports attachments
- `prisma/seed.mjs` — seed any default options the entity depends on

### Auth and permissions
- `src/app/settings/roles/resources.ts` — add a `PermissionResource` entry; if it's event-scoped, append to `EVENT_SCOPED_RESOURCES`
- Server Actions: every exported action starts with `await requireAuth()` (or `requireAdmin()` for admin-gated)

### Routes
- `src/app/events/<entity>/` — colocated `actions.ts` + list/form/panel components (Archetypes A–C in § Route archetypes)
- `src/app/events/[id]/<entity>/page.tsx` — list page (`force-dynamic`)
- `src/app/events/[id]/<entity>/new/page.tsx` — create page
- `src/app/events/[id]/<entity>/[entityId]/page.tsx` — detail page with `<Breadcrumbs>` and inline `"use server"` wrapper actions
- Redirect convention: thin top-level entities → list view after create; entities needing further setup → detail view after create; duplicates and updates → detail view (see § Server Actions § Redirect target)

### Sidebar / navigation
- `src/components/EventSidebar.tsx` — `NAV` array entry under the right group (Schedule / Content / Orders / Resources / Reports / Configuration), `getActiveSection` `sections` array, icon (add a new one if no existing icon fits — don't reuse a semantically-different icon)
- `src/app/events/sidebar-actions.ts` — `SidebarSection` union entry + `getSidebarItems` branch returning the entity's links

### Overview / dashboard
- `src/app/events/[id]/actions.ts` — `getEventOverviewStats()` permission checks, fetches, attention items, entity card
- `src/app/events/[id]/page.tsx` — render the new card (if the overview renders cards inline)

### Status / workflow
- `src/lib/statusConstants.ts` — `STATUS_MODEL_LABEL` entry; promote any entity-specific status enums (e.g. `PACKING_STATUS_LABEL`, `ACQUISITION_LABEL`) here once they're consumed beyond the entity's own folder
- `src/app/events/status-defaults/StatusDefaultsPanel.tsx` — `ALL_MODEL_TYPES` array
- `src/app/events/workflows/actions.ts` — `WorkflowEntityType` union + five switch arms (`entityResource`, `assertEntityInEvent`, `filterEntityIdsInEvent`, `revalidateEntity`, `updateEntityStatus`). Each switch covers the full union; some are caught by TS inference if a member is missing, but not all — audit by hand when adding a member

### Vendor model types
- `src/app/vendors/actions.ts` — `ModelType` union entry
- `src/app/vendors/model-types.ts` — `MODEL_TYPES` array entry (drives vendor picker filtering across the order forms)
- `src/lib/responsibleParties.ts` — `ResponsiblePartyModelType` union + exhaustiveness arm; required for the `getResponsiblePartyVendors` + `flattenResponsiblePartyOptions` pattern used in every order form's vendor picker

### Uploads
- `src/lib/uploads.ts` — `ENTITY_DIRS` entry, `getEntityTypeFromRecord` check, `resolveEntityEventId` switch arm

### Reports — existing ones the entity should flow through
- `src/app/events/reports/actions.ts`:
  - `getFunctionDetailData` `fdFunctionInclude` + nested presentation include — add `<entity>Links` (or whichever relation exists on Function/Presentation)
  - `getEquipmentResponsibilityData` — widen `modelType` unions and add a normalization loop if the entity carries equipment items
  - `getVendorHandoffData` — fetch the entity's records when the vendor is provider (order-level OR per-item); update `relevantModelTypes`; shape into the return payload
  - `getOrderAssignedVendors` — add the entity's vendor relation to the union
- Each report's `*Report.tsx` body — render the new section (mobile cards + desktop table; see § Reports § Required: mobile-friendly tables)

### Share-view integration (only if you add a NEW report for this entity)
Five surfaces per § Reports § Share-view integration. See that section for the full checklist.

### Bulk edit (only if the entity ships with bulk operations)
Follow § Order list and bulk edit pattern — selection state, bulk panel (status / substatus / vendor / function link / presentation link), null sentinels.

## Breakout session labels

Anywhere a breakout session (a `Function` with `type === "BREAKOUT_BLOCK"`) is displayed by name, prepend its `BreakoutGroup.name` so "Session 1" reads as "Learn & Lead Session 1":

```ts
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";

formatBreakoutSessionName(session.name, session.breakoutGroup?.name)
```

The helper falls back to just the session name when no group is provided. When adding a new view that shows a function name and the function could be a breakout block, include `breakoutGroup: { select: { name: true } }` in the Prisma query and apply the helper. Apply it to filtering/sorting too — users see and search the prepended form.

## Data models

### Core entities
- **Event** — Top-level container (a conference or event).
- **Venue** — Physical location containing one or more rooms.
- **Room** — Individual bookable space within a venue.
- **Function** — Fundamental scheduling unit; represents a room setup/configuration for a time period.
- **Contact** — Flexible contact model with roles (Speaker, Venue Contact, Vendor, Staff, Other).

### Function subtypes
- **Meal/BEO** — Catering function with banquet event order details.
- **Breakout Session** — Smaller concurrent sessions.
- **Plenary Session** — Main stage/all-attendee sessions.

### Key relationships
- Event has many Functions.
- Function belongs to one or more Rooms (combined rooms supported).
- Function has a fixed setup; if location moves, create new Function.
- Function can span multiple time slots (e.g. daily staff hospitality room).
- Contacts are assigned to Functions (many-to-many) with role.
- Contacts can be linked to Venues (e.g. venue sales contact).
- Meals, Breakouts, and Plenaries extend Function.

### Future entities (not MVP)
Vendor (contracts), Contract, Travel Arrangement, Accommodation.

### AV requirements
Functions include high-level AV needs (projector, screen, microphone, etc.) as checklist/notes. Designed to generate handoff reports for venue/AV providers rather than track inventory.

## MCP connector

`src/app/api/mcp/route.ts` exposes a hand-rolled JSON-RPC 2.0 endpoint speaking the MCP protocol (stateless `tools/list` + `tools/call`). API-key bearer auth via `Authorization: Bearer <key>`; keys are admin-issued at `/settings/api-keys` and inherit the owning user's role + event assignments.

### Where things live
- **Route** — `src/app/api/mcp/route.ts`. POST-only; dispatches JSON-RPC; maps `PermissionError` → MCP error codes; serializes results through `mcpSerialize`. GET returns 405 (no SSE in stateless mode).
- **Bearer auth** — `src/lib/mcpAuth.ts`. SHA-256 lookup against `ApiKey.hashedKey`; rejects revoked keys; stamps `lastUsedAt` fire-and-forget. Keys are random 32-byte base64url tokens generated by `generateApiKey()` — NOT bcrypt (high-entropy randoms need a single indexed hash lookup, not a per-row compare).
- **Tool registry** — `src/lib/mcpTools/index.ts` aggregates per-entity files (`events.ts`, `functions.ts`, `presentations.ts`, `vendors.ts`, `contacts.ts`, `venues.ts`, `orders.ts`, `reports.ts`). Each tool is a `{ name, description, inputSchema, handler }` — see `src/lib/mcpTools/types.ts`.
- **Serialization** — `src/lib/mcpSerialize.ts` walks the result tree; converts `Date` → ISO 8601 string, `Prisma.Decimal` → string (preserves precision on financial fields). Every tool return is wrapped automatically by the route handler.
- **Admin UI** — `src/app/settings/api-keys/` (Archetype B-ish — form + list). The "API Keys" tab in `src/app/settings/SettingsTabs.tsx`.

### Permission boundary
MCP tools resolve a userId from the bearer token and call `requirePermissionForUser(userId, resource, action, eventId?)` from `@/lib/permissions`. That function **throws `PermissionError`** on denial — it never calls `redirect()`/`notFound()` (those are Next-navigation throws and can't fire from a non-render context).

The session-bound `requirePermission()` is now a thin wrapper that catches `PermissionError` and translates to the legacy redirect/notFound behavior for the UI. **Don't bypass the wrapper from a UI page** — if a page calls `requirePermissionForUser` directly, the uncaught `PermissionError` will surface as an opaque 500.

The eight report actions in `src/app/events/reports/actions.ts` remain auth-free (the share-route carve-out). The MCP tools in `src/lib/mcpTools/reports.ts` call `requirePermissionForUser(userId, EVENTS, VIEW, eventId)` before delegating — keeping access enforcement at the MCP boundary while leaving the underlying actions reusable by the share route.

### Adding a new MCP tool
1. Pick or create `src/lib/mcpTools/<entity>.ts`. Export a `McpToolDefinition[]`.
2. Each handler must: (a) call `requirePermissionForUser` first, (b) call Prisma directly via `@/lib/prisma` — do NOT call sibling Server Actions (they use session auth via `auth()`), (c) return raw shapes; the dispatcher serializes them.
3. Register the new array in `src/lib/mcpTools/index.ts`.
4. JSON Schema in `inputSchema` is descriptive only; we don't run runtime validation at the MCP boundary (same trust model as Server Actions trusting FormData typing). Tools throw `Error` for bad input; the dispatcher surfaces the message in `isError` content.

### Writes — `*Core(args, userId)` extraction pattern (phase 2)
When wiring an MCP write tool that mirrors an existing Server Action, factor out a pure `xxxCore(args, userId)` function from the action body. The Server Action wrapper retains `FormData` parsing, `revalidatePath`, and `redirect`; the core owns `requirePermissionForUser` and the Prisma op (including any `$transaction`). MCP tools call the core directly with typed args. Single source of truth for business rules; no drift between UI and MCP behavior. Phase 1 (reads-only) does not require any action refactoring.

### Documented exceptions
- `mintApiKey` in `src/app/settings/api-keys/actions.ts` **returns** a `{ fullKey, ... }` object — the deliberate exception to the "actions return void / redirect" convention. The plaintext key is shown to the admin exactly once (we only ever persist `SHA-256(fullKey)`); the client form captures it and renders a copy-once panel. Don't replicate this pattern unless you have an equivalent one-time-reveal requirement.

## Anti-patterns

| Don't | Do | Why / where |
|---|---|---|
| `new PrismaClient()` in a route, action, or component | `import { prisma } from "@/lib/prisma"` | One connection pool per process. |
| New `app/api/<resource>/route.ts` for JSON CRUD | A Server Action in `actions.ts` | Route handlers are reserved for what Server Actions can't express. |
| New repository / service / DAL class wrapping Prisma | Call `prisma.<model>.<op>()` directly | 47 files do this today; abstractions fragment the layer. |
| `revalidateTag(...)` or `fetch(..., { next: { tags } })` | `revalidatePath(<list>); revalidatePath(<detail>)` | Project doesn't tag fetches; 280 `revalidatePath` calls vs. 0 of either alternative. |
| `useActionState`, `{ success, error }` envelopes | Throw on error; `redirect("/...?success=...")` on success | Established return shape across 22 action files. |
| `useOptimistic`, manual local rewrites after mutation | `await action(); router.refresh()` | Single mutation pattern; reviewers shouldn't have to learn two. |
| `cn(...)`, `clsx`, `tailwind-merge`, ad-hoc class helpers | Template-literal concatenation; reuse `buttonStyles` / `reportStyles` / `statusConstants` / `colors` | No helper exists today; adding one starts a split. |
| Redeclaring `btn*` / `report*` class strings inline | Import from `src/lib/buttonStyles.ts` / `src/lib/reportStyles.ts` | Single source of truth for visual style. |
| `window.print()` on an interactive report page | `<a href="${basePath}/print?...">` | The print route renders the chrome-free layout; `PrintButton` calls `window.print()` only there. |
| `error.tsx`, `not-found.tsx`, or `loading.tsx` files | `notFound()` from `next/navigation`; let Next render the default error UI | Zero such files exist today. |
| `"Multiple"` rollup rows in reports | Split rows by `(item, role, provider)` | Concrete rows beat ambiguous summaries. |
| `null` / `undefined` as a `<select>` option value | Sentinel `value="__blank__"`; empty string means "All" | See "Status filter — null sentinel". |
| Composite keys like `${a}:${b}` as HTML IDs | Compute a clean anchor id separately from the React `key` | Colon is not a CSS-friendly id char. |
| `process.env.X` outside `lib/prisma`, `lib/auth`, `lib/uploads` | Funnel new env access through one of those modules | Three touchpoints, 0 `NEXT_PUBLIC_*`. |
| Cookies or `localStorage` for per-user preferences | `setUserSetting` / `getUserSetting` (`@/lib/userSettings`) | Server-side `UserSetting` table is the single store. |
| Adding zod / yup / valibot for FormData parsing | Trust TS types; `throw new Error(...)` for runtime invariants | Single-tenant trust model. Revisit only if forms need field-level error messages. |
| Adding a state library (Zustand / Jotai / Redux / SWR / React Query) | React built-ins + URL search params + `UserSetting` | Zero global client state today. |
| Building a modal `<Dialog>` for delete/cancel confirmation | Inline confirm state on the trigger | See `DeleteButton.tsx` / `InlineDeleteButton.tsx`. |

## CLAUDE.md candidates

When you encounter any of the following during a task, append a one-line entry to `reviews/claudemd/candidates.md`:

- An explicit decision between two approaches ("we picked X over Y because Z")
- A new utility, helper, or pattern that should become canonical
- A constraint discovered through debugging or investigation ("can't do X because Y")
- A convention you inferred from existing code that isn't in CLAUDE.md
- A rule in CLAUDE.md that turned out to be wrong, ambiguous, or missing an exception

Format: `- [area] one-line description (PR/file reference if relevant)`

Don't update CLAUDE.md directly. Don't ask whether to add an entry — just add it. The parking lot is processed during periodic reviews.

## Refactor candidates

When a `/simplify` (or ad-hoc) review flags real duplication or restructuring that's bigger than the change in flight, append a one-line entry to `reviews/refactors/candidates.md` instead of expanding scope. Use it for findings that are real and worth doing but too big to bundle with the current commit.

Triage:

| Finding | Action |
|---|---|
| Small, in-scope cleanup (≤~20 lines, doesn't touch unrelated files) | Fix now |
| False positive, or conflicts with a real constraint | Skip silently |
| Real, worth doing, but bigger than the current change | Park in `reviews/refactors/candidates.md` |

Format: `- [area] one-line description (file references, originating PR/commit if useful)`

Don't act on parked entries unprompted. The list is processed during periodic refactor sweeps.

## Further reading

- `prisma/schema.prisma` — full data model.
- `src/lib/auth.ts` — `authorized` callback, `requireAuth`, `requireAdmin`, cookie config.
- `src/lib/conflicts.ts`, `src/app/events/breakout-schedule/actions.ts` — the riskiest logic in the codebase (time-zone math, scheduling conflicts).
- `reviews/claudemd/conventions-observed.md` — the descriptive convention audit this file is derived from.
- `reviews/claudemd/decisions.md` — recorded decisions per row, with rationale.

