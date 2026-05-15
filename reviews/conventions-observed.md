# Event Manager — Observed Conventions

Descriptive review of the conventions in this codebase. Citations are
`file:line`. Counts come from `grep` over `src/`.

## Phase 1 — Framework inventory

- **Next.js**: `next ^14.2.35` (`package.json:21`). App Router only — no
  `pages/` directory. `src/app/` is the only route tree.
- **`next.config.mjs`**: only sets `output: "standalone"`
  (`next.config.mjs:3`). No experimental flags, redirects, rewrites, or
  image config.
- **TypeScript**: `strict: true`, `moduleResolution: "bundler"`,
  path alias `@/* → ./src/*` (`tsconfig.json:7-25`).
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss` plugin
  (`postcss.config.mjs:1-7`, `src/app/globals.css:1`). No `cn()` helper,
  no `tailwind.config.*` file in repo. Print styles via `@media print`
  in `globals.css:35-44` and `print:` Tailwind variants.
- **ORM**: Prisma `^6.19.3` against PostgreSQL
  (`package.json:13`, `prisma/schema.prisma:5-7`). Single
  client singleton in `src/lib/prisma.ts:1-13`.
- **Auth**: `next-auth ^5.0.0-beta.30` with Credentials provider and JWT
  sessions (`src/lib/auth.ts:1-90`). `bcryptjs ^3.0.3` for password
  hashing (`src/lib/auth.ts:38-43`).
- **Forms**: native `<form action={…}>` + Server Actions; `useFormStatus`
  in 10 client form components (`src/app/events/EventForm.tsx:4`,
  `src/app/vendors/VendorForm.tsx:3`,
  `src/app/users/UserForm.tsx:3`, etc.). **No** `react-hook-form`,
  `useActionState`, `useFormState`, or zod in `package.json`.
- **State**: React built-ins only (`useState`, `useTransition`,
  `useRef`). No Zustand, Jotai, Redux, Recoil, SWR, or React Query.
- **Rich text**: `@tiptap/react ^3.22.1` in
  `src/components/RichTextEditor.tsx:4`.
- **Drag-and-drop**: `@dnd-kit/core` + `@dnd-kit/sortable` in
  `src/app/events/[id]/agenda/AgendaGrid.tsx:7-19`,
  `src/app/events/breakout-schedule/BreakoutGrid.tsx:8-19`,
  `src/app/settings/OptionList.tsx`.
- **Files / CSV**: `papaparse ^5.5.3` for presentation imports.
- **Testing**: no test runner, no `*.test.*` / `*.spec.*` files
  (verified via `find . -name "*.test.*"`).
- **Top-level layout**:
  - `src/app/` — App Router pages (76 `page.tsx`, 22 `actions.ts`, 3
    `route.ts`).
  - `src/components/` — shared components, with `print/` and `ui/`
    subfolders.
  - `src/lib/` — utilities, db client, auth helpers.
  - `src/types/` — only `next-auth.d.ts` (`src/types/next-auth.d.ts:1-14`).
  - `prisma/` — `schema.prisma`, `seed.mjs`.
  - `scripts/` — ad-hoc backfill scripts
    (`scripts/backfill-setup-order-names.ts`).

## Phase 2 — Route archetypes

### Archetype A: "Authenticated CRUD list"
List of records of one type for the global namespace.

- `src/app/events/page.tsx:10-37`
- `src/app/contacts/page.tsx:10-83`
- `src/app/venues/page.tsx`
- `src/app/vendors/page.tsx`
- `src/app/users/page.tsx`

Canonical pattern:
- `export const dynamic = "force-dynamic"` (`src/app/events/page.tsx:8`,
  `src/app/vendors/page.tsx:8`, `src/app/users/page.tsx:7`).
- Server component awaits `get<Entity>()` from
  sibling `actions.ts` (`src/app/events/page.tsx:11`).
- Auth is enforced by `middleware.ts:1` / `auth callback` in
  `src/lib/auth.ts:74-85`, not re-checked in the page itself.
- Renders `<PageWrapper>` (`src/components/PageWrapper.tsx`) +
  `<PageHeader>` (`src/components/PageHeader.tsx`) + inline `<table>` or
  delegates to a `*ListClient` (`src/app/events/EventListClient.tsx:14`).
- "New" action is a link to `/<entity>/new`.

Deviation: `EventListClient` is the only client list — every other list
renders a static `<table>` from the server component.

### Archetype B: "Form with Server Action"
Create / edit / delete via native form posting to a Server Action.

- `src/app/events/new/page.tsx:8-19`
- `src/app/contacts/new/page.tsx:8-20`
- `src/app/events/[id]/page.tsx:26-176` (edit + delete)
- `src/app/vendors/[id]/page.tsx`
- `src/app/users/[userId]/page.tsx`

Canonical pattern:
- Server page fetches lookup data and passes raw Server Actions (or
  `"use server"` wrapper closures) as props to a `*Form` client
  component (`src/app/events/[id]/page.tsx:49-81`).
- `*Form` is `"use client"`, uses `useState` for an edit/view toggle
  (`src/app/events/EventForm.tsx:28-29`) and `useFormStatus` for a
  pending button (`src/app/events/EventForm.tsx:14-23`).
- Server Action calls `revalidatePath` then `redirect()` (see Phase 3).

### Archetype C: "Event-scoped subresource page"
Pages under `/events/[id]/<order-type>/...` for AV / catering / setup /
print orders, presentations, functions.

Examples:
- `src/app/events/[id]/setup-orders/page.tsx:14-91` (list)
- `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:54-200`
  (detail)
- `src/app/events/[id]/av-orders/[avOrderId]/page.tsx`
- `src/app/events/[id]/catering-orders/[cateringOrderId]/page.tsx`
- `src/app/events/[id]/presentations/[presentationId]/page.tsx`

Canonical pattern:
- Awaits `params: Promise<{ id: string; ... }>`
  (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:57-60`).
