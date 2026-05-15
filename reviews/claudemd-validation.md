# CLAUDE.md.proposed — validation (second pass)

This is a fresh pass against the current `CLAUDE.md.proposed`, after the must-fix and should-fix items from the first pass were applied (see `reviews/claudemd-changelog.md`). Goals: (a) verify the applied rules actually catch the diffs they were meant to catch, (b) test against commits the first pass didn't review, and (c) surface ambiguities and rubric-vs-reality mismatches not previously flagged.

## Check 1: Agent review test

Five commits reviewed using only `CLAUDE.md.proposed` as the rubric. Commits 1–4 weren't reviewed in the prior pass; commit 5 is a re-test of the diff that motivated MF-1 and SF-6, to confirm the new rules now catch it.

The headline finding is in commit 1 but applies to every action file: **the `requireAuth()` self-protection rule the rubric calls an "architecture invariant" is not the convention the codebase actually follows.** Detail below; full audit in the synthesis.

---

### PR/commit 1: `86042e3` — M:N relation: AVOrder/SetupOrder ↔ Function and Presentation

**Files touched:** `prisma/schema.prisma` (four new junction models — `AVOrderFunction`, `AVOrderPresentation`, `SetupOrderFunction`, `SetupOrderPresentation`); new backfill script `scripts/migrate-orders-to-junctions.ts`; rewrites of `av-orders/actions.ts`, `setup-orders/actions.ts`, four detail pages, three list/panel components; new shared `src/components/LinkedItemsPanel.tsx` replacing `AVOrderLinkPanel`; report data action shape changes for `vendor-handoff` and `equipment-responsibility`.

**Flagged by CLAUDE.md rubric:**
- ✓ `prisma` singleton everywhere in app code; the migration script is in `scripts/` and uses `new PrismaClient()` per the documented carve-out (Architecture invariants → No repository / DAL).
- ✓ Junction tables mirror the existing `PrintOrderFunction` shape (`@@unique([xId, yId])`, `@@index([yId])`) — replicating an established pattern matches the project's modular structure preference.
- ✓ Server actions call `revalidatePath(...)` for both list and detail routes after each mutation (Server Actions → revalidation).
- ✓ Detail pages (`events/[id]/av-orders/[avOrderId]/page.tsx`, `events/[id]/setup-orders/[setupOrderId]/page.tsx`, `events/[id]/functions/[functionId]/page.tsx`) wrap remote Server Actions in inline `"use server"` arrow closures that bind `eventId` / sub-id — matches Archetype C verbatim.
- ✓ `LinkedItemsPanel` lives in `src/components/` because it is now used in five places across av-orders, setup-orders, functions, presentations, and event detail — meets the "reused across two or more features" bar.
- ✓ The new derived list/detail shapes (`functions: r.functionLinks.map(l => l.function)`) are picked up by callers via `Awaited<ReturnType<typeof getX>>` aliases, consistent with the data-layer convention.
- ⚠ **Rubric-vs-reality mismatch (severe).** Architecture invariants → Auth: "Every Server Action also self-protects with `await requireAuth()` (or `await requireAdmin()`) as its first line — with one carve-out for report data actions." `src/app/events/av-orders/actions.ts` adds/edits ~10 exported server actions in this commit (`linkAVOrderToFunction`, `unlinkAVOrderFromFunction`, `linkAVOrderToPresentation`, `unlinkAVOrderFromPresentation`, the four wrapper variants, `getAvailableAVOrdersForFunction`, `getAvailableAVOrdersForPresentation`) — **none of them call `requireAuth()`**. Same in `src/app/events/setup-orders/actions.ts`. By the rubric's letter, this commit is a wholesale violation. See the structural finding below — this is not unique to this commit; it's the project-wide reality.

