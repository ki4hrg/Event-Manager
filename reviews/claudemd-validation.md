# CLAUDE.md.proposed — validation

Two independent checks of `CLAUDE.md.proposed`: a rubric review against four recent commits, and a cover-to-cover ambiguity sweep. Findings are surfaced for a human (or follow-up rewrite pass) to apply — the rubric is not rewritten here.

## Check 1: Agent review test

Four diverse commits were reviewed *using only the proposed CLAUDE.md as the rubric*. For each diff: what the rubric would flag, what it would miss, and whether any miss points to a rule the rubric should grow.

---

### PR/commit 1: `43ff98b` — Keep rooms in the same RoomGroup adjacent when ordering

**Files touched:** new helpers in `src/lib/roomGroups.ts` (`compareRoomsByGroup`, `sortRoomsByGroupThenName`); `BreakoutSlotPanel.tsx` adds an inline `RoomOptions` helper that renders `<optgroup>`s; `events/reports/actions.ts:getRoomScheduleData` switches from Prisma orderBy to JS post-sort; six event-scoped pages updated to pass group-aware sorts.

**Flagged by CLAUDE.md rubric:**
- Nothing substantive. The rubric is silent on sort/comparator helper organization.
- The new code in `events/reports/actions.ts` does not call `requireAuth()`, which the rubric explicitly *requires* of report data actions. ✓ Compliant.
- `BreakoutSlotPanel.tsx` carries `"use client"` and uses local React state — appropriate per the rubric's "Components" section. ✓ Compliant.
- Page imports use `@/...` and `prisma` from `@/lib/prisma`. ✓ Compliant.

**Missed (would be caught by a thoughtful human reviewer):**
1. **Dead field in `RoomBasic`.** `BreakoutSlotPanel.tsx` widens `RoomBasic` to `{ id; name; group?: { id; name; sortOrder } }`, but `id` on the group is never read — only `name` and `sortOrder`. Trim the type, or `RoomGroupRef` from `roomGroups.ts` could be re-exported and reused so both ends stay in sync.
2. **Redundant Prisma `orderBy`.** `getRoomScheduleData` keeps `orderBy: { name: "asc" }` *and* re-sorts in JS by `venue.name` → `compareRoomsByGroup`. The Prisma ordering is load-bearing only as a tie-breaker for stable input — worth a comment or removing if not needed.
3. **`RoomOptions` lives inside `BreakoutSlotPanel.tsx`.** Fine for one consumer, but anywhere else that renders a room `<select>` with groups will duplicate it (or skip the optgroup polish). No rule violation today; flagging as a future-collision risk.
4. **No test for `compareRoomsByGroup` despite it being pure comparator math.** The rubric's "Don't add ad-hoc tests" tells you not to; the same rubric's parenthetical names time-zone math and `lib/conflicts.ts` as the highest-leverage test targets. A comparator with edge cases (missing group → `MAX_SAFE_INTEGER`, equal sortOrders → fall through to group name → fall through to room name) is the same flavor of "math worth testing." The rubric doesn't acknowledge this tension.

**Suggested CLAUDE.md changes:**
- Optional: a one-liner on where comparator/sort helpers live (`src/lib/<domain>.ts` when shared; colocated when single-use).
- Reconcile the "no tests" stance with the "highest-leverage targets" parenthetical. Either commit to no tests, or list narrow exceptions (time-zone math, comparators, conflict detection) where a single small `.test.ts` is welcome.

---

### PR/commit 2: `f868125` — Add Room Schedule report

**Files touched:** new report archetype (`page.tsx`, `ReportFilters.tsx`, `RoomScheduleReport.tsx`, `print/page.tsx`); `getRoomScheduleData` added to `events/reports/actions.ts`; `share/[token]/page.tsx` extended with a `ROOM_SCHEDULE` branch; `ShareLinkFilters` gains `rooms?: string[]`; sidebar nav link.