- Loads in parallel via `Promise.all(...)`
  (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:62-82`).
- Calls `notFound()` when the entity is missing
  (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:75`).
- Wraps remote Server Actions in inline `"use server"` arrow
  closures that bind `eventId` / sub-id
  (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:115-200`).
- 37 of 76 `page.tsx` files contain inline `"use server"` declarations.

### Archetype D: "Report page"
Under `/events/[id]/reports/[name]/`.

- `src/app/events/[id]/reports/equipment-responsibility/page.tsx:13-86`
- `src/app/events/[id]/reports/vendor-handoff/page.tsx`
- `src/app/events/[id]/reports/event-profile/page.tsx`
- `src/app/events/[id]/reports/room-schedule/page.tsx`

Canonical pattern (codified in `CLAUDE.md:139-203`):
- Filter state comes from URL `searchParams`
  (`src/app/events/[id]/reports/equipment-responsibility/page.tsx:18-23`).
- Server fetches data via `@/app/events/reports/actions` (no
  `requireAuth` calls so the share route can reuse them — verified by
  `grep`: 0 hits in `src/app/events/reports/actions.ts`).
- Renders shared `*Report` body and `ReportFilters` client component
  that the share route also imports
  (`src/app/share/[token]/page.tsx:8-13`).
- Dedicated `/print/` route uses `PrintHeader`
  (`src/components/print/PrintHeader.tsx:11-32`).

### Archetype E: "Unauthenticated share view"
Single dynamic route serving multiple report types behind a token.

- `src/app/share/[token]/page.tsx:28-286`
- `src/app/share/[token]/print/page.tsx`

Canonical pattern:
- `getActiveShareLink(token)` checks `revokedAt` / `expiresAt`
  (`src/lib/shareLinks.ts:18-26`).
- `recordShareLinkAccess` fires a fire-and-forget Prisma update
  (`src/lib/shareLinks.ts:28-35`).
- Branches on `link.reportType` to render the matching report
  component (`src/app/share/[token]/page.tsx:41,103,...`).
- Auth-bypassed via `src/lib/auth.ts:79` `if (nextUrl.pathname.startsWith("/share/")) return true`.

### Archetype F: "Admin-only settings"
Under `/settings/*` and `/workflows/*`.

- `src/app/settings/layout.tsx:1-23` calls `requireAdmin()` once.
- `src/app/workflows/page.tsx:12`, `src/app/workflows/new/page.tsx:7`,
  `src/app/workflows/[id]/page.tsx:26` each call `requireAdmin()`.
- `src/app/settings/page.tsx:3` is a pure `redirect("/settings/functions")`.

### Archetype G: "API route handler"
Three handlers total (`find src/app -name route.ts`):

- `src/app/api/auth/[...nextauth]/route.ts:1-3` — re-exports NextAuth
  handlers.
- `src/app/api/upload/route.ts:8-65` — multipart file upload (writes to
  disk + Prisma record).
- `src/app/api/files/[fileId]/route.ts:6-37` — file download
  streaming from disk.

These three exist because file upload/download requires `multipart/form-data`
+ binary response streams that Server Actions can't cleanly express.

## Phase 3 — Pattern extraction by area

### 1. Server vs Client boundary

88 client files contain `"use client"` (`grep -rln '"use client"' src/`).
Grouping by the apparent reason (first non-`"use client"` import / hook):

> **`useState` for local UI toggle** (dominant: ~72 of 88)
> *What it does:* gates edit/view, modal open, selection sets, expand/collapse.
> *Examples:* `src/components/DeleteButton.tsx:6` (`confirming`),
> `src/components/LinkedItemsPanel.tsx:5` (`showLinkForm`),
> `src/components/EntityStatusPanel.tsx:5` (`editing`),
> `src/app/events/setup-orders/SetupOrderList.tsx:52-57` (filters,
> selection, bulk-edit).

> **`useFormStatus` pending button** (common: 10 files)
> *What it does:* disables submit button while server action runs.
> *Examples:* `src/app/events/EventForm.tsx:14`,
> `src/app/vendors/VendorForm.tsx:13`, `src/app/users/UserForm.tsx:9`.

> **`useTransition` to fire a server action from a non-form handler**
> *Examples:* `src/components/CancelOrDeleteButton.tsx:27`,
> `src/components/EntityStatusPanel.tsx:30`,
> `src/components/ShareReportButton.tsx:47`,
> `src/components/FileUploadPanel.tsx:1`.

> **`useSearchParams` / `useRouter` for URL-driven filters**
> *Examples:* `src/components/Toast.tsx:4`,
> `src/app/events/[id]/agenda/DateTabs.tsx:15`,
> `src/app/events/[id]/agenda/HideEmptyToggle.tsx:21`.

> **Third-party client-only library** (rare: 4 files)
> *Examples:* `src/components/RichTextEditor.tsx:4` (tiptap),
> `src/app/events/[id]/agenda/AgendaGrid.tsx:7-19` (@dnd-kit),
> `src/app/events/breakout-schedule/BreakoutGrid.tsx:8-19` (@dnd-kit),
> `src/app/settings/OptionList.tsx` (@dnd-kit).

> **Browser API / `signIn`**
> *Examples:* `src/app/login/page.tsx:4` (`signIn`),
> `src/components/print/PrintButton.tsx:5` (`window.print()`).

None of the client files have an unclear reason — every one is either
holding local state, calling browser APIs, or wrapping a third-party
client library.

### 2. Data fetching and caching

> **Direct Prisma call in Server Action**
> *What it does:* every CRUD action runs `prisma.*` queries inline.
> *Examples:* `src/app/events/actions.ts:11`,
> `src/app/contacts/actions.ts:7`,
> `src/app/events/setup-orders/actions.ts:12`.
> *Occurrences:* dominant — 47 files import `@/lib/prisma`
> (`grep -rln from "@/lib/prisma" src/`).

> **Direct Prisma call in a server-component page**
> *Examples:* `src/app/events/[id]/page.tsx:30-36`,
> `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:79-114`,
> `src/app/events/new/page.tsx:9`.

> **`fetch()` for caching primitives — not used**
> *Occurrences:* zero. No `fetch()`, `unstable_cache`, `revalidateTag`,
> or `cache: …`/`next: { tags: … }` options anywhere in `src/`.

> **`cache()` from React for request-scoped memoization**
> *Examples:* `src/app/events/actions.ts:15` — `getEvent` is wrapped in
> `cache(...)` so layout + page can call it twice per request.
> *Occurrences:* 1, only `getEvent`.

> **Revalidation: `revalidatePath`**
> *Examples:* `src/app/events/actions.ts:41,67,73`,
> `src/app/events/setup-orders/actions.ts:86,108,113`.
> *Occurrences:* 280 calls across 22 actions files. `revalidateTag` is
> not used.

> **Dynamic rendering by default**
> *What it does:* most pages declare `export const dynamic = "force-dynamic"`.
> *Occurrences:* 71 of 76 `page.tsx` files. The five without are
> `src/app/settings/page.tsx`, `src/app/login/page.tsx`,
> `src/app/users/new/page.tsx`, `src/app/share/[token]/page.tsx`, and
> `src/app/workflows/new/page.tsx`.

### 3. Server Actions

22 `actions.ts` files, each starting with `"use server"`. Selected
patterns:

| File | Auth check | Validation | Returns | Revalidates |
|---|---|---|---|---|
| `src/app/events/actions.ts` | none | none | `void` or model | `revalidatePath` + `redirect` |
| `src/app/contacts/actions.ts:1` | none | none | model / void | `revalidatePath` + `redirect` |
| `src/app/users/actions.ts:10,24,38` | `requireAdmin` (6 of 5) | manual `throw new Error` (`users/actions.ts:46-55`) | model / void | `revalidatePath` + `redirect` |
| `src/app/account/actions.ts:8` | `requireAuth` | manual: `VALID_LANDING_PAGES.includes(...)` (line 11) | void (redirects) | n/a |
| `src/app/settings/actions.ts:37` | `requireAdmin` (8 of 11) | none | void | `revalidatePath("/settings")` |
| `src/app/workflows/actions.ts:50,73,...` | `requireAdmin` (12 of 14) | none | void | `revalidatePath` |
| `src/app/events/share-links/actions.ts:19` | `requireAuth` (5 of 4) | none | model | `revalidatePath` |
| `src/app/events/[id]/agenda/actions.ts:7,16` | `requireAuth` (both) | none | void | none — user-pref store |
| `src/app/events/setup-orders/actions.ts` | none (0 of 24) | none | void / model | `revalidatePath` (+ `redirect`) |
| `src/app/events/av-orders/actions.ts` | none (0 of 39) | none | void / model | `revalidatePath` |
| `src/app/events/catering-orders/actions.ts` | none (0 of 32) | none | void / model | `revalidatePath` |
| `src/app/events/print-orders/actions.ts` | none (0 of 21) | none | void / model | `revalidatePath` |
| `src/app/events/presentations/actions.ts` | none (0 of 25) | none | void / model | `revalidatePath` |
| `src/app/events/functions/actions.ts` | none (0 of 22) | none | void / model | `revalidatePath` |
| `src/app/events/breakout-schedule/actions.ts` | none (0 of 24) | none | void / model | `revalidatePath` |
| `src/app/events/schedule-items/actions.ts` | none (0 of 5) | none | void / model | `revalidatePath` |
| `src/app/events/reports/actions.ts` | **deliberately none** (`CLAUDE.md:147`) | none | data | n/a (read-only) |

Summary:
- Auth checks live in `requireAuth` / `requireAdmin`
  (`src/lib/auth.ts:80-90`). They are called inside the actions files
  for `users`, `workflows`, `settings`, `share-links`, `account`,
  `agenda` — most other order-type action files rely on middleware-level
  auth and skip per-action checks.
- Inputs are always read with `formData.get(...) as string` —
  `formData.get(` appears 452 times across `src/app/`. No zod / yup /
  custom schema. Optional fields are normalized with `|| null`
  (`src/app/events/actions.ts:32,55`).
- Server Actions return either `void` (after `redirect`) or the raw
  Prisma model. There is no `{ success, error }` envelope and no use of
  `useActionState`.
- Inline `"use server"` closures inside `page.tsx` files (37 of 76
  pages) bind URL params (`eventId`, etc.) before forwarding to the
  underlying action — see
  `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:115-200`.

### 4. Route handlers

Three exist; reasons identified:
- `src/app/api/auth/[...nextauth]/route.ts:1-3` — required by NextAuth.
- `src/app/api/upload/route.ts:8-65` — `multipart/form-data` write with
  disk side-effects; returns JSON.
- `src/app/api/files/[fileId]/route.ts:6-37` — binary file streaming
  response with `Content-Disposition` header.

The codebase uses Server Actions for everything else. No route handler
implements a JSON CRUD API.

### 5. Auth and middleware

- `src/middleware.ts:1-5` re-exports `auth as middleware` and matches
  every path except Next-internal static assets.
- `src/lib/auth.ts` is the single auth module:
  - `auth()`, `signIn`, `signOut`, `handlers` exports
    (`src/lib/auth.ts:9`).
  - `authorized` callback (line 73-85) gates routes: login + `/api/auth/*`
    + `/share/*` are public, everything else requires `auth?.user`.
  - JWT session strategy, 30-day maxAge (line 65-68).
  - Custom cookie config that toggles `__Secure-` prefix on HTTPS
    (lines 5-19).
- Helpers:
  - `requireAuth()` (`src/lib/auth.ts:80-86`) — calls `auth()`, redirects
    to `/login` if not logged in. Imported in 18 places
    (`grep -rln @/lib/auth src/`).
  - `requireAdmin()` (`src/lib/auth.ts:88-94`) — checks
    `session.user.role !== "admin"`, redirects to `/`.
- Session typing extension:
  `src/types/next-auth.d.ts:3-13` adds `id` and `role` to `Session.user`
  and to `User`.
- Where auth is actually enforced:
  - Middleware (every request).
  - `requireAdmin()` inside `src/app/settings/layout.tsx:7` once for the
    whole settings tree.
  - Per-action in `users/`, `workflows/`, `settings/`, `share-links/`,
    `account/`, `agenda/`.

### 6. Forms and mutations

> **Native `<form action={serverAction}>` + `useFormStatus`**
> *Examples:* `src/app/events/EventForm.tsx:14,103`,
> `src/app/vendors/VendorForm.tsx:13`, `src/app/users/UserForm.tsx:9`.
> *Occurrences:* dominant for create/update flows.

> **Inline mutation via `useTransition` + Server Action prop**
> *Examples:* `src/components/EntityStatusPanel.tsx:30-50`,
> `src/components/CancelOrDeleteButton.tsx:27-55`,
> `src/components/FileUploadPanel.tsx`.
> *Occurrences:* common for non-form actions like cancel/restore/delete.

> **Optimistic updates: none**
> No `useOptimistic`, no manual local state rewrites after mutation. The
> pattern is `await action()` followed by `router.refresh()`
> (`src/app/events/setup-orders/SetupOrderList.tsx:119,136`).

> **Error display: no convention**
> Most actions throw on invalid input
> (`src/app/users/actions.ts:46-55`) and surface as a thrown 500.
> Success messages are passed via `?success=...` URL param and rendered
> by `<Toast>` (`src/components/Toast.tsx:11-30`). 10 `redirect(...)`
> calls include `?success=` (`grep -rn 'success=' src/app`).

### 7. Validation

- No zod / yup / valibot / joi. `grep -rn "zod" src/` returns 0 hits.
- Manual `throw new Error(...)` for the few cases that do validate
  (`src/app/users/actions.ts:46,55,80,89,116`,
  `src/app/account/actions.ts:12`,
  `src/app/events/breakout-schedule/actions.ts:500`).
- Most actions cast `formData.get(name) as string` directly into the
  Prisma write (e.g. `src/app/events/actions.ts:22-30`). Empty strings
  become `null` via `|| null`.
- Allowed model-type strings are typed via a TS union, not a runtime
  schema (`src/app/vendors/actions.ts` — see `CLAUDE.md:54-57`).

### 8. Error handling

- No `error.tsx`, `not-found.tsx`, or `loading.tsx` files exist anywhere
  under `src/app/` (verified: `find src/app -name "error.tsx" -o -name "not-found.tsx" -o -name "loading.tsx"` returns nothing).
- `notFound()` is the standard "missing record" exit:
  `src/app/vendors/[id]/page.tsx:32`,
  `src/app/contacts/[id]/page.tsx`,
  `src/app/events/[id]/page.tsx:41`,
  `src/app/share/[token]/page.tsx:33,110,174,243,286`.
- `try/catch` is rare — 32 occurrences across `src/app/`. The only
  `console.error` in `src/` is at `src/app/api/upload/route.ts:59`.
- Server Action errors propagate as thrown exceptions; the browser shows
  the default Next error overlay in dev and the standard error UI in
  production.

### 9. Data layer

- Single Prisma client: `src/lib/prisma.ts:5-13` with `globalThis`
  caching guarded by `NODE_ENV !== "production"`.
- **No repository layer**. 47 files import `@/lib/prisma` directly,
  including 22 `actions.ts`, 3 route handlers, 1 lib helper
  (`src/lib/conflicts.ts:1`,
  `src/lib/shareLinks.ts:1`,
  `src/lib/equipment-utils.ts:1`,
  `src/lib/userSettings.ts:1`), and ~21 server-component pages
  (e.g. `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:100-114`).
- Domain types = Prisma row types. 63 client/server files import from
  `@prisma/client` (`grep -rln "@prisma/client" src/`). The pattern for
  passing server-action data to a list component is
  `type X = Awaited<ReturnType<typeof getX>>[number]`
  (`src/app/events/setup-orders/SetupOrderList.tsx:18,
  src/app/events/setup-orders/SetupOrderDetails.tsx:8-10`).

### 10. Type boundaries

> **`params` / `searchParams` typed as `Promise<...>`** (Next 14
> async-params convention).
> *Examples:* `src/app/events/[id]/page.tsx:26`,
> `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:57-60`,
> `src/app/events/[id]/reports/equipment-responsibility/page.tsx:16-19`.
> *Occurrences:* 53 `params: Promise<...>` and 21 `searchParams: Promise<...>`
> across `src/app/`. Deviation: route handler still uses sync params
> (`src/app/api/files/[fileId]/route.ts:8`).

> **Re-using Server Action return types on the client**
> *What it does:* `import type { getX } from "./actions"` then
> `Awaited<ReturnType<typeof getX>>[number]`.
> *Examples:* `src/app/events/setup-orders/SetupOrderList.tsx:7,18`,
> `src/app/events/setup-orders/SetupOrderDetails.tsx:8-10`,
> `src/components/print/WorkflowSection.tsx:4`.

> **Type-only imports of Prisma model types into client components**
> *Examples:* `src/app/events/EventForm.tsx:5` (`type { Event, Venue }`),
> `src/components/EntityStatusBadge.tsx:1` (`type { EntityStatus }`),
> `src/app/events/setup-orders/SetupOrderList.tsx:6`
> (`type { CustomOption, EntityStatus }`).

> **Date serialization workaround**
> *What it does:* `JSON.parse(JSON.stringify(events))` before handing
> Prisma dates to a client list.
> *Examples:* `src/app/events/page.tsx:32`. *Occurrences:* 1 — every
> other list keeps the data on the server.

### 11. State management

- No state library. `grep -rn "zustand\|jotai\|redux\|recoil\|swr" src/`
  returns 0 hits.
- Local component state via `useState` (72 of 88 client components).
- URL search params hold:
  - Order list filters: `?status=...`
    (`src/app/events/[id]/setup-orders/page.tsx:19`,
    `src/app/events/[id]/presentations/page.tsx:27`,
    `src/app/events/[id]/av-orders/page.tsx:19`).
  - Detail tab selection: `?tab=overview`
    (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:58,60`).
  - Report filters: `?vendors=...&models=...`
    (`src/app/events/[id]/reports/equipment-responsibility/page.tsx:18-19`).
  - Success toast: `?success=...` (10 redirects).
- Server-persisted user prefs live in `UserSetting` rows
  (`src/lib/userSettings.ts:15-30`), e.g. landing page choice,
  agenda view options, per-event agenda room order/hidden list.

### 12. Styling and UI

- Tailwind v4 (no `tailwind.config.*`; imported via
  `@import "tailwindcss"` in `src/app/globals.css:1`).
- Color palette uses Tailwind utility classes directly in JSX. Dark mode
  via `dark:` variants is applied per element throughout.
- Reusable button class strings live in `src/lib/buttonStyles.ts:1-14`
  (`btnPrimary`, `btnSecondary`, `btnDanger`, `btnOutlinedSm`). Imported
  by 10 files (`grep -rn @/lib/buttonStyles src/`).
- Report table styles live in `src/lib/reportStyles.ts:1-26` (`reportTh`,
  `reportTd`, `reportSectionCard`, `reportOrderCard`, `reportGroupRow`,
  `reportFooterText`). Imported by 7 files.
- Status badge colors: `src/lib/statusConstants.ts:16-22` (per
  `EntityStatus`) and `src/lib/colors.ts:1-10` (per color name for
  custom options).
- No `cn()` / `clsx` helper — classes are concatenated with template
  literals (e.g. `src/components/EntityStatusBadge.tsx:11`).
- No component library (no shadcn, Radix, Headless UI imports). Inputs,
  selects, modals are hand-built per usage.

### 13. Environment and config

- `process.env` access is limited to three places
  (`grep -rn "process.env" src/`):
  - `src/lib/prisma.ts:13` (`NODE_ENV`).
  - `src/lib/auth.ts:7` (`NEXTAUTH_URL`).
  - `src/lib/uploads.ts:4` (`UPLOAD_DIR`).
- No `env.ts` / `t3-env` / `zod` env-validation layer. `.env.example` is
  present at repo root (124 bytes).
- No `NEXT_PUBLIC_*` variables in `src/`.
- No feature flag system.

### 14. Performance primitives

- `next/font`: `DM_Sans` loaded once in `src/app/layout.tsx:2-7` with
  `display: "swap"` and a CSS variable.
- `next/image`: not used in `src/`.
- `next/dynamic`: used once for `AgendaGrid` with `ssr: false`
  (`src/app/events/[id]/agenda/page.tsx:10-11`) because of @dnd-kit.
- `next/script`: not used.
- `Suspense`: 36 occurrences, all wrapping `<Toast />` with
  `fallback={null}` so `useSearchParams()` inside it doesn't trigger the
  Next bailout warning (`src/app/events/[id]/page.tsx:85-87`,
  `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:260`,
  `src/app/account/page.tsx:16-18`, etc.).

### 15. Testing

- No test runner, no test files, no `package.json` test script.
- No fixtures or mocks. Seed data lives in `prisma/seed.mjs:1+` and
  populates default option dropdowns + an initial admin user.

### 16. Logging and observability

- No structured logger. The only `console.*` call in `src/` is
  `console.error("Upload error:", error)` in
  `src/app/api/upload/route.ts:59`.
- No `instrumentation.ts`. No Sentry / Datadog / OpenTelemetry imports.

## Phase 4 — Import graph signals

### Most-imported `lib/` modules

(from `grep -rn 'from "@/lib/' src/`, deduped by module)

| Module | Imports | What it abstracts |
|---|---|---|
| `@/lib/prisma` | 47 | Prisma singleton — only DB entry point. Called as `prisma.<model>.<op>()`. |
| `@/lib/auth` | 18 | `auth()`, `requireAuth()`, `requireAdmin()`, `signIn`/`signOut`. |
| `@/lib/statusConstants` | 13 | `STATUS_LABEL`, `STATUS_CLASS`, `EDIT_STATUS_OPTIONS`, `StatusCounts` type. |
| `@/lib/optionUtils` | 13 | `resolveOptionLabel` / `resolveOptionColor` — normalizes legacy SCREAMING_SNAKE values against current `CustomOption` rows. |
| `@/lib/roomGroups` | 12 | `compareRoomsByGroup`, `sortRoomsByGroupThenName`, `groupRoomsByGroup`. |
| `@/lib/buttonStyles` | 10 | Tailwind class strings for `btnPrimary` / `btnSecondary` / `btnDanger` / `btnOutlinedSm`. |
| `@/lib/breakoutLabels` | 10 | `formatBreakoutSessionName(name, groupName)`. |
| `@/lib/agendaUtils` | 9 | Schedule grid building helpers. |
| `@/lib/userSettings` | 8 | Get/set per-user prefs in `UserSetting`. |
| `@/lib/tableSort` | 7 | `compareValues`, `sortIndicator`, `SortDir`. |
| `@/lib/shareLinks` | 7 | `getActiveShareLink`, `generateShareToken`, `recordShareLinkAccess`. |
| `@/lib/reportStyles` | 7 | Tailwind class strings for report tables. |
| `@/lib/format-phone` | 7 | `formatPhone()` digit-grouping. |

### Modules imported by both client and server code (cross-boundary contracts)

- `@/lib/statusConstants` — imports `EntityStatus` from `@prisma/client`,
  used by `EntityStatusBadge.tsx` (client) and several action files
  (server).
- `@/lib/buttonStyles`, `@/lib/reportStyles`, `@/lib/colors` — pure
  Tailwind class strings, used everywhere.
- `@/lib/breakoutLabels`, `@/lib/format-phone`, `@/lib/tableSort`,
  `@/lib/optionUtils` — pure formatters.
- `@/lib/shareLinks` types — `ShareLinkFilters` type is used by
  `src/components/ShareReportButton.tsx:5` (client) and the share-link
  server action (`src/app/events/share-links/actions.ts:5`).
- `@/app/vendors/model-types` is the explicit "no `use server`" file
  for shared display constants (called out in `CLAUDE.md:50-66`).
- `@/app/vendors/vendor-utils` re-exports the `flattenResponsiblePartyOptions`
  helper for client list components.

### Files importing the ORM directly

47 files (Phase 3 §9). Distribution:
- 22 `actions.ts` files (all of them).
- 3 route handlers.
- ~21 server-component `page.tsx` files (`src/app/events/new/page.tsx`,
  `src/app/events/[id]/page.tsx`, every event-scoped detail page).
- 4 lib helpers (`src/lib/conflicts.ts`, `src/lib/shareLinks.ts`,
  `src/lib/equipment-utils.ts`, `src/lib/userSettings.ts`).

There is no repository, query layer, or DAL. Pages read directly from
Prisma when they need data that isn't already covered by a sibling
action.

## Phase 5 — The seams

### Layouts

- `src/app/layout.tsx:18-31` — root layout. Loads DM Sans font via CSS
  variable, sets light/dark base background, renders only `{children}`.
- `src/app/events/[id]/layout.tsx:6-25` — event-scoped layout. Fetches
  the event (via cached `getEvent`), calls `notFound()` if missing,
  renders `<Header>` + `<EventLayoutClient>` shell that adds the event
  sidebar.
- `src/app/settings/layout.tsx:6-22` — admin gate for `/settings/*`.
  Calls `requireAdmin()`, renders `<PageWrapper>` + `<SettingsTabs>` +
  children.

No other route segment has its own `layout.tsx`. There is no root
`providers.tsx` or context provider tree.

### Middleware

`src/middleware.ts:1-5` re-exports the NextAuth `auth` function as
middleware with a matcher that excludes Next-internal asset paths.
Authentication for the entire app is enforced here; per-route checks are
duplicated only for admin-restricted areas and for actions that need a
session id to write user-scoped data.

### Providers / context

- No `Provider`-wrapping component is rendered in any layout.
- No `createContext` call appears in `src/` (`grep` returned only
  unrelated hits).
- Theme is handled at CSS level via `prefers-color-scheme` + Tailwind
  `dark:` variants (`src/app/globals.css:6-10`).

### Error / not-found / loading

- No `error.tsx`, `not-found.tsx`, or `loading.tsx` anywhere — Next
  falls back to its built-in defaults.
- Missing records call `notFound()` so the framework renders its built-in
  not-found page.

### Streaming / suspense strategy

The only deliberate `<Suspense>` boundary in the app wraps the
`<Toast>` client component with `fallback={null}`
(`src/app/events/[id]/page.tsx:85-87` and 8 other pages). This is to
silence the `useSearchParams` bailout warning. Page bodies are not
streamed — `force-dynamic` on 71 of 76 pages means rendering happens at
request time, not as a stream.

### Auth model summary

- One credentials provider, JWT sessions (`src/lib/auth.ts:24-46,65-67`).
- Middleware gates everything except `/login`, `/api/auth/*`, `/share/*`.
- `User.role` is either `"admin"` or anything else; admin is required for
  `/users`, `/workflows`, `/settings`.
- Single-tenant: no organization / workspace model in
  `prisma/schema.prisma`.

### Error-handling philosophy

Errors thrown in actions surface as raw Next errors. There is no global
`error.tsx`. Missing entities → `notFound()`. Validation is enforced by
TS types at compile time and Prisma constraints at runtime; thrown
`Error` is used in a handful of admin actions
(`src/app/users/actions.ts:46-55,80-89,116`).

## Phase 6 — Almost-conventions

> **Server Action auth checks: not uniform.**
> Files with `requireAuth` / `requireAdmin` on every exported function:
> `src/app/users/actions.ts`, `src/app/workflows/actions.ts`,
> `src/app/settings/actions.ts`, `src/app/account/actions.ts`,
> `src/app/events/share-links/actions.ts`,
> `src/app/events/[id]/agenda/actions.ts`. Files with **zero** auth
> checks: `src/app/events/actions.ts`, `src/app/contacts/actions.ts`,
> `src/app/vendors/actions.ts` (37 functions), `src/app/venues/actions.ts`,
> `src/app/events/setup-orders/actions.ts`,
> `src/app/events/av-orders/actions.ts`,
> `src/app/events/catering-orders/actions.ts`,
> `src/app/events/print-orders/actions.ts`,
> `src/app/events/presentations/actions.ts`,
> `src/app/events/functions/actions.ts`,
> `src/app/events/breakout-schedule/actions.ts`,
> `src/app/events/schedule-items/actions.ts`,
> `src/app/events/workflows/actions.ts`. Operationally all are protected
> by middleware, but the files differ on whether they re-assert auth.

> **Toast pattern**: success messages flow through `?success=...` URL
> params (`src/components/Toast.tsx:11-30`). 10 redirects use this
> pattern; 9 different action files do **not** (they redirect to the
> list, e.g. `src/app/events/actions.ts:42`).

> **Inline `"use server"` closures inside pages**: 37 of 76 pages
> declare wrapper closures (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:115-200`).
> The other 39 pages either use plain Server Action imports directly
> (`src/app/contacts/new/page.tsx:16`) or do not need an action at all.

> **`params` async destructuring inconsistency**:
> 53 page files type `params: Promise<{...}>`, but the route handler at
> `src/app/api/files/[fileId]/route.ts:8` still uses the synchronous
> `params: { fileId: string }` form. No remaining `page.tsx` uses the
> sync form.

> **`getEvent` is the only `cache()`-wrapped reader**
> (`src/app/events/actions.ts:15`). `getVendor`, `getContact`,
> `getVenue`, etc. are not wrapped, even when called once per layout +
> page (`src/app/contacts/actions.ts:13`, `src/app/vendors/actions.ts`).

> **Date serialization**: `JSON.parse(JSON.stringify(events))` appears
> in `src/app/events/page.tsx:32` only. Every other list keeps Prisma
> `Date` values on the server side and never passes them to a client
> component.

> **Form submission patterns**: 10 client form components use
> `useFormStatus` for pending state
> (`src/app/events/EventForm.tsx:14`,
> `src/app/vendors/VendorForm.tsx:13`,
> `src/app/users/UserForm.tsx:9`,
> `src/app/workflows/[id]/WorkflowEditor.tsx:47`,
> `src/app/events/setup-orders/SetupOrderForm.tsx`,
> `src/app/events/KeyStaffList.tsx`,
> `src/app/events/setup-orders/SetupTableList.tsx`,
> `src/app/events/presentations/PresentationForm.tsx`,
> `src/app/events/presentations/TrackPanel.tsx`,
> `src/app/vendors/VendorContactList.tsx`). Other forms — and most
> "ad-hoc" buttons that mutate — fire actions through `useTransition`
> instead (`src/components/EntityStatusPanel.tsx:30`).

> **Two delete-button components co-exist** for the same role:
> `src/components/DeleteButton.tsx:6-49` is a standalone confirm button;
> `src/components/InlineDeleteButton.tsx:6-56` is a small inline variant
> that takes hidden form-field values. Recent code uses
> `InlineDeleteButton` in list rows
> (`src/app/events/setup-orders/SetupOrderList.tsx:13`); detail headers
> use `DeleteButton`.

> **Two "table sort" patterns**: `compareValues` /
> `sortIndicator` from `src/lib/tableSort.ts` are imported by 7 files
> (`grep -rn '@/lib/tableSort' src/`), but some lists sort inline (e.g.
> `src/app/contacts/page.tsx` uses Prisma `orderBy`). Only client-side
> tables consume `tableSort`.

> **Vendor model-type filter**: the share-side equipment report filter
> uses an `OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }]`
> pattern (`src/app/vendors/actions.ts:14-16`). Same pattern is documented
> in `CLAUDE.md:69-72`.

> **`cache()` from React** is used once. `unstable_cache` and `revalidateTag`
> are not used.

> **Cancel/restore/delete combination**: lives only in
> `src/components/CancelOrDeleteButton.tsx:17-100` (6 detail pages
> import it). Pages without entity-cancel just use `DeleteButton`.

## Phase 7 — CLAUDE.md as inferred from the codebase

The existing `CLAUDE.md` documents conventions for vendor model types,
the order list / bulk edit pattern, the report layout pattern, breakout
labels, and a small "Code Conventions" section. Below is the broader
set of rules that the current codebase appears to follow, defended only
with citations from earlier sections. Where the code is inconsistent,
the dominant version is listed first.

### Framework & layout

- App Router only. Routes live in `src/app/`; helpers in `src/lib/`;
  shared components in `src/components/`; Prisma schema in `prisma/`.
- Path alias `@/* → ./src/*`. Always import via `@/...` rather than
  relative paths across feature boundaries (`tsconfig.json:23`).
- Add `export const dynamic = "force-dynamic"` to every authenticated
  `page.tsx` (71 of 76 pages do this).
- Type page props as `params: Promise<{...}>` and
  `searchParams: Promise<{...}>` (Next 14 async-params convention;
  53 page files).

### Server vs client

- Prefer server components. Add `"use client"` only when the file needs
  local React state, an effect, a router hook, `useFormStatus`,
  `useTransition`, or a third-party client library (tiptap, @dnd-kit).
- Don't introduce a state library — there is no global client state.

### Auth

- Auth is enforced by middleware (`src/middleware.ts:1-5`); pages do not
  re-check.
- For admin-only routes call `requireAdmin()` once in the segment's
  `layout.tsx` (e.g. `src/app/settings/layout.tsx:7`).
- For Server Actions that mutate per-user data, call `requireAuth()`
  inside the action to get `session.user.id` (e.g.
  `src/app/events/[id]/agenda/actions.ts:7`).
- For Server Actions on event-scoped resources, the codebase currently
  relies on middleware-level auth and does not call `requireAuth()` per
  action; new code can follow either pattern but the dominant one is
  "no per-action check".

### Data layer

- Use the singleton from `@/lib/prisma`
  (`src/lib/prisma.ts:5-13`). Never instantiate a new `PrismaClient` at
  runtime (the only exception is `prisma/seed.mjs` and
  `scripts/backfill-setup-order-names.ts`).
- Domain types come from `@prisma/client`. For derived list/detail
  payloads, alias with `Awaited<ReturnType<typeof getX>>[number]`
  (`src/app/events/setup-orders/SetupOrderList.tsx:18`).
- There is no repository/DAL. Pages and actions both call Prisma
  directly.

### Server Actions

- Place actions in a sibling `actions.ts` with `"use server"` at the
  top (22 files).
- Read inputs with `formData.get("field") as string`. Normalize empty
  strings to `null` via `|| null` (`src/app/events/actions.ts:32-37`).
- After a mutation, call `revalidatePath(...)` for affected list +
  detail routes, then `redirect(...)`. `revalidateTag` is not used.
- For success toasts, append `?success=<message>` to the redirect URL
  (`src/app/events/setup-orders/actions.ts:110`); render `<Toast>` on
  the destination page wrapped in `<Suspense fallback={null}>`.
- After creating a record, redirect to the list view; after updating,
  redirect back to the detail view (`CLAUDE.md:240-241`).
- Action return shape: either `void` (after `redirect`) or the raw
  Prisma model. There is no `{ success, error }` envelope and
  `useActionState` is not used.

### Pages that take params

- Always `await params` / `await searchParams`
  (`src/app/events/[id]/page.tsx:27`).
- Use `Promise.all([...])` to fan out fetches
  (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:62-82`).
- Call `notFound()` when an entity is missing
  (`src/app/share/[token]/page.tsx:33`).
- For event-scoped pages, wrap remote Server Actions in inline
  `"use server"` arrow closures that bind `eventId` / sub-id before
  passing them to a client component
  (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:115-200`).

### Forms

- Use native `<form action={serverAction}>`. For submit buttons, use
  `useFormStatus()` inside a `SubmitButton` subcomponent
  (`src/app/events/EventForm.tsx:11-24`).
- For non-form actions (delete, status toggle, vendor swap), use
  `useTransition` (`src/components/EntityStatusPanel.tsx:30`).
- Confirmation dialogs are inline state, not modals
  (`src/components/DeleteButton.tsx:13-43`).

### Validation

- No runtime schema library. Trust the TypeScript types for FormData
  shape; throw `new Error(...)` for the small set of inputs that must
  be checked (`src/app/users/actions.ts:46-55`,
  `src/app/account/actions.ts:11-13`).

### Reports

- Follow the rules already in `CLAUDE.md:139-203`. Report data actions
  must not call `requireAuth()` so the unauthenticated `/share/[token]/`
  route can reuse them (`src/app/events/reports/actions.ts` has zero
  auth calls).

### Styling

- Tailwind v4 utility classes everywhere. No `cn()` helper —
  concatenate with template literals.
- Reuse `src/lib/buttonStyles.ts`, `src/lib/reportStyles.ts`,
  `src/lib/statusConstants.ts`, `src/lib/colors.ts` instead of
  redeclaring class strings.
- Apply `dark:` variants on every styled element; print uses `print:`
  utility variants + the rules in `src/app/globals.css:35-44`.

### Errors and not-found

- Don't add `error.tsx`, `not-found.tsx`, or `loading.tsx`; the codebase
  relies on Next's defaults. Use `notFound()` for missing records.

### Environment

- Access `process.env` only inside the three current touchpoints
  (`src/lib/prisma.ts:13`, `src/lib/auth.ts:7`, `src/lib/uploads.ts:4`).
  No `NEXT_PUBLIC_*` exposure.

### Tests / observability

- There are no tests and no logger. New code is not expected to add
  either unless a test suite or logger is introduced project-wide.

### Conflicts / open questions

- **Per-action auth checks**: admin/account/agenda/share-link actions
  re-check; the order-type and vendor actions do not. Dominant pattern
  by file count is "no re-check"; either is acceptable today.
- **DeleteButton vs InlineDeleteButton**: both are current; the inline
  variant is used inside table rows, the bigger button in detail
  headers.
- **`cache()` usage**: only `getEvent` is memoized. Other readers used
  from both a layout and a page (e.g. `getVenue`, `getVendor`) are not.