**Missed (would be caught by a thoughtful human reviewer):**
1. **Dormant FKs are still readable.** `Function.avOrderId`, `Function.setupOrderId`, `AVOrder.presentationId`, `SetupOrder.presentationId` remain on the schema as "dormant" columns for one cycle. The commit removes every *write* but a future engineer reading `fn.avOrderId` would still get a value — stale relative to the new junctions. The rubric has no rule about "transitional schema columns" or schema deprecation.
2. **`createAVOrder` / `createSetupOrder` lose a defensive check.** The old code passed `presentationId` directly into `prisma.aVOrder.create({ data: { presentationId } })`, which would fail if the presentation already had an AVOrder (1:1 unique). The new code creates a junction row unconditionally — but the `availableFunctions` query in `new/page.tsx` switched from `where: { eventId, avOrderId: null }` to `where: { eventId }`, so the picker now shows already-linked functions. Behaviorally correct under M:N, but the picker no longer signals "this is fresh"; a thoughtful reviewer would call out the lost affordance and either trust the upsert or filter by `NOT { functionLinks: { some: ... } }` like the detail page does.
3. **Output shape carries both the raw join and the derived array.** `getAVOrder` returns an object with *both* `functionLinks` (junction rows) and `functions` (mapped) — callers must remember to use the latter. No rule covers this, but `Omit<...>` or an explicit return type would prevent a future "fn.functionLinks[0].function.name" foot-gun.
4. **`getAvailableAVOrdersForFunction(eventId, functionId?)` — the second arg is optional, defaulting to "show every AV order".** No caller passes it as `undefined` in this commit, but the optional-second-arg shape invites a future bug where the function context is forgotten and every order appears. Tightening to a required argument (the detail page always has one) would be safer.
5. **The migration script `scripts/migrate-orders-to-junctions.ts` does one upsert per row in a loop**, not `createMany` with `skipDuplicates`. Fine on the current data scale but worth a comment, and the rubric's `scripts/` carve-out doesn't suggest any quality bar for one-off migrations.
6. **`@@index([functionId])` on `AVOrderFunction`** but no index on `avOrderId` (only the composite unique covers it). Queries filtering by `avOrderId` use the unique-prefix; queries filtering by `functionId` use the explicit index. Symmetric and intentional, but the rubric has no rule about index choices.

**Suggested CLAUDE.md changes:**
- **Must-fix:** reconcile the "every Server Action self-protects" rule with the actual codebase. Either downgrade the rule to "admin-gated actions self-protect; others rely on middleware" (descriptive — see the audit in the synthesis), or commit to a follow-up retrofit and mark the rule as aspirational.
- Optional: add a brief note on transitional schema columns ("when a model field is being removed, leave it on the schema for one release and stop reading/writing it everywhere; drop in the next").

---

### PR/commit 2: `4914519` — Add Event Profile report

**Files touched:** new report archetype — `page.tsx`, `ReportFilters.tsx`, `EventProfileReport.tsx` (700 lines), `print/page.tsx`, `days.ts`; `events/reports/actions.ts` gains `getEventProfileData` (~166 lines); `share/[token]/page.tsx` adds an `EVENT_PROFILE` branch and the print share route mirrors it; `shareLinks.ts` adds the new report type; `EventSidebar.tsx` adds the nav link.