**Flagged by CLAUDE.md rubric:**
- ✓ `getRoomScheduleData` lives in `src/app/events/reports/actions.ts` and does not call `requireAuth()`.
- ✓ Page and print page both declare `export const dynamic = "force-dynamic"`.
- ✓ `params: Promise<{ id: string }>` and `searchParams: Promise<...>` awaited per the async-params rule.
- ✓ `Promise.all([...])` fan-out for page lookups.
- ✓ `notFound()` on missing event/data — no `not-found.tsx` introduced.
- ✓ `ReportFilters.tsx` is `"use client"` and accepts `basePath?`, `shareButton?`, `hidePrint?`.
- ✓ `RoomScheduleReport.tsx` is the body, consumed by both the authenticated route and `/share/[token]/`.
- ✓ `print/page.tsx` uses `PrintHeader` with `eventName` / `title` / `backHref`.
- ✓ Dual-render: every table renders a `sm:hidden print:hidden` mobile card and a `hidden sm:block print:block` desktop/print table.
- ✓ `ReportNav` rendered as first child; section dividers used (`SectionDivider id="rooms"`); every anchored room card has `scroll-mt-24`.
- ✓ Mobile filter chips collapse behind a "Show / Hide filters" toggle; actions (Share, Print) remain inline.
- ✓ "Print / Save PDF" is an `<a href="${basePath}/print?...">`, not `window.print()`.
- ✓ Uses `reportTh` / `reportTd` / `reportSectionCard` from `src/lib/reportStyles.ts`.
- ⚠ **Anchor convention violation candidate:** breakout entries use `presentation-${slot.presentation.id}-${block.id}`. The rubric says "Per-entity: `${kind}-${id}`" with examples `function-${fn.id}`, `presentation-${presentation.id}`. The compound `presentation-…-…` is not explicitly sanctioned. (See "Suggested changes" below — the rule probably needs to allow this case, since presentations recur in blocks.)
- ⚠ **`sections={[{ id: "top", label: "Top" }]}` is suspect.** The rubric describes `sections` as "top-level anchors (Key Contacts, Schedule, Equipment, Unscheduled) — always visible inline." Passing only `Top` (which `ReportNav` arguably already provides) is either redundant or a misread of the prop's intent. Whether this should be flagged depends on whether `ReportNav` already auto-renders a top link — the rubric doesn't say.

**Missed (would be caught by a thoughtful human reviewer):**
1. **`resolveOptionLabel(item.entry.slot.presentation.type, [])` passes an empty options array.** The function will fall back to the raw enum value — so a breakout's "type" will read as the raw `type` string instead of a human label. The page already fetches `scheduleTypes`; it should fetch and pass *presentation type* options too, or the label will be wrong in production data. The rubric doesn't say anything about "pass the matching options array to `resolveOptionLabel`."
2. **`buildAgendaItems` silently drops entries with no schedule.** `if (!main) continue` — a breakout slot without a scheduled main row vanishes from the report with no surface anywhere. Could be intentional (unscheduled blocks belong elsewhere) but worth verifying. No rubric rule speaks to this.
3. **Filter UI hides itself when `rooms.length === 1`.** Reasonable, but the same diff doesn't hide the "Day" filter when there's exactly one day — inconsistent. No rubric rule, but a thoughtful reviewer would call it out.
4. **`searchParams.toString()` used for the print href captures *all* params**, including future ones the page doesn't yet know about. Today benign; a footgun for future params (e.g. an `expand=` UI-only param leaking into print URLs). Not a rule violation.
5. **No `EmptyState` for the case where a single room has no items** — the per-room `RoomSection` renders "Nothing scheduled for this room." inline, which is fine, but rubric doesn't speak to empty-state shape.

**Suggested CLAUDE.md changes:**
- **Anchor convention:** clarify that when an entity appears in multiple parents (presentation × breakout block), compound IDs of the form `${kind}-${parentId}-${childId}` are permitted; the constraint is "kebab-case, no CSS-unfriendly chars, unique within the page."
- **`ReportNav.sections` semantics:** state whether "Top" is auto-rendered. If yes, an explicit `[{ id: "top", label: "Top" }]` is redundant; say so. If no, document the minimum useful `sections` content.
- Consider adding: "When calling `resolveOptionLabel(value, options)`, pass the matching options array. Passing `[]` is almost always a bug — the function falls back to the raw value and labels won't resolve."

---

### PR/commit 3: `ec385a7` — Redirect breakout blocks to breakout schedule

