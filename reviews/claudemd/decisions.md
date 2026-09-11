# CLAUDE.md decisions — recommendations per divergence

For every non-Consistent row in `reviews/claudemd/diff.md`, this doc
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

### Row 1 — `/components/features` subdirectory  **decided 2026-05-15**
**Rule (decided):** Document the actual tree and the colocation principle.
**Classification:** Was Conflict; resolved.
**Decision:** Rewrite the Project Structure block in CLAUDE.md as:

> ```
> /components       # Cross-feature shared components
>   /ui             # Generic UI primitives (ViewToggle, etc.)
>   /print          # Print/PDF layout helpers (PrintHeader, PrintButton, ...)
> ```
> Feature-specific components colocate with their `actions.ts` under
> `src/app/<feature>/`. `src/components/` is reserved for components
> reused across two or more features.

**Rationale:** Current CLAUDE.md lists a nonexistent `/components/features` directory and omits the real `print/` subfolder. Colocation under `src/app/<feature>/` is the universal pattern for feature components (`src/app/events/EventForm.tsx`, `src/app/events/setup-orders/SetupOrderList.tsx`, etc.). `ui/` stays documented as a home for future shared primitives even though it has one file today.

### Row 59 — `requireAdmin()` in segment `layout.tsx` for admin routes  ⚠️ **decided 2026-05-15**
**Rule (decided):** Admin-only route segments must have a `layout.tsx` that calls `requireAdmin()`. Child pages do not re-check.
**Classification:** Was Undocumented; resolved.
**Decision:** Standardize on Pattern A (layout-level check).
**Rationale:** Combined with Row 60 (every admin Server Action calls `requireAdmin()` internally), the layout protects page rendering and the action protects mutations. Defense in depth without per-page boilerplate. One file per segment enforces auth so a new admin page can't accidentally skip the check.
**Migration:** Add `src/app/users/layout.tsx` and `src/app/workflows/layout.tsx` that each call `requireAdmin()`. Remove the 5 per-page `requireAdmin()` calls in `src/app/users/page.tsx`, `src/app/users/[userId]/page.tsx`, `src/app/workflows/page.tsx`, `src/app/workflows/new/page.tsx`, `src/app/workflows/[id]/page.tsx`. `src/app/settings/layout.tsx` already conforms.

### Row 55 — `?success=` toast redirect convention (and create-vs-update redirect target)  **decided 2026-05-15**
**Rule (decided, two parts):**

> *Redirect target after create:*
> - Thin top-level entities (User, Event, Venue, Contact) → redirect to the list view.
> - Entities that need further setup on their detail page (Vendor, every order type, Presentation, Function) → redirect to the detail view.
> - Duplicates always redirect to the detail view of the new copy.
>
> *Success toasts:*
> Every successful mutation redirects with `?success=<short message>`. Pages that are valid redirect destinations must mount `<Toast>` wrapped in `<Suspense fallback={null}>`.
> After updating, the redirect target is the detail view (already universal in current code).

**Classification:** Was Undocumented; also corrects the earlier Row 3 finding (the "create → list view" line in current CLAUDE.md is contradicted by 7 of 11 create actions — should have been a Conflict, not Consistent).
**Decision:** Adopt the rewrite. Apply `?success=` to creates too (uniform UX); mount `<Toast>` on the four list pages that lack it.
**Rationale:** Current code redirects 4 simple entities to list and 7 multi-step entities to detail — the existing rule "create → list view" is just outdated. Uniform `?success=` is cheap once `<Toast>` is mounted on the list destinations, and the same `<Toast>` will be useful for other flows (bulk delete confirmations, link-action confirmations, etc.).
**Migration:**
- Add `<Toast>` (inside `<Suspense fallback={null}>`) to `src/app/users/page.tsx`, `src/app/events/page.tsx`, `src/app/venues/page.tsx`, `src/app/contacts/page.tsx`.
- Append `?success=<message>` to `createUser` (`src/app/users/actions.ts:109` area), `createEvent` (`src/app/events/actions.ts:42`), `createVenue` (`src/app/venues/actions.ts`), `createContact` (`src/app/contacts/actions.ts:42`).
- Audit other create/duplicate actions for `?success=` consistency on the detail redirects (most update redirects already have it).
**Knock-on:** Update the existing CLAUDE.md "Code Conventions" line that says "After creating a new record, redirect to list view (not detail view)" — replace with the split rule above. (This is the Row 3 correction.)

