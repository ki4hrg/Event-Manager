# CLAUDE.md decisions — recommendations per divergence

For every non-Consistent row in `reviews/claudemd-diff.md`, this doc
proposes a bucket and rationale. **A human must override anything that
touches auth or data integrity** (flagged inline).

Buckets: `Document it`, `Fix it`, `Decide it`, `Drop it`, `Sharpen it`.

Rows are grouped by recommended bucket; inside each bucket, architectural
rules come before style/process rules.

---

## Decide it (Conflicts and split-adoption)

### Row 60 — Per-action `requireAuth()` in Server Actions  ⚠️ **decided 2026-05-15**
**Rule (decided):** Every Server Action starts with `await requireAuth()` (or `await requireAdmin()` for admin-gated actions). Defense in depth + uniform legibility for reviewers.
**Classification:** Was Undocumented; now becomes a documented rule.
**Decision:** Document the stricter version.
**Rationale:** Cost is small (~one JWT decode per call, no DB hit; ~150-300 lines of boilerplate across ~13 files). Benefit is that every action is visibly self-protecting at a glance and the codebase doesn't depend on middleware coverage staying perfect. The previous "only when you need `session.user.id`" pattern was principled but implicit, and required readers to know about middleware coverage to verify safety.
**Migration:** Add `await requireAuth()` to every exported action in the 13 currently-unchecked files (`events`, `vendors`, `contacts`, `venues`, the six order-type files, `presentations`, `functions`, `breakout-schedule`, `schedule-items`, `events/workflows`). Admin-only actions in admin-only files use `requireAdmin()` instead.
**Knock-on:** Row 58's wording about "pages don't re-check" still stands for pages — the new rule is about Server Actions only. Row 59 (admin checks at layout vs page level) is now lower-stakes since every admin action will also self-protect.

### Row 2 / Row 72 — Route handlers' purpose  **decided 2026-05-15**
**Rule (decided):** Route handlers are reserved for cases Server Actions can't express: NextAuth callbacks, `multipart/form-data` uploads, and binary file streaming. Don't add JSON CRUD route handlers — use Server Actions instead.
**Classification:** Was Conflict; resolved.
**Decision:** Replace the "REST conventions" line in CLAUDE.md with the inferred wording.
**Rationale:** Server-Actions-everywhere is the committed model. Only 3 route handlers exist (`src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/upload/route.ts`, `src/app/api/files/[fileId]/route.ts`); none are REST CRUD. If an external API is needed in the future, that's a deliberate refactor at the time, not a default to design around now.

### Row 1 — `/components/features` subdirectory
**Rule:** Feature-specific components live in `/components/features`.
**Classification:** Conflict.
**Recommended decision:** Decide it.
**Rationale:** The directory doesn't exist. Feature-specific components are colocated under `src/app/<feature>/` (e.g. `src/app/events/EventForm.tsx`, `src/app/events/setup-orders/SetupOrderList.tsx`). The two extant `src/components/` subfolders are `ui/` and `print/`.
**Open question for humans:** (a) Drop `/components/features` from the project tree and document the colocation rule (recommended — matches every existing list/form pair), or (b) introduce the `features/` directory and migrate feature components into it.

### Row 59 — `requireAdmin()` in segment `layout.tsx` for admin routes  ⚠️ **needs human review (auth)**
**Rule:** For admin-only routes, call `requireAdmin()` once in the segment's `layout.tsx`.
**Classification:** Undocumented convention.
**Recommended decision:** Decide it.
**Rationale:** Only `src/app/settings/layout.tsx:7` follows this. `/workflows` has no layout file — each page (`page.tsx`, `new/page.tsx`, `[id]/page.tsx`) re-asserts `requireAdmin()` individually. `/users` does the same. Two valid patterns coexist.
**Open question for humans:** Standardize on the layout-level check (and add a `workflows/layout.tsx` + `users/layout.tsx`), or keep per-page checks for admin? Layout-level is fewer lines but easier to miss on a new admin route.

### Row 55 — `?success=` toast redirect convention
**Rule:** After a successful update, redirect to `?success=<message>` so `<Toast>` renders the confirmation.
**Classification:** Undocumented convention.
**Recommended decision:** Decide it.
**Rationale:** Roughly 53% adoption — 10 update redirects include `?success=`, while equivalent create flows (`src/app/events/actions.ts:42`, `src/app/contacts/actions.ts:42`) redirect without it. The current CLAUDE.md rule "After updating, stay on detail view with success toast" implies it but doesn't pin the URL convention.
**Open question for humans:** Make `?success=` mandatory on every update redirect (uniform UX) or document it as optional? Either is fine — just pick.

