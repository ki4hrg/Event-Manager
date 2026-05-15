# Conventions Observed

A survey of the recurring patterns in the Event Manager codebase, gathered by reading representative files across modules (events, contacts, vendors, venues, users, settings, share, workflows, upload API). Each pattern has 3+ concrete citations with file:line references. Patterns already documented in `CLAUDE.md` (Order List & Bulk Edit, Report Layout, Vendor Model Types, Breakout Session Labels) are not duplicated here.

## 1. Error handling

### 1.1 Server actions throw `Error`; client forms catch into local state

Server actions surface user-facing failures by `throw new Error("message")`. There is no `{ ok: false, error }` return-shape convention — errors propagate as exceptions. Client forms wrap the action in `try/catch` and render `e.message` in a red inline alert.

- `src/app/users/actions.ts:45-46` — `if (!email || !password) throw new Error("Email and password are required")`
- `src/app/users/actions.ts:54-56` — duplicate-email check throws `"A user with this email already exists"`
- `src/app/users/actions.ts:115-117` — `if (session.user.id === id) throw new Error("You cannot delete your own account")`
- `src/app/settings/actions.ts:74` — `if (!existing) throw new Error("Option not found")`
- `src/app/users/UserForm.tsx:46-53` — form-side counterpart: `try { await saveAction(formData) } catch (e) { setError(e instanceof Error ? e.message : "An error occurred") }`
- `src/app/users/UserForm.tsx:96-100` — error rendered as `bg-red-50 ... rounded-md` div above the form

Variant: `findUniqueOrThrow` is used when the missing-record case truly shouldn't happen and a 500 is acceptable.
- `src/app/events/share-links/actions.ts:39-42` — `prisma.shareLink.findUniqueOrThrow(...)` before update

### 1.2 Most Prisma calls are unguarded; failures bubble to Next.js

Server actions do not wrap Prisma in `try/catch`. A constraint violation or FK failure becomes an uncaught exception, which Next.js renders as a 500. Client forms catch it via 1.1 and show the message; pages without a form just error.

- `src/app/events/actions.ts:30-39` — `prisma.event.create` with no guard
- `src/app/contacts/actions.ts:28-38` — `prisma.contact.create` with no guard
- `src/app/vendors/actions.ts:73-75` — `prisma.vendor.create` with no guard

### 1.3 API routes: explicit `try/catch` with `NextResponse.json(..., { status })`

The one non-server-action mutation surface (`/api/upload`) uses the conventional REST shape: validate up front, return `400` with `{ error }`, catch around I/O, return `500` and clean up partial state.

- `src/app/api/upload/route.ts:18-26` — `return NextResponse.json({ error: "..." }, { status: 400 })` for each missing/invalid field
- `src/app/api/upload/route.ts:55-61` — outer catch deletes the half-written file, `console.error("Upload error:", error)`, returns 500
- `src/app/files/actions.ts:8-24` — sibling pattern in a server action: silent `return` if record missing, `try { unlinkSync } catch {}` swallows FS errors

### 1.4 Dynamic route pages: `notFound()` on null lookup

Every `[id]/page.tsx` checks the loaded record and calls `notFound()` from `next/navigation`. The 404 page is the only branch — there is no per-page error UI.

- `src/app/contacts/[id]/page.tsx:20-22` — `if (!contact) { notFound(); }`
- `src/app/vendors/[id]/page.tsx:31-33` — `if (!vendor) { notFound(); }`
- `src/app/share/[token]/page.tsx:32-33` — `if (!link) notFound();`

### 1.5 Success messaging: redirect with `?success=...`, consumed by `<Toast>`

After a successful mutation, server actions `redirect(\`/path?success=Message\`)`. A `<Toast>` client component reads the search param, shows a fixed bottom-right green toast for 3s, and rewrites the URL to strip the param.

- `src/app/events/actions.ts:65-67` — `redirect(\`/events/${id}?success=Event updated\`)`
- `src/app/contacts/actions.ts:66-68` — `redirect(\`/contacts/${id}?success=Contact updated\`)`
- `src/app/users/actions.ts:108-109` — `redirect(\`/users/${id}?success=User updated successfully\`)`
- `src/components/Toast.tsx:12-27` — reads `searchParams.get("success")`, calls `router.replace` to strip the param, auto-hides after 3000 ms

Note: this is the pattern for **update** mutations. Per `CLAUDE.md`, **create** redirects to the list view with no toast (e.g. `src/app/events/actions.ts:41-42`, `src/app/contacts/actions.ts:40-41`).

## 2. Data validation

### 2.1 No schema library — manual `FormData.get(...) as string` everywhere

There is no zod / yup / valibot. Inputs are cast directly from `FormData` and defaulted inline. Validation, if any, is one or two inline `if` checks before the Prisma call.