### Row 75 — `cache()` from React for shared readers  **decided 2026-05-15**
**Rule (decided):** Wrap a Server Action reader in `cache()` from `react` only when the same reader is called more than once in the same request — typically because a `layout.tsx` and its child `page.tsx` both need the same entity. Don't wrap readers used in a single place.
**Classification:** Was Undocumented; resolved.
**Decision:** Document the principle. Current code is already correct.
**Rationale:** `getEvent` is the only reader wrapped because `/events/[id]/*` is the only segment with a layout (`src/app/events/[id]/layout.tsx:14`) that fetches the entity for the sidebar — every page beneath it also calls `getEvent(id)` for breadcrumbs/titles, so the wrapper dedupes a real layout+page double-fetch. Vendor/Venue/Contact don't have a layout, so a single call per request means no duplication and no need for `cache()`. If a future segment grows a layout (e.g. `/vendors/[id]/layout.tsx`), the convention prompts a refactor to wrap that reader in `cache()` at the same time.

### Row 39 — Print button vs `window.print()`  **decided 2026-05-15**
**Rule (decided):** On interactive report pages (under `/events/[id]/reports/...`), the "Print / Save PDF" button is a link to the dedicated `/print` route, never `window.print()`. On the `/print` route itself, `PrintButton` (`src/components/print/PrintButton.tsx:5`) calls `window.print()` — that's the correct trigger for a chrome-free PDF export.
**Classification:** Was Partial conflict; resolved.
**Decision:** Adopt the sharpened wording.
**Rationale:** Two distinct layers: the interactive-route link swaps the user into print formatting via the dedicated route; the print route then invokes the browser print dialog. Both are intentional. Current code already follows this; the previous CLAUDE.md wording just didn't acknowledge the second layer.

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

### Row 47 — `export const dynamic = "force-dynamic"` on authenticated pages  **decided 2026-05-15**
**Rule (decided):** Every authenticated `page.tsx` declares `export const dynamic = "force-dynamic"`. No carve-outs except `src/app/login/page.tsx`, `src/app/share/[token]/page.tsx` (unauthenticated), and `src/app/settings/page.tsx` (pure redirect, no body).
**Classification:** Was Undocumented; resolved.
**Decision:** Document the uniform rule.
**Migration:** Add the line to `src/app/users/new/page.tsx` and `src/app/workflows/new/page.tsx`.

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

### Row 62 — No runtime schema validation; manual `throw new Error`  **decided 2026-05-15**
**Rule (decided):** No zod/yup/valibot. Trust TypeScript types for FormData shape; use `throw new Error(...)` only for inputs that must be checked at runtime (e.g. uniqueness preview, cross-field invariants).
**Classification:** Was Undocumented; resolved.
**Decision:** Document as the long-term position for this codebase.
**Rationale:** Internal single-tenant tool with credentials auth and trusted contributors. The current pattern (`formData.get() as string` + Prisma constraints + occasional manual checks) covers the realistic threat model. The one scenario that would force revisiting: if forms need to return field-level error messages to the user instead of erroring out, some validation layer becomes necessary — not necessarily zod.

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

### Row 71 — No tests, no logger  **decided 2026-05-15**
**Rule (decided):** The project intentionally ships without a test suite or structured logger. Don't add ad-hoc tests or `console.error` calls for "logging"; if observability is needed in the future, introduce a logger project-wide rather than peppering call sites.
**Classification:** Was Undocumented; resolved.
**Decision:** Document as the long-term position.
**Rationale:** Internal single-tenant tool, stable codebase, lean velocity has worked. Noted for future reference: if tests are ever introduced, the highest-leverage targets are the time-zone math in `src/app/events/breakout-schedule/actions.ts:9-50` and the conflict detection in `src/lib/conflicts.ts` — those are the riskiest logic in the codebase. Not a CLAUDE.md decision today.

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