### Row 75 — `cache()` from React for shared readers
**Rule:** Wrap readers consumed by both a layout and a page in `cache(...)` so the request is deduped.
**Classification:** Undocumented convention.
**Recommended decision:** Decide it (alternative: Drop it).
**Rationale:** Only `getEvent` is wrapped (`src/app/events/actions.ts:15`). `getVenue`, `getVendor`, `getContact` are not, even though some are called from both a parent and child page. This is either an active convention (apply broadly) or a vestige (drop the lone wrapper).
**Open question for humans:** Audit which readers are called from both a layout and a child page; either wrap them or remove the `getEvent` wrapper.

### Row 39 — Print button vs `window.print()`
**Rule:** "Print / Save PDF" button is an `<a href="${basePath}/print?...">`, never `window.print()`.
**Classification:** Partial conflict.
**Recommended decision:** Decide it — really a sharpening exercise.
**Rationale:** The interactive report page links to a dedicated `/print` route (correct), but `src/components/print/PrintButton.tsx:5` *does* call `window.print()` — and it's rendered inside `PrintHeader.tsx` on the print page itself. That's consistent with the rule's intent (don't print the filter UI), just not its letter.
**If sharpening:** "On report pages, the Print button is a link to the dedicated `/print/` route. On the `/print/` route itself, `PrintButton` invokes `window.print()`."
**Open question for humans:** Confirm the sharpened wording, or restructure the rule.

---

## Document it (high-adoption undocumented conventions)

### Row 51 — No repository / DAL; Prisma is called directly
**Rule:** Pages, Server Actions, and `lib/` helpers call `prisma` directly. No repository/DAL layer.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 100% adoption — 47 files import `@/lib/prisma` directly across all three layers (22 `actions.ts`, 3 route handlers, ~21 server-component pages, 4 lib helpers). The team has fully committed; codifying it stops future contributors from speculatively introducing a repository abstraction.

### Row 49 — Prisma singleton from `@/lib/prisma`
**Rule:** Use the singleton from `@/lib/prisma`; never `new PrismaClient()` at runtime.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 100% adoption; the only `new PrismaClient()` calls are in `prisma/seed.mjs` and `scripts/backfill-setup-order-names.ts`, both of which run outside the Next runtime.

### Row 52 — Server Actions in sibling `actions.ts`
**Rule:** Co-locate Server Actions in a sibling `actions.ts` whose first directive is `"use server"`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 22 of 22 files; no exceptions. Already implied by `CLAUDE.md:114` ("Order List & Bulk Edit Pattern") but never stated as a general rule.

### Row 58 — Auth enforced by middleware; pages don't re-check  ⚠️ **needs human review (auth)**
**Rule:** Authentication is enforced by `src/middleware.ts`. Pages don't call `requireAuth()` unless they need `session.user.id`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it (after row 60 is decided).
**Rationale:** This is the dominant pattern. Flagged for human review because misdocumenting auth posture is a security hazard — confirm middleware coverage is truly complete (the `authorized` callback at `src/lib/auth.ts:74-85` exempts `/login`, `/api/auth/*`, `/share/*`).

### Row 47 — `export const dynamic = "force-dynamic"` on authenticated pages
**Rule:** Add `export const dynamic = "force-dynamic"` to every authenticated `page.tsx`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 71 of 76 pages (93%). The five exceptions are `settings/page.tsx` (pure redirect), `login/page.tsx`, `users/new/page.tsx`, `share/[token]/page.tsx`, `workflows/new/page.tsx` — three of which are creating-record forms that could have it added without harm.

### Row 48 — Async `params` / `searchParams` typing
**Rule:** Type page props as `params: Promise<{...}>` and `searchParams: Promise<{...}>`, then `await` them.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 53 page files use `params: Promise<...>`, 21 use `searchParams: Promise<...>`; the only non-conforming spot is the legacy route handler `src/app/api/files/[fileId]/route.ts:8` — flag for migration when next touched.

### Row 57 — Inline `"use server"` closures bind `eventId`
**Rule:** Event-scoped pages wrap remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id before passing the closures to client components.
**Classification:** Undocumented convention.
**Recommended decision:** Document it (event-scoped pages only).
**Rationale:** 37 of 76 pages use this pattern; among event-scoped detail pages with mutations it's effectively universal (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:115-200`).

### Row 53 — `formData.get(...) as string` + `|| null`
**Rule:** Read FormData inputs with `formData.get("field") as string`. Normalize empty strings to `null` with `|| null` before writing to Prisma.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 452 `formData.get(` calls; the `|| null` idiom is consistent (`src/app/events/actions.ts:32-37`).