**Files touched:** `events/[id]/functions/[functionId]/page.tsx` — `redirect("/events/<id>/breakout-schedule")` when `fn.type === "BREAKOUT_BLOCK"`. `events/functions/FunctionList.tsx` — `Link href` flips to the breakout schedule for breakout rows.

**Flagged by CLAUDE.md rubric:**
- ✓ Uses `redirect` from `next/navigation` — the rubric prefers Next primitives.
- ✓ The redirect runs in a server component, no `useRouter`/`router.push` cargo-culting on the client.
- Nothing else triggers — small, surgical change.

**Missed (would be caught by a thoughtful human reviewer):**
1. **The redirect runs *after* `prisma.function.findUnique`.** A bookmark or shared link straight to a breakout-block function detail page triggers a needless query before redirecting. Acceptable for low-traffic admin tool; worth noting. No rubric rule.
2. **Double-redirect chain on create.** Per the rubric's redirect-target rule, creating a Function redirects to its detail page; if that Function is a BREAKOUT_BLOCK it then redirects again to `/breakout-schedule`. Two hops on every breakout-block create. The rubric's redirect-target rule should either accommodate this case or `createFunction` should branch on type.
3. **No equivalent update to "Copy" / "Duplicate".** `Copy` still calls `duplicateFunction` which (per the rubric) "always redirects to the detail view of the new copy." Duplicating a breakout block → detail page → redirect to schedule. Same double-hop issue.
4. **`renderFunction` lost its const-arrow shape** and gained a function-body wrapper just to declare `fnHref` once. Slightly awkward — could compute `fnHref` inline in two places or factor out. Style only.

**Suggested CLAUDE.md changes:**
- Sharpen the "After updating / creating a record, redirect to ..." rule to acknowledge that the destination page can itself redirect, and that double-hop redirects from create/update flows are a smell. Either avoid them at the create site or document that the chain is intentional.

---

### PR/commit 4: `b91e4fc` — Filter functions by missing schedule/rooms

**Files touched:** `events/[id]/functions/page.tsx` adds `schedule` / `room` searchParams; `events/[id]/page.tsx` overview card links to `?schedule=none` / `?room=none`; `FunctionList.tsx` adds two has/missing dropdowns; `FunctionTableView.tsx` adds a stacked has/missing select on the date filter cell and a `(none)` option on the room dropdown.

**Flagged by CLAUDE.md rubric:**
- ✓ Async `searchParams: Promise<{...}>` typed and awaited.
- ✓ `force-dynamic` already on the page (unchanged).
- ⚠ **Status filter null-sentinel rule** is invoked (`__blank__`) and the surrounding patch *adds new* "missing" filters that **don't** use the same sentinel. The list view stores `"none"`, the table view stores `"no"` internally but accepts URL `?schedule=none`, and the table view's room dropdown uses `__none__`. Three different magic strings for the same conceptual "missing" filter. The rubric only says "Never use `null` / `undefined` as a `<select>` value — use the `__blank__` sentinel"; it doesn't extend the rule to URL params or to non-status missing filters, so technically nothing is flagged. In practice this is the kind of drift the rubric exists to prevent.
- The overview card uses `<a href>` for internal navigation; the rubric doesn't mandate `<Link>` but other internal links in the project use it. Not flagged by rubric.

**Missed (would be caught by a thoughtful human reviewer):**
1. **Sentinel proliferation across this single feature: `none` (URL) ↔ `none` (list state) ↔ `no` (table state) ↔ `__none__` (table dropdown option).** No reader can keep this in their head. Pick one — `__blank__` everywhere, or `none` everywhere — and convert.
2. **Filter state never round-trips to the URL.** Both views read `initialSchedule` / `initialRoom` from props but neither pushes back into the URL when the user changes the dropdown. So: (a) refresh resets the user's filter; (b) the share-from-overview link doesn't survive a back-button. The rubric's "Filter state lives in URL search params" rule (in the Reports section) doesn't apply to non-report list views, but the same UX argument applies.
3. **`initialRoom === "yes"` is silently ignored** in `FunctionTableView` — only `"none"` is mapped to `__none__`. If a future overview card adds a "has room" link, the table view will drop it.
4. **The schedule/room filters duplicate logic between `FunctionList` and `FunctionTableView`** — the same has/missing predicate is implemented twice with different state types. No shared helper. Not strictly a rule violation; the rubric's "Reuse the class-string libs" doesn't cover filter predicates.