**Flagged by CLAUDE.md rubric:**
- ✓ `export const dynamic = "force-dynamic"` on both `page.tsx` and `print/page.tsx`.
- ✓ Async `params: Promise<{ id: string }>` and `searchParams: Promise<{ days?: string; sections?: string }>` awaited.
- ✓ `Promise.all([...])` fan-out for `getEvent` + `getEventProfileData` + two `getOptions` calls.
- ✓ `notFound()` on missing event or data — no `not-found.tsx` introduced.
- ✓ `getEventProfileData` lives in `src/app/events/reports/actions.ts` and does **not** call `requireAuth()` (deliberate, per the report-action carve-out).
- ✓ `EventProfileReport.tsx` is the body component consumed by both `events/[id]/reports/event-profile/` and the `EVENT_PROFILE` share branch — single source of truth.
- ✓ `print/page.tsx` uses `PrintHeader` with `eventName` / `title` / `backHref`.
- ✓ Dual-render: `KeyContactsSection`, `BreakoutGroupCard` (time × room grid), and `PrintOrdersTable` each render a `sm:hidden print:hidden` mobile card view and a `hidden sm:block print:block` desktop/print table. Catering and Summary are non-tabular and don't need the dual layout.
- ✓ `ReportNav sections={navSections} itemGroups={itemGroups}` rendered as the first child. `navSections` is conditional on which sections have data — no `{ id: "top", label: "Top" }` entry (matches the SF-7 clarification).
- ✓ `SectionDivider id="..."` for each region; every anchored card has `scroll-mt-24`.
- ✓ Per-entity anchors: `function-${fn.id}`, `breakout-group-${group.id}`, `catering-${order.id}` — all `${kind}-${id}` form, kebab-case, no `:` / `/`.
- ✓ Uses `reportTh`, `reportTd`, `reportSectionCard` from `src/lib/reportStyles.ts`.
- ✓ Filter state (`days`, `sections`) lives in URL search params; `ReportFilters` pushes with `router.push` (but see Synthesis → rubric-vs-reality on `router.push` vs `router.replace`).
- ✓ `hidePrint` / `basePath` props accepted by `ReportFilters` for the share branch (Reports → Filter bar conventions).

**Missed (would be caught by a thoughtful human reviewer):**
1. **`dangerouslySetInnerHTML={{ __html: section.menuContent }}` (CateringCard, EventProfileReport.tsx:466).** `menuContent` is TipTap output and lands unsanitized in the report — including in the unauthenticated share view. Likely safe today (the editor controls writes) but the rubric is silent on raw-HTML rendering and has no rule that would have surfaced this. Worth at least a comment, ideally a sanitizer at the boundary.
2. **`functionMatchesDays(schedules, dayKeys, timezone)` returns `false` when `schedules.length === 0`.** Any unscheduled catering order vanishes when a `?days=` filter is set, even if the catering's parent function is unrelated to the day filter. Probably intended, but worth a test or a comment — the rubric has no rule for "filter behavior at empty boundary".
3. **`parseListParam(daysParam)` does no validation.** `?days=2026-99-99,banana` passes straight to `dayKeys.has(...)` and silently filters everything out. The `sections` param IS validated against the `PROFILE_SECTIONS` set; the `days` param isn't. Asymmetric defense.
4. **`itemGroups` includes Functions, Breakout groups, Catering — but not Print Orders.** A user wanting to jump to a specific print order can't from the nav. Minor UX inconsistency, no rule.
5. **`PrintOrdersTable` still uses singular `o.presentation` (1:1 FK)** while AV/Setup orders are now M:N. PrintOrder hasn't been migrated. Cross-cuts with commit 1 — the rubric documents PrintOrder as the M:N reference but the actual model is mixed (PrintOrderFunction is M:N but PrintOrder.presentation is still 1:1). The rubric should either correct itself or flag the asymmetry.
6. **`navSections.push({ id: "summary", label: "Summary" })` is always pushed unconditionally**, while every other section's push is guarded by `active.has(...)`. If the filter selects only `?sections=catering`, the nav still shows "Summary". Reasonable default but inconsistent with the guards on other entries.

**Suggested CLAUDE.md changes:**
- Add: "Raw HTML output (`dangerouslySetInnerHTML`) is allowed only for editor content from `MenuEditor` / `TipTapEditor`; everywhere else, render as text. Mark each call site with a one-line comment naming the editor source."
- Add to "Pages and routing": "Validate URL-list params against an allowed set (see `PROFILE_SECTIONS` filter in `event-profile/page.tsx:18-21`). Don't pass un-validated list params straight into `Set.has` lookups — silently empty results look like a backend bug."

---

### PR/commit 3: `ff85297` — Cascade CustomOption label renames to referencing rows

**Files touched:** `src/app/settings/actions.ts` — `updateOption` now wraps the update in a transaction and, when the label changes, propagates the rename via `propagateLabelRename(tx, category, oldLabel, newLabel)`. Covers 13 categories including the `String[] Contact.roles` field via `tx.$executeRaw\`UPDATE "Contact" SET roles = array_replace(...)\``.