### Row 12 — "Colocate component-specific logic"  **decided 2026-05-15**
**Rule (decided):** Merge into Row 1's Project Structure section. The vague "Colocate component-specific logic" line gets dropped from "Code Conventions"; the colocation rule already added to Project Structure ("Feature-specific components colocate with their `actions.ts` under `src/app/<feature>/`") covers the same ground in checkable form.
**Classification:** Was Vague; resolved.
**Decision:** Merge + drop the original line. Add one sentence to the Project Structure block: "Pages remain thin — fetch + delegate to the colocated client component."
**Rationale:** Keeps CLAUDE.md tight; one canonical statement about where new code goes. Avoids overlap between "Project Structure" and "Code Conventions".

### Row 13 — "Mobile-first responsive design"  **decided 2026-05-15**
**Rule (decided):** Reports must render dual layouts: a mobile card view (`sm:hidden`) and a desktop/print table (`hidden sm:block print:block`). Other tables may rely on horizontal scroll inside `overflow-x-auto`, but every new full-page layout (sidebars, filter bars, forms) must remain functional at 360 px width.
**Classification:** Was Vague; resolved.
**Decision:** Adopt the two-tier wording (Option A).
**Rationale:** Describes the actual posture today — reports are the highly mobile-optimized surface; order lists and most other tables rely on horizontal scroll and work fine at narrow widths. Migrating order lists to dual-render would be a separate, larger decision; conflating it with CLAUDE.md cleanup would either misrepresent the codebase or trigger work nobody scheduled.

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

---

## Parked candidates (between-review, 2026-09-11)

Entries from `reviews/claudemd/candidates.md` judged too feature-specific or historical to be a CLAUDE.md rule, kept here verbatim so the rationale stays findable. Not rules; don't promote without a second occurrence.