**Suggested CLAUDE.md changes:**
- Extend the sentinel rule beyond `<select>`: "Use the same sentinel string for absence across URL params, client state, and `<select>` options. Prefer `__blank__` for `<select>` values; if URL params have to be human-readable (`?room=none`), translate at the boundary once and use `__blank__` internally — never invent a third string."
- Add a list-page filter rule: "Filter state on list/table pages lives in URL search params (same reasoning as Reports). Push to `router.replace(url)` on filter change so refresh / back-button / share-link all work."

---

## Check 2: Ambiguity sweep

Each rule (or rule group) was read with one question in mind: could two reasonable engineers interpret this differently? "Clear" rules aren't listed individually — only ambiguous or unverifiable ones.

### Ambiguous

| Rule (where) | Reading 1 | Reading 2 | Suggested rewrite |
|---|---|---|---|
| Archetype A: "renders `<PageWrapper>` + `<PageHeader>` and either an inline `<table>` or a `*ListClient`." | Inline table for trivial lists; lift to `*ListClient` when interactive. | Inline table is fine until it grows; refactor later. | "Inline a `<table>` when the page has no client-side state (sort / select / filter). Lift to a `*ListClient` the moment any one of those is needed." |
| Archetype B: "passes raw Server Actions (or inline `"use server"` wrapper closures) as props" | Raw is fine for top-level entities; wrap for sub-entities. | Always wrap to bind context. | "Pass the raw action when its signature already matches what the client component needs. Wrap with an inline `"use server"` closure when you need to bind an `eventId` or other parent id." |
| "Apply `dark:` variants on every styled element." (Styling) | Every element that renders. | Only elements with color/background/border classes. | "Every element with a `text-`, `bg-`, or `border-` class also gets a `dark:` counterpart. Layout-only classes (`flex`, `gap-2`, `mt-4`) don't need a dark variant." |
| "Import via `@/...` rather than relative paths across feature boundaries." (Pages and routing) | A feature is `src/app/<feature>/`. Sibling imports inside a feature stay relative. | Every cross-file import uses `@/...`. | "Within a single feature directory (e.g. all of `src/app/events/setup-orders/`), relative imports are fine. Across feature boundaries — anything that crosses out of a feature dir — use `@/...`." |
| "Tables with ≤ 2 simple columns may skip the mobile card if they fit naturally at 360 px." (Reports) | If the table doesn't horizontally overflow in your browser, you're good. | Measure with the longest expected row. | "If the longest realistic cell is ≤ ~24 chars and the table has ≤ 2 columns, the desktop table is allowed to stand in for the mobile view. Otherwise dual-render." |
| "Anchor IDs — Per-entity: `${kind}-${id}`" (Reports → Anchor ID conventions) | Single-id form only. | Single-id is the default, compound forms allowed for many-to-many. | "Per-entity: `${kind}-${id}`. When an entity appears in multiple parents within the same report (e.g. a presentation under two breakout blocks), compound IDs are permitted: `${kind}-${parentId}-${childId}`. Constraint: kebab-case, no `:` / `/` / spaces, unique on the page." |
| "Never use `null` or `undefined` as a select option value — use the `__blank__` sentinel instead." (Order list and bulk edit pattern) | Applies only to `<select>` values. | Applies anywhere "absence" needs to be expressed (URL, state, options). | "Use `__blank__` as the sentinel for 'no value' on a `<select>`. If the same filter has a URL representation (`?status=none`), translate at the page boundary — don't invent a third string inside the component." |
| "After a mutation, call `revalidatePath(...)` for affected list + detail routes" (Server Actions) | The two specific paths you mutated. | Every path that could plausibly cache the data. | Add concrete example: "e.g. after `updateSetupOrder(id)`, call `revalidatePath('/events/<eventId>/setup-orders')` and `revalidatePath('/events/<eventId>/setup-orders/<id>')`. Don't revalidate the event overview unless its derived counts change." |

### Unverifiable

