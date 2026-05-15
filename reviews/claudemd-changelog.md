## CLAUDE.md.proposed — changelog from validation pass

Each entry references a finding in `reviews/claudemd-validation.md` (Synthesis → Must-fix / Should-fix). Where the validation provided a suggested rewrite, that wording was used directly; where it asked for consolidation, the canonical source was picked and the duplicates were collapsed to references.

---

### MF-1 · Sentinel rule extension (Synthesis → Must-fix #1)

**What changed:** added a new sub-section "Absence sentinels across the stack" immediately after the existing "Status filter — null sentinel" block in the Order list and bulk edit section. The original sentinel rule (scoped to `<select>` values) is preserved; the new sub-section extends it to URL params, internal state, and non-status filters — citing the four-string proliferation Commit `b91e4fc` shipped.

**Before:**
```
Empty string ("") means "All / no filter". Never use null or undefined as a select option value — use the __blank__ sentinel instead.
```

**After:**
```
Empty string ("") means "All / no filter". Never use null or undefined as a select option value — use the __blank__ sentinel instead.

### Absence sentinels across the stack
Use the same sentinel string for "no value" across <select> options, internal component state, and URL params. Prefer __blank__ for <select> values; if a URL param has to be human-readable (?room=none, ?schedule=none), translate at the page boundary once and use __blank__ internally. Never invent a third string (e.g. mixing none / no / __none__ / __blank__ inside one feature) — pick one and convert at the edge.
```

---

### MF-2 · Anchor-ID rule accepts compound IDs (Synthesis → Must-fix #2)

**What changed:** added a third bullet in Reports → Anchor ID conventions allowing `${kind}-${parentId}-${childId}` when an entity appears under multiple parents. Cited the real example in the codebase (`RoomScheduleReport.tsx`).

**Before:**
```
- Top-level sections: kebab-case (top, summary, key-contacts, function-schedule, equipment-summary, details, unscheduled).
- Per-entity: ${kind}-${id} (function-${fn.id}, presentation-${presentation.id}, party-${partyId}).
- Never use raw composite keys containing : or other CSS-unfriendly characters as HTML IDs — compute a clean anchor id separately from the React key.
```

**After:**
```
- Top-level sections: kebab-case (top, summary, key-contacts, function-schedule, equipment-summary, details, unscheduled).
- Per-entity: ${kind}-${id} (function-${fn.id}, presentation-${presentation.id}, party-${partyId}).
- When an entity appears under multiple parents within the same report (e.g. a presentation rendered once per breakout block in RoomScheduleReport.tsx), compound IDs are permitted: ${kind}-${parentId}-${childId}. The constraint is uniqueness on the page — kebab-case, no : / / / spaces.
- Never use raw composite keys containing : or other CSS-unfriendly characters as HTML IDs — compute a clean anchor id separately from the React key.
```

---

### MF-3 · Concrete trigger for "skip mobile card" (Synthesis → Must-fix #3)

**What changed:** replaced the "fit naturally at 360 px" heuristic with a measurable threshold (≤ 2 columns AND longest realistic cell ≤ ~24 chars), and named the exclusions explicitly.

**Before:**
```
Tables with ≤ 2 simple columns (e.g. presentation time/room) may skip the mobile card if they fit naturally at 360 px. A table-fixed table without a mobile card variant is wrong on mobile — overflow-x-auto does nothing because the table never exceeds the viewport width.
```

**After:**
```
A 2-column table may skip the mobile card only when both columns fit in 360 px — concretely: ≤ 2 columns and the longest realistic cell is ≤ ~24 characters (e.g. a HH:MM – HH:MM time paired with a short room name). Anything wider — three columns, long item names, role/provider stacks — must dual-render. A table-fixed table without a mobile card variant is wrong on mobile: overflow-x-auto does nothing because the table never exceeds the viewport width.
```

---

### SF-1 · Consolidate `requireAuth()` report carve-out (Synthesis → Should-fix)

**What changed:** picked "Server Actions" as the canonical statement of the exception. The other two mentions (Architecture invariants, Security and validation) now reference it instead of repeating it.