### Row 54 — `revalidatePath`, not `revalidateTag`
**Rule:** After a mutation, call `revalidatePath(...)` for affected list + detail routes. Don't use `revalidateTag` — the project doesn't tag fetches.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 280 `revalidatePath` calls, 0 `revalidateTag`. No `fetch()` tags exist either.

### Row 56 — Return shape: `void` or raw Prisma model
**Rule:** Server Actions return `void` (after `redirect`) or the raw Prisma model. No `{ success, error }` envelope. `useActionState` is not used.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 0 hits for `useActionState`; every action follows the void-or-model shape.

### Row 50 — Derived types via `Awaited<ReturnType<typeof getX>>[number]`
**Rule:** For list/detail payloads, alias the derived type with `Awaited<ReturnType<typeof getX>>[number]`. Domain types come from `@prisma/client`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Established pattern at `src/app/events/setup-orders/SetupOrderList.tsx:18`, `SetupOrderDetails.tsx:8-10`, `WorkflowSection.tsx:4`.

### Row 61 — `notFound()`; no `error.tsx` / `not-found.tsx` / `loading.tsx`
**Rule:** Missing records call `notFound()`. Don't add `error.tsx`, `not-found.tsx`, or `loading.tsx` files — rely on Next's defaults.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Zero such files exist; `notFound()` is used widely (`src/app/share/[token]/page.tsx:33,110,174,243,286` alone). Documenting "don't add these" prevents well-meaning contributors from introducing a fragmented error layer.

### Row 45 — App Router only; no `pages/` directory
**Rule:** App Router only; do not create `pages/`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Trivially true today; documenting blocks accidental Pages-Router additions.

### Row 46 — Path alias `@/` for cross-feature imports
**Rule:** Import via `@/...` rather than relative paths across feature boundaries. `@/* → ./src/*`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** `tsconfig.json:23` configures it; all sample-checked cross-feature imports use it.

### Row 62 — No runtime schema validation; manual `throw new Error`
**Rule:** No zod/yup/valibot. Trust TypeScript types for FormData shape; use `throw new Error(...)` only for inputs that must be checked at runtime.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 0 zod imports; manual throws live at `src/app/users/actions.ts:46-55`, `src/app/account/actions.ts:11-13`. **Human caveat:** if the team plans to add zod later, mark this as "current state, not aspirational."

### Row 63 — No client state library
**Rule:** No Zustand/Jotai/Redux/SWR/React Query. Use React built-ins.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 0 hits for any of those libraries. URL search params + `UserSetting` rows cover persistence.

### Row 73 — User prefs in `UserSetting`
**Rule:** Persist per-user preferences via `setUserSetting` / `getUserSetting` from `@/lib/userSettings` (backed by the `UserSetting` table). Don't add cookies or localStorage for the same need.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Single coherent pattern; 8 importers. Landing-page preference and agenda view settings already use it.

### Row 67 — Native form + `useFormStatus`
**Rule:** Use native `<form action={serverAction}>`. Submit button uses `useFormStatus()` inside a `SubmitButton` subcomponent.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 10 form components follow this pattern (`src/app/events/EventForm.tsx:11-24`, etc.).

### Row 68 — `useTransition` for non-form mutations
**Rule:** For non-form mutations (delete, status toggle, vendor swap), call the Server Action inside `useTransition` and disable the trigger while pending.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Established at `src/components/CancelOrDeleteButton.tsx:27`, `EntityStatusPanel.tsx:30`, `ShareReportButton.tsx:47`, `FileUploadPanel.tsx`.

### Row 69 — Inline confirmation, not modal dialogs
**Rule:** Confirmation steps (delete, cancel) use inline state on the trigger, not modal dialogs.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** `src/components/DeleteButton.tsx:13-43`, `InlineDeleteButton.tsx:6-56` — there are no modal dialog components in `src/components/`.

### Row 65 — Reuse `@/lib/buttonStyles`, `reportStyles`, `statusConstants`, `colors`
**Rule:** Reuse the Tailwind class-string libs in `src/lib/` instead of redeclaring class strings.
**Classification:** Undocumented convention (partial — current CLAUDE.md only mentions `reportStyles`).
**Recommended decision:** Document it.
**Rationale:** `buttonStyles` (10 importers), `statusConstants` (13), `colors` (6), `reportStyles` (7). Extending the existing rule is a small, low-risk addition.

### Row 64 — Tailwind v4; no `cn()` helper
**Rule:** Tailwind v4 utility classes; concatenate with template literals. Do not introduce `cn()` / `clsx` / `tailwind-merge`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Pervasive — no `cn` helper exists. Documenting prevents a contributor from adding one and starting a split.