| Rule | Why unverifiable | Suggested rewrite or removal |
|---|---|---|
| "Single-tenant. No organization / workspace model exists in `prisma/schema.prisma`. Don't introduce multi-org access controls." (Architecture invariants) | Future-state rule; nothing in a diff says "this introduces multi-org." | Keep — it's a *don't* with a clear concrete trigger ("if you find yourself adding an `organizationId` column or a `getOrganization()` call, stop"). Worth adding the concrete trigger. |
| "Modular structure for future extensibility" — removed already per the changelog. | n/a | n/a |
| "Don't add ad-hoc tests or `console.error` calls for 'logging'." (Tests and observability) | Conflicts with the parenthetical naming high-value test targets. | "No test suite ships. Don't introduce one ad hoc. The narrow exceptions worth a tiny `.test.ts` next to the file are: (1) `src/lib/conflicts.ts` (overlap detection), (2) `src/app/events/breakout-schedule/actions.ts` (time-zone math), (3) pure comparators in `src/lib/*` if they grow edge cases. Anywhere else, hold off." |

### Structural notes

- **Duplicated rules across sections.**
  - Report `requireAuth()` carve-out appears in Architecture invariants (#4), Server Actions, and Security and validation. Three statements of the same exception. Pick one canonical source and cross-reference.
  - Print-button two-layer rule appears in Mobile and print, Reports → Print/PDF conventions, and Anti-patterns. Three statements. Same suggestion.
  - "Use `notFound()`, don't add `error.tsx`" appears in Pages and routing and in Anti-patterns. Acceptable repetition (anti-pattern table is meant to mirror).
- **Long sections that could split into `docs/`.** Reports is by far the longest single section (≈ 80 lines). It's load-bearing and worth keeping inline for now, but a future move to `docs/reports.md` (with a one-paragraph stub in CLAUDE.md pointing there) would be reasonable once a second very-long section appears.
- **Rules that lack a paired correct version.** All entries in the anti-patterns table have a Do column. ✓
- **Rules without examples.**
  - "Cross-request preferences go in the `UserSetting` table" — could add "e.g. agenda room visibility/order, table density."
  - "Tables with ≤ 2 simple columns may skip the mobile card" — covered above; needs a concrete example or measurement.

---

## Synthesis

### Must-fix before shipping
1. **Sentinel rule is incomplete.** Commit 4 shipped four different strings (`none`, `no`, `__none__`, `__blank__`) for "missing" within one feature, and the rubric as written would not have caught any of it. Extend the sentinel rule to cover URL params and non-status filters, or explicitly bound it to `<select>` and add a separate rule for filter-state consistency.
2. **Anchor-ID rule rejects valid compound IDs.** The Room Schedule report needs `presentation-${presId}-${blockId}` because a presentation appears in multiple breakout blocks. The rubric's `${kind}-${id}` formulation reads as "one id, period." Widen to allow compound IDs with a uniqueness constraint.
3. **"Tables with ≤ 2 simple columns may skip mobile card if they fit naturally at 360 px"** is the only Reports rule a reviewer cannot apply without picking a heuristic out of the air. Give a concrete trigger.

### Should-fix soon
- Consolidate the three statements of the report `requireAuth()` carve-out into one canonical place; the others cross-reference.
- Consolidate the print-button two-layer rule similarly.
- Clarify Archetype A (inline `<table>` vs `*ListClient`) and Archetype B (raw action vs `"use server"` wrapper) — both currently leave the choice unstated.
- Define what "across feature boundaries" means for the `@/...` import rule.
- Note that filter state on list/table pages (not just reports) should round-trip via URL search params.
- Clarify whether `ReportNav` auto-renders a "Top" entry; if so, an explicit `sections={[{ id: "top", label: "Top" }]}` (as in Room Schedule) is redundant and should be flagged.

### Notes for next iteration
- Revisit the "no tests" stance once a third pure helper (comparators / time-zone math / conflict detection) grows edge cases. The current rubric prohibits exactly the kind of tiny `.test.ts` that would catch a regression in those files.
- If the Reports section grows further, extract it to `docs/reports.md` with a one-paragraph stub in CLAUDE.md.
- Consider one general "consistency over correctness" meta-rule: when the same concept (sentinel string, redirect target, action signature) is expressed in more than one place, the rule is "match the existing usage." Several Check 1 misses boil down to that.
- After applying the must-fix items, dry-run the rubric against one more commit of moderate size (e.g. `61ea428` or `09099ee`) before declaring it done.