**Before — Architecture invariants:**
```
- Auth is defense-in-depth. ... Every Server Action also self-protects with await requireAuth() (or await requireAdmin() for admin-only actions) as its first line. See "Security and validation".
```
**After:**
```
- Auth is defense-in-depth. ... Every Server Action also self-protects with await requireAuth() (or await requireAdmin()) as its first line — with one carve-out for report data actions, documented in "Server Actions" below. See "Security and validation".
```

**Before — Security and validation:**
```
- Server Actions self-protect. Every exported action starts with await requireAuth() or await requireAdmin(). ... Exception: report data actions in src/app/events/reports/actions.ts are deliberately auth-free so /share/[token]/ can reuse them.
```
**After:**
```
- Server Actions self-protect. Every exported action starts with await requireAuth() or await requireAdmin(). ... The report-actions carve-out is stated once in "Server Actions" above.
```

The Server Actions section (canonical) was left as-is — it already states the full exception.

---

### SF-2 · Consolidate print-button two-layer rule (Synthesis → Should-fix)

**What changed:** picked "Mobile and print" as the canonical statement of the two-layer rule. The Reports → Print/PDF conventions bullet now points at it. The Anti-patterns row was left intact (anti-patterns table is allowed to mirror per the validation's structural notes).

**Before — Reports → Print/PDF conventions:**
```
- "Print / Save PDF" button in ReportFilters is an <a href="${basePath}/print?...">, never window.print().
```
**After:**
```
- The "Print / Save PDF" button follows the two-layer rule documented under "Mobile and print" — link on the interactive page, window.print() only on the dedicated /print route.
```

---

### SF-3 · Archetype A — inline `<table>` vs `*ListClient` trigger

**What changed:** replaced "either an inline `<table>` or a `*ListClient`" with a concrete trigger from the validation's suggested rewrite.

**Before:**
```
Server component, export const dynamic = "force-dynamic", awaits get<Entity>() from sibling actions.ts, renders <PageWrapper> + <PageHeader> and either an inline <table> or a *ListClient. New action is a link to /<entity>/new. Example: src/app/events/page.tsx.
```

**After:**
```
Server component, export const dynamic = "force-dynamic", awaits get<Entity>() from sibling actions.ts, renders <PageWrapper> + <PageHeader>. Inline the <table> directly in the server page when there is no client-side state (sort / select / filter / bulk edit). Lift to a *ListClient ("use client") the moment any one of those is needed. New action is a link to /<entity>/new. Example: src/app/events/page.tsx.
```

---

### SF-4 · Archetype B — raw action vs `"use server"` wrapper trigger

**What changed:** replaced the parenthetical "(or inline `"use server"` wrapper closures)" with an explicit branching rule.

**Before:**
```
Server page fetches lookup data, then passes raw Server Actions (or inline "use server" wrapper closures) as props to a client *Form. ...
```

**After:**
```
Server page fetches lookup data, then passes Server Actions as props to a client *Form. Pass the raw imported action when its signature already matches what the client component expects. Wrap it in an inline "use server" arrow closure when you need to bind context the client shouldn't have to supply (e.g. an eventId from params, or a sub-entity id) — see Archetype C. ...
```

---

### SF-5 · `@/...` import rule — define "feature boundary"

**What changed:** added an explicit definition of "feature" and named which siblings count as "across boundaries."

**Before:**
```
- Import via @/... (@/* → ./src/*) rather than relative paths across feature boundaries.
```

**After:**
```
- Import via @/... (@/* → ./src/*) across feature boundaries. A "feature" is a directory under src/app/<feature>/ (e.g. all of src/app/events/setup-orders/); sibling imports inside one feature may stay relative. Anything crossing out of a feature dir — into src/lib/, src/components/, another src/app/<other-feature>/, or src/types/ — uses @/....
```

---

### SF-6 · Filter state on list/table pages lives in URL search params

**What changed:** added a new bullet to "Pages and routing" extending the existing Reports-section filter-URL rule to list/table pages.

**Before:** (no equivalent bullet existed)

**After (new bullet added between the `notFound()` rule and the `@/...` rule):**
```
- Filter state on list and table pages lives in URL search params (same reasoning as Reports — bookmarkable, share-friendly, survives refresh and back-button). On filter change, push to router.replace(url) so the URL stays in sync. Don't park filter state in useState alone.
```

---

### SF-7 · `ReportNav` does not auto-render a "Top" entry

**What changed:** verified `src/components/ReportNav.tsx` against the validation question — the nav element gets `id="top"` but no "Top" link is auto-added to the sections row. Documented that an explicit `{ id: "top", label: "Top" }` in `sections` is redundant because every `SectionDivider` already provides a `↑ Top` link.

**Before:**
```
- Render <ReportNav sections={[...]} itemGroups={[...]} /> ... as the first child of the report body. It's sticky top-2 z-10 with id="top", so every section divider can link back to it.
- sections are top-level anchors (Key Contacts, Schedule, Equipment, Unscheduled) — always visible inline.
```

**After:**
```
- Render <ReportNav sections={[...]} itemGroups={[...]} /> ... as the first child of the report body. It's sticky top-2 z-10 with id="top", so every section divider's ↑ Top link targets it automatically.
- sections are the top-level anchors users jump to (e.g. Key Contacts, Schedule, Equipment, Unscheduled) — always visible inline. ReportNav does not auto-render a "Top" entry; an explicit { id: "top", label: "Top" } in sections is redundant (the back-to-top affordance already lives on every SectionDivider) and should be omitted unless the report has no other section links.
```

---

## Items intentionally not applied

Items elsewhere in the validation doc (Check 1 "Suggested CLAUDE.md changes", Check 2 ambiguous-rule rewrites that don't appear in the Must-fix / Should-fix synthesis, "Notes for next iteration") were not applied — the prompt scopes this pass to the Synthesis section. They remain on record in `claudemd-validation.md` for a future pass.

No findings were skipped to `claudemd-open-questions.md`; every Must-fix / Should-fix item had a clear path (either a suggested rewrite, or "pick one canonical source" where the canonical pick was determined by which section already carried the fullest statement of the rule).

---

# Second validation pass (after re-run against five commits)

The second validation pass (`reviews/claudemd-validation.md`, "second pass") surfaced three new must-fix items and eight should-fix items. One must-fix is a team-intent decision and was parked in `reviews/claudemd-open-questions.md` (OQ-1). Two must-fix and all eight should-fix items were applied here.

---

### MF2-2 · `router.replace(url)` → `router.push(...)` (Synthesis → Must-fix #2)

**Source finding:** All four existing report filter components use `router.push`; the SF-6 rule from pass 1 prescribed `router.replace`, which the codebase contradicts.

**Before (Pages and routing):**
```
- Filter state on list and table pages lives in URL search params (same reasoning as Reports — bookmarkable, share-friendly, survives refresh and back-button). On filter change, push to router.replace(url) so the URL stays in sync. Don't park filter state in useState alone.
```

**After:**
```
- Filter state on list and table pages lives in URL search params (same reasoning as Reports — bookmarkable, share-friendly, survives refresh and back-button). On filter change, call router.push(`${basePath}?${params.toString()}`) so the URL stays in sync (see src/app/events/[id]/reports/event-profile/ReportFilters.tsx:36-44). Reserve router.replace for URL changes that should NOT add a history entry (e.g. Toast clearing ?success= in src/components/Toast.tsx:21). Don't park filter state in useState alone.
```

---

### MF2-3 · Correct AVOrder linkage cardinality (Synthesis → Must-fix #3)

**Source finding:** After `86042e3` the AVOrder ↔ Function and AVOrder ↔ Presentation relations are M:N (via `AVOrderFunction` / `AVOrderPresentation`). The "Order list and bulk edit pattern" section still described both as 1:1 FK.

**Before (Order list and bulk edit pattern → Bulk edit panel):**
```
- Function link: getFunctionOptions(eventId) — for many:many junctions (PrintOrder, SetupOrder), bulk-add is safe (skip existing). For 1:1 FK (CateringOrder), bulk-replace the FK directly.
- Presentation link: same 1:1 FK pattern (AVOrder, PrintOrder via FK).
```

**After:**
```
- Function link: getFunctionOptions(eventId) — for many:many junctions (AVOrder, SetupOrder, PrintOrder via *OrderFunction), bulk-add is safe (skip existing on the unique constraint). For 1:1 FK (CateringOrder via CateringOrder.functionId), bulk-replace the FK directly.
- Presentation link: many:many for AVOrder and SetupOrder (via AVOrderPresentation / SetupOrderPresentation) — bulk-add with skip-existing. 1:1 FK for PrintOrder (PrintOrder.presentationId) — bulk-replace the FK directly. CateringOrder doesn't link to presentations.
```

---

### SF2-A · Bulk-update return shape (third void shape)

**Source finding:** Server Actions return-shape rule had two slots (`void` after redirect, raw model) but the Order list bulk-edit pattern uses a third (`void` without redirect, client `router.refresh()`).

**Before (Server Actions):**
```
- Return shape: either void (after redirect) or the raw Prisma model. Do not introduce a { success, error } envelope. Do not use useActionState.
```

**After:**
```
- Return shape: three forms. (a) void after redirect() for create/update from a <form>. (b) void without redirect for bulk operations called from a client list (the client calls router.refresh() — see "Order list and bulk edit pattern" and bulkUpdatePresentations in src/app/events/presentations/actions.ts:226-242). (c) The raw Prisma model for read actions consumed by server components. Do not introduce a { success, error } envelope. Do not use useActionState.
```

---

### SF2-B · Sharpen `revalidatePath` "affected" language

**Source finding:** "affected list + detail routes" reads as ambiguous for cross-cutting renames like `updateOption` in `ff85297` that propagate across dozens of consumers.

**Before (Server Actions):**
```
- After a mutation, call revalidatePath(...) for affected list + detail routes, then redirect(...). Do not use revalidateTag — the project doesn't tag fetches.
```

**After:**
```
- After a mutation, call revalidatePath(...) for the entity's own list + detail routes, then redirect(...). Example: updateSetupOrder(id, eventId, ...) revalidates /events/${eventId}/setup-orders (list) and /events/${eventId}/setup-orders/${id} (detail). Cross-cutting changes (e.g. a settings label rename in updateOption propagating across dozens of consumers) rely on force-dynamic on the affected pages — don't try to enumerate every consumer. Do not use revalidateTag — the project doesn't tag fetches.
```

---

### SF2-C · Exhaustive switch over discriminated unions

**Source finding:** `propagateLabelRename` in `settings/actions.ts` and the `reportType` switch in `share/[token]/page.tsx` both lack exhaustive defaults; adding a union member silently fails.

**Before (Data layer):**
```
(no equivalent bullet existed)
```

**After (appended after the UserSetting bullet):**
```
- When discriminating on a TypeScript union or Prisma enum, close the chain with an exhaustiveness check: default: { const _exhaustive: never = value; throw new Error(`Unhandled: ${value}`); } on a switch, or const _exhaustive: never = link.reportType; throw new Error(...); after the last if branch. Adding a member to the union then fails the build instead of silently falling through. Applies to the OptionCategory cascade switch in src/app/settings/actions.ts and the ShareLink.reportType if-chain in src/app/share/[token]/page.tsx:40-215.
```

---

### SF2-D · `dark:` variant scope — color-bearing classes only

**Source finding:** "Apply `dark:` variants on every styled element" reads as "every element"; the codebase actually only puts dark variants on color-bearing classes.

**Before (Styling):**
```
- Apply dark: variants on every styled element. Print formatting uses print: utility variants plus the rules in src/app/globals.css:35-44.
```

**After:**
```
- Apply dark: variants on every element with a color-bearing class (text-, bg-, border-, divide-, ring-, placeholder:). Layout-only classes (flex, gap-2, mt-4, w-full) don't need a dark counterpart. Print formatting uses print: utility variants plus the rules in src/app/globals.css:35-44.
```

---

### SF2-E · Validate URL list params before `Set.has` lookups

**Source finding:** The `?days=banana` example in Event Profile silently empties the result. The codebase has the right pattern but no rule pointed at it.

**Before:** (no equivalent bullet existed)

**After (new bullet inserted in Pages and routing, after the filter-URL rule):**
```
- Validate URL list params against an allowed set before passing them into a Set.has lookup or downstream filter. See the selectedSections.filter((s) => validSectionValues.has(s as ProfileSection)) pattern in src/app/events/[id]/reports/event-profile/page.tsx:28-31. Un-validated list params (?days=banana) silently empty the result and look like a backend bug.
```

---

### SF2-F · FormData input handling — per-type recipes

**Source finding:** The `as string` + `|| null` recipe doesn't extend to numbers (turns "0" into null), booleans, or arrays. The codebase has stable per-type patterns but the rubric only documented strings.

**Before (Server Actions):**
```
- Read inputs with formData.get("field") as string. Normalize empty strings to null via || null before writing to Prisma.
```

**After:**
```
- Read inputs by type. Strings: (formData.get("field") as string) || null before writing to Prisma. Numbers: parseInt(formData.get("field") as string) for required ints, or formData.get("field") ? parseInt(formData.get("field") as string) : null for nullable ints (see src/app/events/setup-orders/actions.ts:254-256) — don't blanket-apply || null to numerics, it turns the string "0" into null. Booleans: formData.get("field") === "true" (see src/app/vendors/actions.ts:131). Multi-value fields: formData.getAll("field") as string[] (see src/app/settings/actions.ts:68).
```

---

### SF2-G · Breadcrumb convention

**Source finding:** `352c784` was a coordination commit normalizing breadcrumb labels and adding a missing intermediate link; the rubric had no breadcrumb rule.

**Before:** (no equivalent bullet existed)

**After (new bullet inserted in Pages and routing, after the URL-list-validation rule):**
```
- Breadcrumbs. Every entity detail page renders <Breadcrumbs items={[...]} /> with this shape: (1) top-level section ({ label: "Events", href: "/events" }), (2) parent entity ({ label: event.name, href: `/events/${eventId}` }), (3) immediate parent list ({ label: "Presentations", href: `/events/${eventId}/presentations` }), (4) the entity's own name with no href. See src/app/events/[id]/presentations/[presentationId]/page.tsx:288-293. Use the plural list label (Functions, Presentations, Setup Orders) — not the page title (Function List).
```

---

### SF2-H · `dangerouslySetInnerHTML` allowed only for editor content

**Source finding:** Four `dangerouslySetInnerHTML` call sites all render `RichTextEditor` output (tiptap), but the rubric has no rule on raw HTML.

**Before:** (no equivalent bullet existed)

**After (new bullet appended to Components, after the `"use client"` bullet):**
```
- dangerouslySetInnerHTML is allowed only for HTML produced by RichTextEditor (src/components/RichTextEditor.tsx, tiptap-backed) — currently the four menuContent call sites in catering reports and MenuSectionTable. Render everything else as text. When you add a new call site, drop a one-line comment naming the editor source so a reviewer can see the chain at a glance.
```

---

## Items parked in claudemd-open-questions.md

- **OQ-1 (MF2-1 in this pass): `requireAuth()` invariant vs. codebase reality.** The validation's rewrite branches on team intent — descriptively downgrade ("middleware-only is fine") or aspirationally retrofit (~272 actions across 16 files). Both viable; pick one.
- **OQ-2: tests stance.** The parenthetical "highest-leverage test targets" contradicts the "no tests" rule; pass-2 (like pass-1) declined to pick. Same wording either way once decided.

## Items intentionally not applied (second pass)

- Check 1 "Suggested CLAUDE.md changes" that didn't roll up into Synthesis (e.g. "Note on transitional schema columns" from commit 1) — out of scope per the prompt.
- Check 2 Structural notes that are observations rather than findings (long Reports section flagged for future `docs/` extraction, repetition of the auth invariant which depends on OQ-1).
- "Notes for next iteration" — by definition deferred.