### Row 66 — `dark:` everywhere; `print:` variants per `globals.css`
**Rule:** Apply `dark:` variants on every styled element. Print formatting uses `print:` utility variants + the rules in `src/app/globals.css:35-44`.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Universal in sample-checked components; print styles consolidated in one file.

### Row 70 — `process.env` only in three touchpoints
**Rule:** Access `process.env` only inside `@/lib/prisma`, `@/lib/auth`, `@/lib/uploads`. No `NEXT_PUBLIC_*` variables.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** 3 touchpoints, 0 `NEXT_PUBLIC_*`. Documenting forces new env vars to be funneled through a small surface.

### Row 71 — No tests, no logger (current state)
**Rule:** The project has no test suite and no structured logger. Don't add ad-hoc tests or `console.error` calls for "logging"; if the team wants observability, introduce a logger project-wide rather than peppering call sites.
**Classification:** Undocumented convention.
**Recommended decision:** Document it (as "current state").
**Rationale:** Honest description of where the project is. **Human caveat:** if testing is on the roadmap, frame this as transitional.

### Row 74 — `Promise.all` for fan-out in pages
**Rule:** In server pages that fetch multiple independent resources, batch with `Promise.all([...])` rather than awaiting sequentially.
**Classification:** Undocumented convention.
**Recommended decision:** Document it.
**Rationale:** Established pattern across every detail page (`src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:62-82`, etc.).

### Row 10 — Named exports for non-page components
**Rule:** Use named exports for components, except for `page.tsx` / `layout.tsx` / `not-found.tsx` (Next requires default exports there).
**Classification:** Documented but absent — actually followed.
**Recommended decision:** Document it (sharpened).
**If sharpening:** "Named exports for components except where Next requires `export default` (page, layout, error, loading, not-found, route)."
**Rationale:** The current CLAUDE.md line is correct in intent but ambiguous about Next-required defaults.

---

## Sharpen it (Vague rules)

### Row 12 — "Colocate component-specific logic"
**Classification:** Vague.
**Recommended decision:** Sharpen it.
**If sharpening:** "Feature components live next to their `actions.ts` under `src/app/<feature>/`. Shared components live in `src/components/`. Pages remain thin: fetch + delegate."
**Rationale:** The principle is real, but the current wording isn't checkable. The sharpened version is verifiable in a PR review by glancing at the file location.

### Row 13 — "Mobile-first responsive design"
**Classification:** Vague.
**Recommended decision:** Sharpen it.
**If sharpening:** "Every report table must render BOTH a mobile-card layout (`sm:hidden`) and a desktop/print table (`hidden sm:block print:block`). Other lists may rely on horizontal scroll, but new full-page layouts should be functional at 360 px width."
**Rationale:** The codebase only systematically applies mobile-first thinking to reports (already in `CLAUDE.md:154-167`). Pulling that into the general rule makes the principle reviewable.

---

## Drop it

### Row 15 — "Modular structure for future extensibility"
**Classification:** Vague.
**Recommended decision:** Drop it.
**Rationale:** Not checkable; every team claims this; no PR was ever rejected for failing it.

### Row 16 — "Lightweight Docker deployment"
**Classification:** Vague (more "fact" than "rule").
**Recommended decision:** Drop it from "Architecture Principles".
**Rationale:** Belongs to Tech Stack / Deployment section. Keep `Dockerfile` and `docker-compose.yml` in the repo; remove the bullet from the rules.

---

## Summary

| Bucket | Count |
|---|---|
| Decide it | 7 (of which 3 flagged for human review: auth/security) |
| Document it | 25 |
| Sharpen it | 2 |
| Drop it | 2 |
| Fix it | 0 |

**Highest-leverage decisions for humans, in order**:

1. **Row 60** (per-action `requireAuth`) — security posture, genuinely inconsistent; the answer cascades into Row 58 wording.
2. **Row 2 / Row 72** (route handler scope) — replaces a wrong line in CLAUDE.md and pins the team's architectural choice.
3. **Row 1** (`/components/features`) — the project tree in CLAUDE.md is wrong today.
4. **Row 59** (admin auth at layout vs page) — defense-in-depth tradeoff with two valid current patterns.
5. **Row 55** (`?success=` toast) — small UX consistency choice that's easy to settle and unblock.

Everything in the "Document it" bucket is essentially mechanical: the code has voted, and CLAUDE.md just needs to catch up. The "Decide it" rows are where genuine ambiguity lives and warrant a real discussion.