**Flagged by CLAUDE.md rubric:**
- ✓ `await requireAdmin()` at the top of `updateOption` (admin segment, so this matches the rubric's admin-gated rule). One of the few action files that actually does what the rubric says.
- ✓ `prisma` singleton; transaction via `prisma.$transaction(async (tx) => ...)`.
- ✓ `revalidatePath("/settings")` at end.
- ✓ Empty strings normalized with `|| null` for `color` and `group`.
- ✓ Imports `import type { Prisma } from "@prisma/client"` for the transaction client type — `@prisma/client` domain types, consistent with Data Layer rules.
- ⚠ **`revalidatePath` only covers `/settings`.** The rubric says "for affected list + detail routes". Renaming a function-type label affects every page that displays a function type — `/events/[id]/functions`, function detail pages, every report. With `force-dynamic` everywhere, the next request will re-fetch, so the staleness window is bounded. Not strictly a violation but the rule's "affected list + detail" is ambiguous when a single rename can cascade across the entire app.

**Missed (would be caught by a thoughtful human reviewer):**
1. **`prisma.customOption.findUnique(...)` runs OUTSIDE the transaction.** Between read and update, a concurrent admin could rename the same option; the cascade then rewrites the wrong "old label" string. Single-admin tool today, low probability, but the rubric has nothing on transaction boundaries.
2. **`switch (category)` has no `default:` / exhaustive check.** If a new value is added to `OptionCategory` but the cascade switch isn't updated, the rename silently doesn't propagate. A `default: const _exhaustive: never = category` would catch this at compile time — a one-line fix the rubric should mandate for `switch` statements over discriminated unions.
3. **`existing.category as OptionCategory`** — cast from string to union. If a DB row carries a value outside the union (drift from migrations), the switch falls through silently. Throwing on unknown would surface the drift.
4. **`Contact.roles` uses `tx.$executeRaw\`UPDATE "Contact" SET roles = array_replace(roles, ${oldLabel}, ${newLabel}) WHERE ${oldLabel} = ANY(roles)\``.** Prisma parameterizes the values, so this is injection-safe — but the rubric has no rule about raw SQL, mass-update guardrails, or when to drop to `$executeRaw`. The decision to use raw SQL for one of 13 categories is buried in a comment; a future engineer adding category 14 might miss that arrays need this treatment.
5. **No revalidation of any page outside `/settings`.** Per the rubric's letter, "affected list + detail routes" should include every page that surfaces the renamed label. With `force-dynamic` this is moot in practice; with caching it would matter.

**Suggested CLAUDE.md changes:**
- Tighten the `revalidatePath` rule: name what counts as "affected" (typically the entity's list + detail). Acknowledge cross-cutting renames as a special case where `force-dynamic` is doing the work and exhaustive revalidation isn't expected.
- Add a generic rule: "Exhaust `switch` over a TypeScript union with `default: const _: never = value` so a future union extension fails to compile." Two switches in the codebase would benefit (`propagateLabelRename`, `share/[token]/page.tsx` reportType branch).

---

### PR/commit 4: `352c784` — Breadcrumb consistency, presentations bulk edit, vendor handoff nav + picker fix

**Files touched:** Function detail breadcrumb gains "Functions" link; "Function List" → "Functions" rename. `PresentationList.tsx` rewritten to match the order-list pattern (view toggle, sortable columns, multi-select, bulk edit). New `deletePresentations` / `bulkUpdatePresentations` server actions. `ReportNav` gains `sections` + `items` props (legacy `links` still works). `searchAssignedEventVendors` extended to include venue + system vendors.

**Flagged by CLAUDE.md rubric:**
- ✓ `PresentationList` rewrite mirrors the documented Order List pattern — `useState<Set<string>>` for selection, `showBulkEdit` toggle, status / substatus / track / type panel, `EDIT_STATUS_OPTIONS`, `getSubstatusOptions` filtered by status group, `__blank__` sentinel for the status filter, `router.refresh()` after bulk apply. ✓ Matches every bullet in "Order list and bulk edit pattern".
- ✓ `deletePresentations` and `bulkUpdatePresentations` (`presentations/actions.ts:215-235`) use `prisma.x.updateMany`/`deleteMany` with `eventId` scoping — defense against id-spoofing across events.
- ✓ `revalidatePath` called for the list route after each.
- ✓ `ReportNav` (`src/components/ReportNav.tsx`) now accepts `sections` + `items` props; the legacy `links` prop is honored. `VendorHandoffReport` migrates to the new prop shape.
- ⚠ `bulkUpdatePresentations` doesn't `redirect(...)`. The rubric's Server Actions section says "After a mutation, call `revalidatePath(...)` … then `redirect(...)`. … Return shape: either `void` (after `redirect`) or the raw Prisma model." Bulk-update doesn't redirect — it returns void and the client `router.refresh()`es. The rule has no slot for "void without redirect," which is the documented Order List bulk-edit pattern. Internal inconsistency.
- ⚠ **Same auth violation as Commit 1.** None of the new presentation actions or modified vendor actions call `requireAuth()`.

**Missed (would be caught by a thoughtful human reviewer):**
1. **`bulkUpdatePresentations` accepts `trackId: string | null` but `type: string` (non-nullable).** Unsetting a track is "pass null"; unsetting a type would need empty-string. Asymmetric nullability is a minor footgun.
2. **`searchAssignedEventVendors` sorts AFTER the `take: 20` Prisma cap and then appends venue + system vendors.** The final list can be up to 22 items, and the alphabetical sort happens client-side after the append. Off-by-two against the documented limit, harmless in practice.
3. **`deletePresentations` doesn't revalidate any presentation detail pages.** If a user has a detail page open in another tab and a bulk-delete just removed it, the next request will 404. With `force-dynamic` this is fine; worth a one-line confirmation that "detail revalidation" is implicit when the list is the only entry point.
4. **The `ReportNav` legacy `links` prop is preserved but no caller in this commit uses it.** Worth a TODO date or a "remove in N weeks" hint — silent deprecations rot.
5. **No breadcrumb rule in CLAUDE.md.** This commit normalizes "Function List" → "Functions" to match Presentations/Vendors/Venues labelling, and adds the missing intermediate link. A reviewer can only call this consistent if there's a stated convention for breadcrumb labels and the parents-included rule.

**Suggested CLAUDE.md changes:**
- Carve out "Bulk update / bulk delete" from the Server Actions return-shape rule: "Bulk operations called from a client list (selection-bar pattern) return `void` without `redirect`; the client calls `router.refresh()`. See Order list and bulk edit pattern."
- Add a short Breadcrumbs convention: "Every entity detail page renders a breadcrumb of (1) the top-level section, (2) the parent entity, (3) the immediate parent list, (4) the entity's own name. Use the entity's plural list label (`Functions`, `Presentations`, `Setup Orders`) not the page title (`Function List`)."

---

### PR/commit 5: `b91e4fc` — Filter functions by missing schedule/rooms (RE-TEST of the prior validation's must-fix)

The prior validation flagged this commit for sentinel proliferation (`none` / `no` / `__none__` / `__blank__`) and for filter state living only in `useState`. MF-1 (Absence sentinels across the stack) and SF-6 (Filter state in URL search params) were added to the rubric. This is the re-test.

**Flagged by CLAUDE.md rubric (with the new rules in place):**
- ✓ **MF-1 (Absence sentinels across the stack) CATCHES this.** The rule explicitly names "mixing `none` / `no` / `__none__` / `__blank__` inside one feature" as the anti-pattern; the diff ships all four strings inside the same feature directory (`src/app/events/functions/`). True positive — the rule now does what it was added to do.
- ✓ **SF-6 (Filter state on list/table pages lives in URL search params) CATCHES this.** Both `FunctionList` and `FunctionTableView` read `initialSchedule` / `initialRoom` from props but never push back to the URL on change. The rule's "Don't park filter state in `useState` alone" reads directly on this code.
- ✓ Async `searchParams: Promise<{...}>` typed and awaited.
- ⚠ **SF-6's prescribed `router.replace(url)` doesn't match codebase reality.** Every existing filter component (`event-profile/ReportFilters.tsx:43`, `equipment-responsibility/ReportFilters.tsx:36`, `room-schedule/ReportFilters.tsx:72`, `vendor-handoff/ReportFilters.tsx:27`) uses `router.push`. The rubric's "push to `router.replace(url)`" was lifted verbatim from the prior validation's suggested rewrite but doesn't reflect what the team writes. See Synthesis → must-fix.

**Missed (would be caught by a thoughtful human reviewer):**
1. **`initialRoom === "yes"` is silently ignored** by `FunctionTableView` — only `"none"` translates to `__none__`. A future overview-card link of `?room=yes` would do nothing.
2. **The has/missing filter logic is duplicated** between `FunctionList` and `FunctionTableView` with different state shapes. A shared `applyHasMissingFilter(value, count)` predicate would prevent drift. Minor maintainability.
3. **`<a href={...}>` for internal navigation on the overview card** (`events/[id]/page.tsx:127, 137`). Most internal links use `<Link>`; this is a soft inconsistency. The rubric doesn't mandate either.

**Suggested CLAUDE.md changes:**
- **Must-fix:** change `router.replace(url)` to `router.push(\`${basePath}?${params}\`)` in SF-6 — match the codebase. Or, if `replace` is intentionally preferred (cleaner back-button), name that justification and retrofit the four existing report filters.

---

## Check 2: Ambiguity sweep (current rubric)

Many items the first pass surfaced have been resolved. What follows is what remains and what slipped in with the SF-6 / SF-7 additions.

### Ambiguous

| Rule (where) | Reading 1 | Reading 2 | Suggested rewrite |
|---|---|---|---|
| `router.replace(url)` on filter change (Pages and routing, line 82) | Use `router.replace` so the URL stays in sync without polluting history. | Use whatever the codebase already does (every existing filter uses `router.push`). | "Push the new URL with `router.push(\`${basePath}?${params.toString()}\`)` on filter change. Use `router.replace` only when you want the URL change to NOT add a history entry (Toast clearing `?success=`)." |
| "Apply `dark:` variants on every styled element" (Styling, line 118) | Every element rendered. | Every element that carries a color/background/border class. | "Every element with a `text-`, `bg-`, or `border-` class also gets a `dark:` counterpart. Layout-only classes (`flex`, `gap-2`, `mt-4`) don't need a dark variant." (Flagged in pass 1; not applied.) |
| "After a mutation, call `revalidatePath(...)` for affected list + detail routes" (Server Actions, line 90) | The exact two paths you mutated. | Any path that surfaces the data, even transitively (settings options → 13 other entities). | Concrete examples + a "force-dynamic does the rest" caveat: "Revalidate the entity's own list + detail. Cross-cutting renames (settings labels propagating to dozens of consumers) rely on `force-dynamic` on the affected pages — don't try to enumerate every consumer." |
| Server Actions return shape: "either `void` (after `redirect`) or the raw Prisma model" (line 93) | Two shapes only. | Three: `void` after redirect (create/update), `void` without redirect (bulk-edit + delete from list), raw model (read). | "Three return shapes: (a) `void` after `redirect()` for create/update; (b) `void` without redirect for bulk operations called from a client list (the client calls `router.refresh()` — see Order list and bulk edit pattern); (c) the raw Prisma model for read actions consumed by server components." |
| Redirect-target classification (line 91) | The lists are exhaustive. | The lists are illustrative; a new entity must be classified by judgment. | Add the decision rule: "Classify by whether the entity needs further configuration after create. If yes → detail. If no → list. The lists above are illustrative as of 2026-05; add new entities to the matching column." |
| "Read inputs with `formData.get(...) as string`. Normalize empty strings to `null` via `|| null`" (line 89) | Always cast to string, always `\|\| null`. | Only when the Prisma column is nullable; numeric / boolean / array fields need different handling. | "Strings: `(formData.get('x') as string) \|\| null`. Numbers: `Number(formData.get('x'))` with explicit `NaN` guard. Booleans: `formData.get('x') === 'on'`. Arrays: `formData.getAll('x') as string[]`. Don't blanket-apply `\|\| null` to numeric fields ('0' becomes null)." |
| `src/components/` "reserved for components reused across two or more features" (line 74) | Move a component there only after the second use site appears. | Place there speculatively if reuse is anticipated. | "Promote to `src/components/` only when the second use site lands. Until then, colocate. The promotion PR moves the file and updates the one existing caller in the same commit." |

### Unverifiable / load-bearing assertions that don't match the codebase

| Rule | Why unverifiable | Suggested rewrite |
|---|---|---|
| "Every Server Action also self-protects with `await requireAuth()`" (Architecture invariants line 29, Server Actions line 88, Security and validation line 139) | Five files (~37 actions) follow this; sixteen files (~272 actions) don't. The rule asserts an invariant the codebase doesn't honor. | See Synthesis → must-fix. Either downgrade to "admin-gated actions self-protect; everything else relies on middleware" (matches reality), or explicitly tag the rule "aspirational, retrofit in progress" and open a tracking issue. |
| "`src/app/`. 76 page.tsx, 22 actions.ts, 3 route.ts" (Project structure line 64) | Exact counts at write time; will rot. | Drop the counts, or pin them with "as of 2026-05" and accept they'll drift. |
| "Don't add ad-hoc tests or `console.error` calls for 'logging'" + the parenthetical naming time-zone math and conflict detection as "highest-leverage targets" (line 134) | A blanket "no tests" with a parenthetical exception that doesn't say what would license one. | Pick one: either the absolute "no tests" or "no test suite by default; small targeted `.test.ts` files next to `src/lib/conflicts.ts` and `src/app/events/breakout-schedule/actions.ts` are welcome if they cover a fix you just shipped." (Same recommendation as pass 1; not applied.) |

### Structural notes

- **Repetition of the auth invariant in three places.** Architecture invariants (line 29), Server Actions (line 88), Security and validation (line 139). SF-1 already consolidated the *carve-out* (report actions) to one place but the invariant itself is still asserted three times — and is wrong all three times. Pick one canonical statement.
- **The 1:1 PrintOrder.presentation FK contradicts the documented M:N "AVOrder/SetupOrder ↔ Function / Presentation" pattern.** `PrintOrder` is M:N for functions (via `PrintOrderFunction`) but still 1:1 for presentations. The "Order list and bulk edit pattern" section (line 274-275) acknowledges the split ("for 1:1 FK (CateringOrder), bulk-replace the FK directly. Presentation link: same 1:1 FK pattern (AVOrder, PrintOrder via FK).") but the line is now wrong about AVOrder, which became M:N in `86042e3`.
- **Vendor model types example (line 226) was updated to four values** including `PRINT_ORDER`. ✓ Consistent.
- **"Order list and bulk edit pattern" line 275** references the obsolete shape — needs updating after `86042e3`/`8ec90b7` dropped the legacy 1:1 FKs.
- **Long sections.** Reports is still ~80 lines (the longest single section). Acceptable for now; flag for `docs/reports.md` extraction if a second long section appears.

---

## Synthesis

### Must-fix before shipping

1. **The `requireAuth()` self-protection rule does not describe the codebase.** Asserted as an Architecture Invariant in three places, the rule is violated by 16 of 22 action files (~272 of 277 exported actions). The five files that follow it are all admin-segment / share-link / account / agenda — i.e., specific sensitive subsystems. The rest rely on middleware. Either:
   - **(a) Downgrade the rule to match reality.** Rewrite as: "Admin-gated actions self-protect with `requireAdmin()`. Actions that mutate user-specific data (account, share-links, agenda) self-protect with `requireAuth()`. General event/CRUD actions rely on the middleware gate documented above." Remove "every Server Action" from Architecture invariants.
   - **(b) Mark the rule aspirational and own the retrofit.** Add a banner "Retrofit in progress — see issue #N" and accept that every PR touching an action file from now on adds `await requireAuth()` to every exported function it touches.
   - Either way, the three statements need to agree.

2. **`router.replace(url)` in SF-6 (line 82) doesn't match the codebase.** All four existing report filter components use `router.push`. Change the rule to "`router.push`" (the realistic choice; preserves back-button behavior; consistent with existing code) — or commit to flipping all four existing filters to `replace`. The rubric should not specify a pattern the codebase contradicts in four places.

3. **PrintOrder ↔ Presentation is 1:1 but the "Order list and bulk edit pattern" section still describes the AVOrder linkage as "same 1:1 FK pattern".** Update line 275 to reflect that AVOrder/SetupOrder are now M:N (per `86042e3`); only CateringOrder and PrintOrder retain 1:1 presentation links.

### Should-fix soon

- **Carve out bulk-update return shape.** The current Server Actions return-shape rule has a gap (`void` after redirect OR raw model) that the Order list bulk-edit pattern fills with a third shape (`void` without redirect, client calls `router.refresh()`). State the three shapes explicitly in the Server Actions section so the two sections agree.
- **Sharpen `revalidatePath` "affected" language** so cross-cutting renames (`updateOption` in `ff85297`) aren't read as missing-revalidation bugs. Acknowledge that `force-dynamic` covers transitive consumers.
- **Exhaustive `switch` rule.** Add "use `default: const _: never = value` on `switch` statements over discriminated unions so adding a union member fails the build." Would have caught a class of bugs in `propagateLabelRename` and the `reportType` branch in `share/[token]/page.tsx`.
- **`dark:` variant scope.** Limit to elements carrying a color-bearing class (the rewrite was suggested in pass 1, never applied).
- **Validate URL list params** before passing them into `Set.has` lookups (the `days` param in Event Profile is the cautionary tale).
- **FormData input handling for non-string fields.** The `formData.get(...) as string` + `\|\| null` recipe doesn't extend to numbers (turns "0" into null) or booleans. Document the three shapes.
- **Breadcrumb convention.** `352c784` was a coordination commit normalizing labels; a one-paragraph rule would prevent label drift.
- **Raw HTML rendering.** `dangerouslySetInnerHTML` for editor content is unavoidable but should be marked with a one-line comment naming the editor source, and the rubric should say so.

### Notes for next iteration

- **PrintOrder is the next M:N candidate.** Once it migrates, the rubric's "1:1 FK pattern (AVOrder, PrintOrder via FK)" line collapses to just "CateringOrder."
- **The `console.log` ban (line 134) is currently absolute.** The migration script `scripts/migrate-orders-to-junctions.ts` uses `console.log` heavily and the rubric's `scripts/` carve-out doesn't address logging. Either explicitly exempt `scripts/`, or move the rule out of Architecture and into Conventions where the carve-out reads naturally.
- **`@/...` import rule (SF-5)** is now well-defined for crossing OUT of a feature dir. Worth adding the inverse: "Going IN from `src/lib/` or `src/components/` to a feature dir is never correct — those modules should not import from features." (Implicit today; no violations found in the survey.)
- **The "no tests" rule still wars with the parenthetical highest-leverage targets.** Same recommendation as pass 1: pick one. If tests are forbidden in principle, drop the parenthetical; if they're allowed for `lib/conflicts.ts` and `breakout-schedule/actions.ts`, say so without hedging.
- **Five commits and three days of validation later, the rubric reads more cleanly section-by-section than it did at draft, and most of the must-fix items now are reality-mismatches (auth, `router.push`/`replace`, PrintOrder linkage) rather than language ambiguities.** The next pass should be about reconciling rubric with codebase, not further sharpening wording.