- `src/app/events/actions.ts:22-39` — `createEvent` casts 6 fields, no validation, passes straight to Prisma
- `src/app/contacts/actions.ts:19-26` — `createContact` casts 7 fields including `formData.getAll("roles")`, no validation
- `src/app/settings/actions.ts:36-41` — `createOption` extracts label/color/group/models with no schema
- `src/app/users/actions.ts:40-47` — only a manual presence check (`if (!email || !password) throw ...`)

### 2.2 Optional fields: `(formData.get(x) as string) || null` to coerce empty strings to `null`

Empty form inputs come back as `""`, which would persist as an empty string instead of `NULL`. The codewide convention is to OR-coalesce to `null` at the action boundary.

- `src/app/events/actions.ts:33-37` — `description: description || null`, `venueId: venueId || null`
- `src/app/vendors/actions.ts:71,84` — `notes: (formData.get("notes") as string) || null`
- `src/app/contacts/actions.ts:32-35` — `email: email || null`, `phone: phone || null`, `organization: organization || null`, `notes: notes || null`
- `src/app/settings/actions.ts:53-54` — `color: color || null`, `group: group || null`

### 2.3 Booleans: compared as the literal string `"true"`

Checkboxes/hidden inputs serialize as strings. The convention is `=== "true"` (not truthy-coercion, not parsing).

- `src/app/vendors/actions.ts:131` — `const isPrimary = formData.get("isPrimary") === "true";`
- `src/app/vendors/actions.ts:154,167` — same pattern in update/replace
- `src/lib/userSettings.ts:62-64` — reverse direction when reading stored prefs: `=== "true"`

### 2.4 Multi-select: `formData.getAll(name) as string[]`

For checkbox groups and multi-select fields, the convention is `getAll` with no validation of the returned values.

- `src/app/vendors/actions.ts:70,83` — `formData.getAll("models") as string[]`
- `src/app/contacts/actions.ts:26,51` — `formData.getAll("roles") as string[]`
- `src/app/settings/actions.ts:41,68` — `formData.getAll("models") as string[]`

### 2.5 Search queries: reject under 2 chars

Search endpoints short-circuit `if (!query || query.length < 2) return []` before hitting the DB. Not universal — a few endpoints skip the check.

- `src/app/events/actions.ts:76-78` — `searchContactsForKeyStaff`
- `src/app/venues/actions.ts:166-169` — `searchContacts`
- `src/app/events/share-links/actions.ts` — relevant `searchVendors` (in `vendors/actions.ts:58-66`) is an **exception**: no length check, returns all matches via `take: 20`

### 2.6 Date inputs: `new Date(string)` from `type="date"`, hand-rolled timezone parsing from `datetime-local`

`<input type="date">` strings (YYYY-MM-DD) are passed straight to `new Date()`. `datetime-local` strings need timezone awareness, so a single shared helper iterates Intl formatter output to converge across DST.

- `src/app/events/actions.ts:34-35` — `startDate: new Date(startDate)`, `endDate: new Date(endDate)`
- `src/app/events/share-links/actions.ts:30` — `expiresAt: input.expiresAt ? new Date(input.expiresAt) : null`
- `src/app/events/functions/actions.ts:14-56` — `parseDateTimeInTimezone()` iterative-converge helper for DST-safe parsing of `datetime-local`

### 2.7 Whitelist validation: compare against a typed constant array

Where a string must match a known enum but isn't a Prisma enum, validate by membership in an exported constant array.

- `src/app/account/actions.ts:10-13` — `if (!VALID_LANDING_PAGES.includes(...)) throw new Error("Invalid landing page option")`
- `src/app/api/upload/route.ts:21-23` — `if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as EntityType))` → 400
- `src/app/users/actions.ts:63,96` — role normalized via ternary: `role === "admin" ? "admin" : "user"`

## 3. Dependency injection / module wiring

There is no DI container; "wiring" here means how shared resources (Prisma, auth, helpers, server actions) reach the consumer.

### 3.1 Prisma is a hot-reload-safe global singleton, imported via `@/lib/prisma`

- `src/lib/prisma.ts:1-13` — singleton: `globalThis.prisma ?? new PrismaClient()`; in non-production, write the instance back onto `globalThis` so Next's dev hot-reload doesn't leak connections
- `src/app/events/actions.ts:4` — `import { prisma } from "@/lib/prisma";`
- `src/app/vendors/actions.ts:3` — same import; used across ~20 functions in that file
- `src/app/contacts/actions.ts:3` — same import

The TS path alias `@/*` → `src/*` is the universal way actions reach `lib/`. No barrel re-exports.

### 3.2 Auth is enforced by calling `requireAuth()` / `requireAdmin()` at the top of each action

Auth is not enforced once at a route boundary — every server action that needs auth calls a helper from `src/lib/auth.ts` as its first line. Helpers `redirect("/login")` or `redirect("/")` on failure.