- [share-links] "Create-and-bounce" sub-pattern of archetype B: `src/app/events/[id]/share-links/dashboards/new/page.tsx` is a server component that calls `createShareLinkGroup({ eventId })` and immediately `redirect()`s to the new id's edit page — no form. Useful when an entity is created with no required fields and configuration happens on the detail view. Single occurrence today; flag if this shape recurs.
- [auth] `src/types/next-auth.d.ts` now augments BOTH `next-auth` (Session/User) AND `next-auth/jwt` (JWT). The JWT augmentation is required whenever a custom field is stored on the token (we added `roleId`); without it, `token.x = ...` assignments in the JWT callback are typed as `any`. Worth documenting alongside the auth.ts callback pattern.
- [supply-orders] Order-overview "attention" attention links work cleanly when the dimension is presence/absence (`?vendor=none`, `?linked=none`), but SupplyOrder's required `roomId` removes the "missing room" attention case. Pattern: when an order's natural attention dimension is a presence flag rather than a structural field, just point at the basePath instead of inventing a fake filter param.
- [infra/db] Postgres major-version upgrades are NOT in-place: the PG18 official image refuses to start on a PG16 data dir (dump/restore or pg_upgrade required). Also, PG18 moved its default `PGDATA` to `/var/lib/postgresql/18/docker` and the declared VOLUME to `/var/lib/postgresql` — a compose mounting the old `…/data` path silently bypasses the named volume. Pin `PGDATA=/var/lib/postgresql/data` to keep the existing `postgres_data` volume in use. Reference: commit 450091f (docker-compose.yml + .dev.yml).
- [supply-orders] Container packing avoids the `b3f9985` cascade-divergence problem by never storing parent state: the container line's `packingStatus` is the box's own, and pushing it onto the contents is a separate explicit verb (`markContainerContentsCore`) with a counted confirm, in the spirit of `BulkItemStatusPanel` rather than PrintOrder's implicit header cascade. The cascade crosses orders and order types, so it checks `SUPPLY_ORDERS` and `PRINT_ORDERS` WRITE independently and reports what it skipped instead of applying silently.
- [storage-locations] Durable-default-plus-per-event-override: `StorageLocation.parentId` is a container's permanent home, and the per-event row (its `SupplyOrderItem` container line's `sourceLocationId`) overrides it for that event, resolved as `override ?? default` by `resolvePlacements`. This avoided a placement table entirely and is reusable wherever a global catalog needs per-event variation. Corollary: the tree encodes home, not current whereabouts — a box on a truck still sits under Off-Site Storage; where it is right now is its container line's packingStatus.
- [permissions] `STORAGE_LOCATIONS` is the first global catalog resource granted to the seeded User role (WRITE) rather than being admin-only like `EQUIPMENT` — load-out means packers add and re-place containers in the field. DELETE stays admin-only, which makes archiving the field-safe retire path. It therefore lives in the main Header nav, not `AdminDropdown`: a one-item "Admin" menu would misrepresent it and would open for every user with no other admin resource.
- [inventory] `SupplyOrderItem.inventoryItemId` is provenance-only: it records where a line came from and prefills it, but never decrements or flags the inventory row as "out". Chosen over a check-out/check-in state machine because that state drifts whenever an order is deleted, and because quantity-at-location splitting is deferred. Consequence worth stating: an inventory item has exactly one home, so re-filing it into a different container *is* the permanent move — there is no temporary-vs-permanent placement to model.
- [inventory] `InventoryItem.equipmentId` is REQUIRED, not optional — inventory is catalogued gear, so the Equipment link is identity and `name` is only a qualifier ("blue", "spare"). This is what makes stock answerable across locations ("how many easels, and where?"), which free text can't do. Consequence chain worth remembering: required link forces `onDelete: Restrict` on the Equipment FK (SetNull is unavailable once the column is non-null), and forces post-event "Return to…" to skip supply lines that have only a free-text description — it names them so they can be catalogued and retried.
- [permissions] EQUIPMENT is admin-only while STORAGE_LOCATIONS is User-WRITE, so any feature that makes one depend on the other splits by role. Requiring an Equipment link on inventory means a packer can file catalogued gear but cannot extend the catalog; the inline "＋ New equipment" affordance is gated on EQUIPMENT WRITE and simply absent for them. Decided deliberately over granting the User role EQUIPMENT WRITE. General lesson: when two resources sit on opposite sides of the admin boundary, check which role actually performs the task before coupling them — testing as admin hides this entirely.
- [mobile-audit] Measuring mobile overflow with Playwright `isMobile: true` gives false negatives — Chrome's mobile emulation widens the layout viewport to fit the content, so `scrollWidth - innerWidth` reads 0 on a page that's visibly broken. Audit at a fixed `viewport: { width: 390 }` with `isMobile: false`, or compare the fullPage screenshot's pixel width against 390.
- [ui] Hiding a table's select-all column must also drop its filter-row spacer `<td>` and adjust any `colSpan` (see ScheduleItemList).
- [media-deliverables] Create-time function/presentation linking uses checkbox multi-selects (name="functionIds"/"presentationIds", read via formData.getAll), not the single-select LinkSelectField pattern AVOrder/SetupOrder use at create — MediaDeliverable's function/presentation links are many:many, so create-time linking should match that cardinality. The Provider `PartyField` pool is refreshed live via a client-invoked read-only Server Action (getMediaDeliverableProviderPool) as links are toggled, rather than requiring a page reload — a reusable pattern for "pick related entities, then get suggestions" on other create forms (see MediaDeliverableForm.tsx, #61).
- [schedule-items] `src/app/events/schedule-items/{ScheduleItemList.tsx,actions.ts}` is a cross-function read/delete/bulk-edit view over `FunctionSchedule` rows — it has no add/edit form. The actual "add a time slot" UI lives in `src/app/events/functions/ScheduleList.tsx`, rendered on a Function's own detail page (`src/app/events/[id]/functions/[functionId]/page.tsx`). A future issue referencing "schedule item creation" should point there, not at the schedule-items list.
- [mcp/oauth] Dynamic client registration (`/api/oauth/register`) is public-client-only by design: no client secret is ever issued, `token_endpoint_auth_method` is always `"none"`, and PKCE S256 is the sole binding between an authorization request and its redemption. Registration is anonymous because RFC 7591 requires it to be for the Claude connector UI — the security boundary is the user's approval on `/oauth/authorize`, not the client registration.
- [auth] `/login` now honours `?callbackUrl=`, accepting both a relative path (written by `/api/oauth/authorize`) and an absolute same-origin URL (what the NextAuth middleware writes when it gates a page); anything else falls back to `/`. The form moved to `src/app/login/LoginForm.tsx` because `useSearchParams()` needs a Suspense boundary, which would otherwise have swallowed the whole page.
- [packing] `buildPackingItems` gates room/venue/function/presentation context behind `includeDestinations`, loaded via two extra order-level queries rather than widening the item include — keeps the 15s-polling packing list off the parked `packing-polling-cost` concern while the report gets the destination fields it needs (#65).