- `src/lib/auth.ts:96-102` — `requireAuth()` redirects to `/login` if no session
- `src/lib/auth.ts:104-110` — `requireAdmin()` redirects to `/` if role !== "admin"
- `src/app/users/actions.ts:10,24,38,72,113` — every user-management action opens with `await requireAdmin()`
- `src/app/settings/actions.ts:37,64` — every settings mutation opens with `await requireAdmin()`
- `src/app/events/share-links/actions.ts:19,38,51,60` — share-link actions open with `await requireAuth()`

Middleware (`src/middleware.ts:1-5`) re-exports the NextAuth `auth` handler and additionally allows `/share/*` unauthenticated (`src/lib/auth.ts:75`). This is why CLAUDE.md insists report **data** actions do not call `requireAuth()` — they're hit by the share route.

### 3.3 Server-action wrappers are defined inline on the page and passed down to client components

Dynamic route pages bind the URL `id` into closure wrappers marked `"use server"`, then hand them to `"use client"` form components. This is the codebase's way of "injecting" a pre-bound mutation handler.

- `src/app/contacts/[id]/page.tsx:24-32` — `updateContactWithId` and `deleteContactAction`, both `"use server"`, both close over `id`
- `src/app/vendors/[id]/page.tsx:35-68` — seven inline `"use server"` wrappers (`updateVendor`, `deleteVendor`, `searchContacts`, `addContact`, `updateContact`, `removeContact`, `createContact`), each bound to the vendor `id`
- `src/app/contacts/[id]/page.tsx:45` — wrappers are passed by name: `<ContactForm action={updateContactWithId} />`

### 3.4 `revalidatePath` + `redirect` after every mutation

Every mutation ends with `revalidatePath(...)` for each affected list/detail route, then either `redirect(...)` to the next page (create/delete) or a `redirect(?success=...)` (update).

- `src/app/events/actions.ts:41-42` — create: `revalidatePath("/events"); redirect("/events");`
- `src/app/events/actions.ts:65-67` — update: revalidate both list and detail, then `redirect(\`/events/${id}?success=Event updated\`)`
- `src/app/vendors/actions.ts:77-78` — create: `revalidatePath("/vendors"); redirect(\`/vendors/${vendor.id}\`);`
- `src/app/vendors/actions.ts:91-92` — update without redirect (form stays put): revalidate detail + list, no `redirect()`
- `src/app/users/actions.ts:108-109` — update: revalidate list, redirect to detail with `?success=`

### 3.5 Request-scoped memoization with `cache()` for hot lookups

Page reads that may be reached multiple times in one render pass are wrapped with React's `cache()` so duplicate calls in the same request hit the same Prisma query.

- `src/app/events/actions.ts:3` — `import { cache } from "react";`
- `src/app/events/actions.ts:15-20` — `export const getEvent = cache(async (id: string) => { ... })`

(This is the only `cache()` use spotted — most read functions are plain `async` exports.)

### 3.6 Multi-step mutations: `prisma.$transaction` (callback form)

When more than one row has to be written together, the callback form of `$transaction` is used. Helper functions receive `tx: Prisma.TransactionClient` rather than the global `prisma`.

- `src/app/events/actions.ts:131-144` — create a contact + its `eventKeyStaff` join row atomically
- `src/app/settings/actions.ts:78-92` — update an option and `propagateLabelRename(tx, ...)` against every table that stores the label string
- `src/app/settings/actions.ts:100-130` — `propagateLabelRename` signature: `(tx: Prisma.TransactionClient, ...)` — tx is threaded as a parameter, not re-imported

## 4. Tests

**There are no tests in this repository.**

- `package.json:5-14` — `scripts` lists `dev`, `build`, `start`, `lint`, and `db:*` only; no `test`, `vitest`, `jest`, or `playwright` entry
- `package.json:16-46` — no test framework in `dependencies` or `devDependencies` (no vitest/jest/playwright/mocha/chai/testing-library)
- `find` for `*.test.*`, `*.spec.*`, `vitest.config.*`, `jest.config.*`, `playwright.config.*` under the repo (excluding `node_modules`) returns zero matches
- No `__tests__/` directories anywhere under `src/`

The closest things to executable verification:

- `prisma/seed.mjs` — seeds default `CustomOption` rows and a system user; runnable via `npm run db:seed` (declared at `package.json:28-30`). Exercises the schema end-to-end on a fresh DB
- `scripts/backfill-setup-order-names.ts` — one-shot data-migration script, runnable with `tsx`; not a test
- `npm run lint` (`package.json:9`) and `npm run build` (`package.json:7`) are the only automated checks gating correctness

Implication for new contributions: typing (`tsc`/Next build) and ESLint are the only safety nets in CI. UI/feature correctness has to be verified manually per the rule in `CLAUDE.md` ("start the dev server and use the feature in a browser before reporting the task as complete").
