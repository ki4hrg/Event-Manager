# CLAUDE.md.proposed — validation (third pass)

Fresh validation against the current `CLAUDE.md.proposed` after pass 2's must-fix and should-fix items were applied (`reviews/claudemd/changelog.md` second-pass section). Five new commits reviewed from `main` — different files than passes 1 and 2 so we exercise the rubric on fresh diffs.

The two prior passes are preserved in git history (`116845d`, `dae79c6`) for reference.

---

## Check 1: Agent review test

Five commits, picked to cover (a) a tiny lib utility, (b) a cross-cutting helper applied across many call sites, (c) a new report archetype, (d) a UI rework spanning multiple existing screens, and (e) a new schema-touching order type.

A repeated finding shows up across most diffs: the strict `requireAuth()` invariant (OQ-1, resolved "keep strict — retrofit later") is still violated by 100 % of the new exported actions in these commits. Per the resolution that's expected, but it's worth saying out loud — the rule is currently catching nothing it hasn't already been told to ignore.

---

### PR/commit 1: `5b8dc1e` — Format phone numbers as (999) 999-9999; show contact name during inline edit

**Files touched:** new `src/lib/format-phone.ts` (8 lines); five display call sites updated (`contacts/page.tsx`, `vendor-handoff/VendorHandoffReport.tsx`, `catering-orders/CateringOrderDetails.tsx`, `functions/FunctionDetails.tsx`, `functions/ContactList.tsx`); two `ContactList` components (functions, venues) gain a contact-name + organization line above the role field in the inline edit form.

**Flagged by CLAUDE.md rubric:**
- ✓ New helper sits in `src/lib/` — matches the "Utilities, helpers, …, class-string libs" project structure bullet.
- ✓ Named export (`export function formatPhone(...)`).
- ✓ Cross-feature consumers all import via `@/lib/format-phone` (Pages and routing → `@/...` for crossing out of a feature dir).
- ✓ `contacts/page.tsx` retains `export const dynamic = "force-dynamic"`; no archetype regression.
- ✓ No `requireAuth()` to flag — this is a pure helper.
- ✓ Dark-mode classes on the new "contact name + organization" lines (`text-gray-900 dark:text-white`, `text-gray-500 dark:text-gray-400`) — Styling → `dark:` on color-bearing classes.

**Missed (would be caught by a thoughtful human reviewer):**
1. **File naming inconsistency.** `format-phone.ts` is kebab-case but every other lib helper that does similar work is camelCase: `breakoutLabels.ts`, `agendaUtils.ts`, `optionUtils.ts`, `userSettings.ts`, `shareLinks.ts`, `reportStyles.ts`, `roomGroups.ts`, `scheduleUtils.ts`. The next pass-1 commit (`65f3c6b`) actually adds `breakoutLabels.ts` for the same kind of helper — different convention same week. The rubric has **no rule** about filename casing in `src/lib/`.
2. **`formatPhone(null)` returns `""`, not `"—"`.** Every call site has to remember to do `phone ? formatPhone(phone) : "—"` instead of `formatPhone(phone) || "—"`. Some call sites do (vendor handoff, catering order, function details), one doesn't (`contacts/page.tsx:78` uses `formatPhone(contact.phone) || "—"` which works because of the empty-string return). A helper that returns `""` vs. one that returns the em-dash placeholder is a one-line choice with no documented preference.
3. **No handling for international or already-formatted numbers.** A 10-digit pure US number formats; everything else passes through unchanged. Fine today, fragile later. The rubric is silent on this category of helper (single-tenant, single-region app — probably correct silence).
4. **The "contact name + organization" header is duplicated** between `events/functions/ContactList.tsx:328-335` and `venues/ContactList.tsx:324-331` — same eight-line JSX block, copied. The rubric's `src/components/` rule ("reserved for components reused across two or more features") technically applies the second time the block appears; the diff is itself the second use site.

**Suggested CLAUDE.md changes:**
- Add a filename-casing rule under "Project structure": "Helpers under `src/lib/` use camelCase (`formatPhone.ts`, `breakoutLabels.ts`), not kebab-case." Sharper than today's silence.
- No rule change for #4 — the copy-paste is small enough to be a judgment call, and the rubric correctly leaves "promote on second use" to the engineer.

---

### PR/commit 2: `65f3c6b` — Prepend breakout group name to session references

**Files touched:** new `src/lib/breakoutLabels.ts` (7 lines, exports `formatBreakoutSessionName`); applied at 12 call sites — print pages (`agenda/print`, `breakout-schedule/print`, `functions/print`, `functions/table-print`), interactive views (`BreakoutGrid`, `BreakoutSlotPanel`, `FunctionList`, `FunctionTableView`), reports (`RoomScheduleReport`, `VendorHandoffReport`), and report data loaders (`events/reports/actions.ts` gains `breakoutGroup: { select: { name: true } }` in two function-include blocks).

**Flagged by CLAUDE.md rubric:**
- ✓ **"Breakout session labels" section CATCHES this perfectly.** Every bullet in that section is exercised: the helper is added, call sites adopt it, Prisma includes gain `breakoutGroup: { select: { name: true } }`, and filtering/sorting in `FunctionTableView.tsx:128, 182-185` uses the formatted name. The rubric's "Apply it to filtering/sorting too" line reads directly on this code. Strong true positive — this rule was added in commit `3d47f4e` and the next commit (`65f3c6b`) was the first to exercise it across the codebase.
- ✓ The `delete confirm` dialog (`BreakoutGrid.tsx:222`) also uses the formatted name, matching the helper's "anywhere a name is rendered" stance.
- ✓ `src/lib/breakoutLabels.ts` is camelCase — consistent with most lib helpers and inconsistent with `format-phone.ts` from commit 1 (see Suggestion #1 on the prior commit).
- ✓ Report data action `getRoomScheduleData` (Reports → File layout) gains the include — auth-free reader, correctly placed in `src/app/events/reports/actions.ts`.

**Missed (would be caught by a thoughtful human reviewer):**
1. **`BreakoutSlotPanel.tsx:273` qualifies edit-mode session options with `currentGroup?.name`, but `BreakoutSlotPanel.tsx:381` uses `addGroup?.name`.** Two variables, presumably two different breakout groups in scope; reasonable but worth a comment.
2. **`functions/FunctionList.tsx:178-180` deletes the previous "`{fn.breakoutGroup && (<span ...>{fn.breakoutGroup.name}</span>)}`" subtle-line** — visually correct (the group is now in the title), but the diff doesn't add a comment explaining that the formatted name now embeds what used to be a separate label. A future reader of the list-row JSX will not know why the subtle group-name span disappeared.
3. **Filtering and sorting now operate on the prepended form**, which means a user typing "Session 1" alone — without the group prefix — will get zero matches even if the bare name "Session 1" exists in the data. The rubric's "users see and search the prepended form" line endorses this, but worth a UX note.

**Suggested CLAUDE.md changes:**
- None mandatory. The Breakout session labels section is one of the rubric's strongest sections — concrete helper, named call sites, both the display and the filter/sort dimension covered.

---

### PR/commit 3: `f868125` — Add Room Schedule report

**Files touched:** new report archetype — `room-schedule/page.tsx`, `ReportFilters.tsx`, `RoomScheduleReport.tsx` (352 lines), `print/page.tsx`; `events/reports/actions.ts` gains `getRoomScheduleData` (~105 lines), centralizes `getDateKeyInTimezone` into `@/lib/agendaUtils`; `share/[token]/page.tsx` adds the `ROOM_SCHEDULE` branch; `share/[token]/print/page.tsx` mirrors it; `EventSidebar.tsx` adds the nav link; `shareLinks.ts` extends `ShareLinkFilters` with `rooms: string[]`.

**Flagged by CLAUDE.md rubric:**
- ✓ Three required files (`page.tsx`, `ReportFilters.tsx`, `[Name]Report.tsx`) plus `print/` — matches Reports → File layout.
- ✓ `getRoomScheduleData` lives in `src/app/events/reports/actions.ts` and does **not** call `requireAuth()` — the rubric's auth-free carve-out is honored.
- ✓ `force-dynamic` on both `page.tsx` and `print/page.tsx`.
- ✓ Async `params: Promise<{ id: string }>` / `searchParams: Promise<{ days?: string; rooms?: string }>` awaited.
- ✓ `Promise.all([...])` fan-out for `getEvent` + `getRoomScheduleData` + two `getOptions`.
- ✓ `notFound()` on missing event or data.
- ✓ `RoomScheduleReport.tsx` is the body component reused by both `events/[id]/reports/room-schedule/` and the `ROOM_SCHEDULE` share branch (`share/[token]/page.tsx:259`, `share/[token]/print/page.tsx:11`).
- ✓ `print/page.tsx` uses `PrintHeader` with `eventName`/`title`/`backHref`.
- ✓ Dual-render: `RoomDayTable` (`RoomScheduleReport.tsx:170-254`) renders both `sm:hidden print:hidden` card and `hidden sm:block print:block` table.
- ✓ `ReportFilters` accepts `basePath?`, `hidePrint?`, `shareButton?`; the share branch passes `basePath={`/share/${token}`}` and `hidePrint`.
- ✓ Filter chips collapse behind "Show filters" toggle on mobile (`ReportFilters.tsx:138-159`); actions remain visible.
- ✓ Filter state lives in URL search params; `pushWith(...)` uses `router.push(\`${basePath}?${params.toString()}\`)` (`ReportFilters.tsx:50`) — matches the MF2-2 rewrite.
- ✓ `SectionDivider id="rooms"` and `scroll-mt-24` on each room card.
- ✓ Class strings from `src/lib/reportStyles.ts` (`th`, `td`, `sectionCard`).
- ✓ Breadcrumb shape: `Events → ${event.name} → Room Schedule` — matches SF2-G ((1) section, (2) parent entity, (3) own title).
- ⚠ **`navSections = [{ id: "top", label: "Top" }]` (`RoomScheduleReport.tsx:341`) is exactly the redundant pattern SF-7 told us to omit.** Quote from the rubric: *"`ReportNav` does not auto-render a "Top" entry; an explicit `{ id: "top", label: "Top" }` in `sections` is redundant (the back-to-top affordance already lives on every `SectionDivider`) and should be omitted unless the report has no other section links."* This report has `itemGroups` populated (the Rooms group), so it does have other section links, and the "Top" entry is precisely the redundant case the rule named. **True positive — the rule catches a real violation in a recent commit.**
- ⚠ **Compound anchor ID order is `presentation-${presentation.id}-${block.id}` (`RoomScheduleReport.tsx:200`)** — the entity id comes first, parent id second. The MF-2 rule wrote the convention as `${kind}-${parentId}-${childId}`. Either order satisfies the uniqueness constraint and is kebab-case-clean, but the rubric and the codebase now disagree on which way around to write it. Borderline; flag the rule wording rather than the code.

**Missed (would be caught by a thoughtful human reviewer):**
1. **`getRoomScheduleData` runs `prisma.room.findMany` with `OR: [{ functions: { some: { function: { eventId } } } }, { presentationSlots: { some: { function: { eventId } } } }]`** — a room is only returned if it has been used. A brand-new event with rooms preconfigured but no functions assigned yet will show no rooms at all. Probably intended (this is a schedule report, not a room inventory report), but worth a one-line comment in the loader. No rule.
2. **`pickMainRow` (`RoomScheduleReport.tsx:42-58`) picks the longest schedule row as "main" only after filtering for `isPublic` rows.** If a function has zero public rows, it falls back to "longest of any row." That's the right call, but a future engineer reading `pool[0]` as the seed for `reduce` won't know why the public/non-public split exists. One-line comment.
3. **The `print/page.tsx` rebuilds the query string from `daysParam`/`roomsParam` strings rather than reusing the parsed `selectedDays`/`selectedRoomIds`** — minor, since `daysParam` is the raw URL value, but if a downstream change ever sanitizes `selectedDays` (e.g., drops invalid days) the back-href would drift from what the print page actually rendered. The Event Profile print page has the same pattern, so it's consistent at least.
4. **`getRoomScheduleData` returns `data.rooms` (all rooms with activity in the event) before the roomId filter is applied**, but `data.roomBuckets` is filtered. The page then uses `data.rooms` to build the chip list (`page.tsx:48-51`) — so the chip list shows every available room, even ones currently hidden by the filter. Correct behavior, easy to misread.
5. **No `EmptyState` if a user selects a single room with no functions.** The report shows the room card and "Nothing scheduled for this room." — correct, but the empty-list case (zero rooms after filter) returns the page-level `EmptyState`. Two empty-state patterns under one report; a reader has to discover both.
6. **No `revalidatePath` rule applies** because no mutation happens here — the report is pure read. Worth noting that the rubric's revalidation rules apply only to mutations; a reader-only addition like this doesn't trip them.

**Suggested CLAUDE.md changes:**
- **Should-fix:** Either remove the SF-7 redundant-Top admonition (codebase reality is that authors keep writing the "Top" entry, and the SectionDivider already provides the link — it's a no-op redundancy, not a bug) or pair it with a one-line example showing the canonical "Top-less" shape so a future author writing a new report has the right thing to copy-paste.
- **Should-fix:** Reconcile compound-anchor-ID order. Two reasonable conventions exist (entity-first vs. parent-first); the rubric picked one and the new code picked the other. Pick the codebase's order and update the rule, or vice-versa.

---

### PR/commit 4: `b74a362` — Surface room groups in display and selection UIs

**Files touched:** new `src/lib/roomGroups.ts` (37 lines, exports `groupRoomsByGroup<TRoom>(...)` and `UNGROUPED_LABEL`); `FunctionForm` RoomSelector switches from uncontrolled `defaultChecked` to controlled `checked` + `onChange` with hidden inputs to preserve selection during text filtering; `SetupOrderForm` and `BreakoutGrid` GroupRoomManager get `<optgroup>` per `RoomGroup`; `Agenda` RoomPanel gets per-group visibility toggles and a small per-row group label; `RoomScheduleReport` adds per-group jump-to anchors in `ReportNav` and group-level filter chip toggles; `share/[token]/page.tsx` passes `roomGroups` to the share branch.

**Flagged by CLAUDE.md rubric:**
- ✓ `groupRoomsByGroup` is generic (`<TRoom extends { id; name; groupId?; group? }>`) and lives in `src/lib/` — matches the "Utilities, helpers" entry and "single-tenant" / "lightweight" architecture stance. Reused across five features (functions, setup-orders, breakout-schedule, agenda, room-schedule report), so the "two or more features" promotion bar is clearly met.
- ✓ Camel-case filename (`roomGroups.ts`), consistent with most lib helpers.
- ✓ Tailwind `dark:` classes carry through every new piece of color-bearing UI (group-label spans, button states with `state === "all"` / `"some"` / `"none"`).
- ✓ `AgendaGrid` change adds a `groupLabel` prop to `SortableRoomRow` and uses it for the inline label — drilling props rather than reaching for state. Matches the "No global client state" invariant.
- ✓ No new API routes, no new auth bypass, no `revalidatePath` regression (this is a UI-shape commit, not a mutation commit).
- ⚠ **`FunctionForm` RoomSelector now uses controlled inputs with `checked` + `onChange` (`FunctionForm.tsx:154-160`)** plus a parallel `<input type="hidden" name="roomIds" />` for rooms that are selected-but-filtered-out. Before this commit, the form was a near-pure uncontrolled `<form action={serverAction}>` with `defaultChecked`. The new code path is correct, but the rubric's Forms section ("Use native `<form action={serverAction}>`. The submit button uses `useFormStatus()`…") doesn't flag controlled vs. uncontrolled. A reviewer trying to apply the rubric here has no guidance: is "lift the checkboxes into state so we can preserve selection across filtering" allowed? **The rubric should say yes explicitly, or carve out the case.** Today the rule reads like "uncontrolled by default" but the codebase reality is "controlled when interaction requires it" (e.g., this commit, every order list with bulk-select).

**Missed (would be caught by a thoughtful human reviewer):**
1. **`checked` state initializes from `selectedRoomIds` once** (`useState<Set<string>>(() => new Set(selectedRoomIds))`); a subsequent parent re-render with different `selectedRoomIds` won't update local state. Probably fine because the form unmounts on navigation, but a future bug magnet. A `useEffect(() => setChecked(new Set(selectedRoomIds)), [selectedRoomIds])` would protect against it — or, more idiomatically, derive the prop into a `key={...}` reset.
2. **Hidden-input strategy depends on iteration order being stable.** The form posts every `name="roomIds"` input — visible checkboxes for matched rooms, hidden inputs for selected-but-filtered. If a user filters, unchecks a visible row, then clears the filter, the row state is consistent. Less obvious: a user filters, the filter empties the visible list, the user submits. The hidden inputs carry the unselected-with-filter state correctly. The implementation is solid; the comment-free intent is hard to read.
3. **`groupRoomsByGroup` sorts ungrouped rooms with `sortOrder: Number.MAX_SAFE_INTEGER`** so they always land last. Reasonable, but means an explicit RoomGroup with `sortOrder: 999999` would equal-tie the ungrouped bucket and fall back to `localeCompare` on labels — "Ungrouped" vs. that hypothetical group name. Theoretical, no real-world consequence.
4. **`RoomScheduleReport` `ReportNav` per-group anchors** weren't in this commit's stat but the diff for `RoomScheduleReport.tsx` adds them (`+96 lines`). I didn't read that hunk in detail; the prior commit's report-level findings still apply (specifically the redundant `{ id: "top", label: "Top" }`, which would presumably remain unless this commit removed it).

**Suggested CLAUDE.md changes:**
- **Should-fix:** Expand the Forms section to mention controlled-input checkboxes. Suggested wording: *"Default to uncontrolled (`defaultChecked` / `defaultValue`). Lift to controlled state (`checked` + `onChange`) only when the form needs to preserve selection across UI transitions like filtering, bulk-select, or undo. Use a hidden input strategy to keep selected-but-hidden values in the submitted payload (see `FunctionForm.tsx` RoomSelector for the pattern)."*

---

### PR/commit 5: `d79fbee` — Add PrintOrder feature with PrintItem children and designer/printer tracking

**Files touched:** schema additions — `PrintOrder`, `PrintItem`, `PrintOrderFunction` (M:N junction), `PrintOrderVendor`; new feature dir `src/app/events/print-orders/` (server actions, `PrintOrderForm`, `PrintItemPanel`, `PrintOrderLinkPanel`, `PrintOrderTabs`); event-scoped pages under `src/app/events/[id]/print-orders/`; seed additions (`print_distribution` CustomOption category, `PRINT_ORDER` ModelType, `print_order` WorkflowEntityType, `printOrder` EntityType); navigation entry in `EventTabs`; `vendors/actions.ts` gains `PRINT_ORDER` to its `ModelType` union and to `MODEL_TYPES`.

**Flagged by CLAUDE.md rubric:**
- ✓ Schema follows existing M:N junction shape (`PrintOrderFunction` mirrors `AVOrderFunction`/`SetupOrderFunction`).
- ✓ `PrintOrder.presentationId` is 1:1 FK (M:N for functions, 1:1 for presentations). Matches the MF2-3 statement: *"1:1 FK for PrintOrder (`PrintOrder.presentationId`) — bulk-replace the FK directly."*
- ✓ `PRINT_ORDER` is added to `ModelType` (`src/app/vendors/actions.ts`) AND to `MODEL_TYPES` in `src/app/vendors/model-types.ts`. Vendor model types → Adding a new model type, step 1 and 2 both followed.
- ✓ Server actions live in `src/app/events/print-orders/actions.ts` with `"use server"` directive at top; co-located alongside feature components.
- ✓ `getPrintOrders` and `getPrintOrder` are readers — no `requireAuth()`. Mutations (`createPrintOrder`, `updatePrintOrder`, `deletePrintOrder`, link/unlink variants) also have no `requireAuth()`. Same OQ-1 expected reality.
- ✓ `createPrintOrder` revalidates the list path then `redirect`s to the detail view — matches the Redirect target rule ("Vendor, every order type, Presentation, Function" — order types redirect to detail).
- ✓ `updatePrintOrder` revalidates list + detail then redirects to detail with `?success=Print Order updated` — matches the Toasts rule.
- ✓ `deletePrintOrder` revalidates and redirects to list — standard.
- ✓ Form input parsing uses `(formData.get("name") as string)?.trim()` for strings, `parseInt(formData.get("quantity") as string)` for nullable int with the `formData.get(...) ? parseInt(...) : null` pattern (`actions.ts:120` in `parsePrintItemData`) — matches SF2-F.
- ✓ Breadcrumb on `events/[id]/print-orders/page.tsx:35-41` is `Events → ${event.name} → Print Orders` (3-level for the list page, which is one level above an entity detail). Matches SF2-G.
- ✓ `EntityStatusBadge`, `WorkflowBadge`, `Breadcrumbs`, `InlineDeleteButton` all imported via `@/components/...` — Style → "Reuse the class-string libs" / Components convention.
- ⚠ **The list page (`events/[id]/print-orders/page.tsx`) inlines `<div>`s instead of a `<table>` or `*ListClient`.** Archetype A says: *"Inline the `<table>` directly in the server page when there is no client-side state … Lift to a `*ListClient` ("use client") the moment any one of those is needed."* This list shows neither — flexbox rows of cards, no table, no sort/select/filter. There's no rule violation per se (no client state means Archetype A's "inline" option applies), but the Archetype A wording assumes table-or-client. A reviewer applying the rubric strictly might flag "should use a `<table>`"; a permissive reviewer accepts the card list. **The rule needs to say table OR card-rows are both fine, and call out which trigger forces the lift.**
- ⚠ **No `PrintOrderList` client component, no bulk-edit panel, no selection state.** The "Order list and bulk edit pattern" section says *"Every order type follows this structure. When adding a new order type, replicate it exactly."* This commit added an order type and didn't follow the bulk-edit pattern. Subsequent commits added bulk-edit for AVOrder/SetupOrder/Presentations; PrintOrder has been left behind. The rubric's word "exactly" reads as a regression today.
- ⚠ **`PrintOrderLinkPanel` accepts an unused `eventId: _eventId` prop** (`PrintOrderLinkPanel.tsx:23`). Prefixed underscore means "intentionally unused." The rubric has no rule about unused props, but the `_eventId` pattern is mildly unidiomatic — the team typically drops the prop entirely.

**Missed (would be caught by a thoughtful human reviewer):**
1. **`createPrintOrder` runs three sequential awaits** (`prisma.printOrder.create`, then `Promise.all` for function-junction + default vendor, then another `Promise.all` for vendor + workflow assignment). The second `Promise.all` depends on `defaultVendor` from the first, so the sequencing is necessary, but it's three round-trips when one would do. Optimization, not a correctness issue.
2. **`parsePrintItemData` has eight fields, half of them `(formData.get("x") as string) || null`.** Reasonable for free-text fields but `designerVendorId`, `designerContactId`, `printerVendorId`, `printerContactId` are entity IDs — if a user sets them then later edits the form and removes one, an empty string lands as `null`, which is correct. But if the form ever submits the literal string `"null"`, it'd be stored as the four-character word. Vanishingly unlikely; mention only because the rubric's `|| null` recipe doesn't say "for IDs specifically, also validate that the string looks like a CUID/UUID."
3. **`getPrintOrderPartyOptions` (`actions.ts:152-216`) builds a `contactMap` from both speakers and function contacts.** If the same contact appears as both (a presentation speaker who is also tagged on a function), the function-contact write overwrites the speaker entry. Probably fine — same data either way — but a future bug if speaker-specific fields are ever added.
4. **`PrintOrderForm` and `PrintItemPanel` aren't reviewed here** (file count too high). A spot-check would be useful before relying on PrintOrder as a "reference implementation."
5. **No file-naming inconsistency this time** — the new dir uses kebab-case (`print-orders/`) like every other order type. Helper-file inside (`PrintOrderForm.tsx`, etc.) uses PascalCase per component-file convention. Consistent.

**Suggested CLAUDE.md changes:**
- **Must-fix:** The "Order list and bulk edit pattern" section asserts *"replicate it exactly"* but PrintOrder hasn't been retrofit. Either (a) acknowledge that PrintOrder doesn't have bulk-edit yet and put it on the same retrofit-tracking list as the auth invariant (OQ-1), or (b) downgrade "exactly" to "when adding bulk-edit affordances, replicate this structure." Today the rule mis-describes one of four order types.
- **Should-fix:** Archetype A needs a card-rows clause. Suggested wording: *"For list pages with simple rows and no per-row interactions (delete-link only), an inline `<div>`-per-row layout is acceptable. Adopt a `<table>` when columns become a useful comparison surface; lift to `*ListClient` the moment selection / sort / filter / bulk-edit lands."*

---

## Check 2: Ambiguity sweep

Most pass-1 and pass-2 ambiguities have been resolved. This sweep looks at what's new in CLAUDE.md.proposed since the second pass closed.

### Ambiguous

| Rule (where) | Reading 1 | Reading 2 | Suggested rewrite |
|---|---|---|---|
| "Inline the `<table>` directly in the server page when there is no client-side state. Lift to a `*ListClient` the moment any one of those is needed." (Archetype A) | The choice is binary: inline `<table>` or `*ListClient`. | Card lists (no `<table>`) are also acceptable for simple cases. | "For list pages with no client state, render rows inline. Choose `<table>` when columns aid comparison; choose card rows for one-detail-per-row pages. Lift to `*ListClient` the moment any of sort / select / filter / bulk-edit is needed. Example: `events/page.tsx` uses an inline `<table>`; `events/[id]/print-orders/page.tsx` uses inline card rows." |
| "Order list and bulk edit pattern … When adding a new order type, replicate it exactly." (Order list and bulk edit pattern, intro) | Every new order type must ship with bulk-edit on day one. | Bulk-edit is the target; new types start without it and adopt it later (PrintOrder pattern). | "When adding bulk-edit affordances to an order type, replicate this structure exactly. Order types may ship without bulk-edit initially (see `print-orders/` for the lean variant); retrofit follows when the second client request arrives." |
| "Compound IDs are permitted: `${kind}-${parentId}-${childId}`" (Reports → Anchor ID conventions, MF-2 line) | Parent id first, child id second. | Either order, as long as the result is unique. | Pick one and codify: "Compound IDs use the rendering hierarchy: anchor on the visible entity first, append the disambiguating parent (`presentation-${childId}-${parentBlockId}`, as in `RoomScheduleReport.tsx:200`)." OR keep `${parentId}-${childId}` and retrofit the room schedule report. |
| "`ReportNav` does not auto-render a 'Top' entry; an explicit `{ id: "top", label: "Top" }` in `sections` is redundant and should be omitted unless the report has no other section links." (SF-7) | Authors should drop the Top entry in 99% of cases. | The "should be omitted unless …" caveat makes the rule conditional; authors are unsure. | Either keep the rule and check it in `ReportNav.tsx` (warn if `sections.some(s => s.id === "top")` and `itemGroups.length > 0`), or drop it as a no-op style nit. The current state is a rule that's violated in fresh code without anyone noticing. |
| "Use the singleton `prisma` from `@/lib/prisma`. Direct `prisma.<model>.<op>()` calls are expected in pages, actions, and `src/lib/` helpers" (Data layer) | Pages may call Prisma directly. | Pages should fetch via `actions.ts` and rarely call Prisma. | Both readings appear in the codebase: most pages fetch via `get*` actions; a handful (`new/page.tsx` for print orders, room-schedule `page.tsx`) call `prisma.x.findUnique` directly. Soften to: "Pages and actions may call Prisma directly. Prefer fetching via a sibling `get*` action when the same query is used in two or more places." |

### Unverifiable / contested

| Rule | Why | Suggested rewrite |
|---|---|---|
| "Every Server Action also self-protects with `await requireAuth()` …" (Architecture invariants, Server Actions, Security and validation — three places) | OQ-1 resolved "keep strict, retrofit later." Five commits validated; zero of the new action files comply. The rule's role today is normative-aspirational; pass-2 already documented this and the team explicitly accepted the gap. | Mark inline in the rubric, e.g. with an italic note: *"Retrofit in progress as of 2026-05; new action files going forward must comply, existing files are queued."* The rule isn't ambiguous — it's pre-policy. Make that visible to a reviewer who hasn't read `claudemd-open-questions.md`. |
| "Helper filename convention" — currently undocumented | Two new helpers in the past two weeks chose two different conventions (`format-phone.ts` kebab, `breakoutLabels.ts` camel). | Add to Project structure: "Lib helper files use camelCase (`formatPhone.ts`, `breakoutLabels.ts`)." |

### Structural notes (still open from pass 2)

- **Auth invariant asserted in three places** (Architecture invariants, Server Actions, Security and validation). Pass-2 SF-1 consolidated only the *carve-out*. The invariant itself remains thrice-stated and thrice-aspirational. Either accept this as deliberate emphasis or collapse to one canonical statement + two cross-references.
- **Reports section is ~80 lines** — still the longest. No new pressure to split.
- **Anti-patterns table covers 16 rows.** Adding "Card-list when bulk-edit is needed" / "Order type without `*ListClient` and bulk actions" feels overkill given OQ-1 already parks the "exactly replicate" claim — but worth a check when the table next grows.

---

## Synthesis

### Must-fix before shipping

1. **Compound anchor ID convention disagrees with new code.** MF-2 states `${kind}-${parentId}-${childId}`. `RoomScheduleReport.tsx:200` (committed `f868125`) writes `${kind}-${childId}-${parentId}`. Pick one — either retrofit the report or update the rule. Recommendation: update the rule, since the entity-first form reads more naturally on a jump-link.

2. **"Order list and bulk edit pattern … replicate it exactly" mis-describes PrintOrder.** PrintOrder (`d79fbee`) doesn't have `PrintOrderList`, bulk-edit, multi-select, or `bulkUpdatePrintOrders`. Either retrofit PrintOrder or soften the rule's "exactly" to "for order types that have bulk-edit." This is the smallest of the three reality-mismatches but matters because it's the rubric's own claim of internal consistency.

3. **SF-7 is a documented rule that fresh code violates without anyone catching it.** `RoomScheduleReport.tsx:341` writes `navSections = [{ id: "top", label: "Top" }]` plus a populated `itemGroups`, which is exactly the redundant case the rule names. Either enforce the rule in `ReportNav` (warn / strip), or accept that humans won't catch it and drop the bullet. As-written it sits in the rubric doing nothing.

### Should-fix soon

- **Filename casing for `src/lib/`.** Add one line: "Lib helper files use camelCase (`formatPhone.ts`, `breakoutLabels.ts`)." Two new helpers picked two conventions in two weeks.
- **Archetype A — card rows are also fine.** The "inline `<table>` or `*ListClient`" framing missed the `print-orders/page.tsx` pattern. Add a third row-layout option and name the lift-to-client trigger.
- **Controlled-input carve-out in Forms section.** The "Use native `<form action={serverAction}>`" rule reads as endorsing uncontrolled by default, but `FunctionForm` RoomSelector (and every bulk-edit panel) reaches for `useState<Set<string>>` + `checked` + `onChange`. State the carve-out — "controlled when the UI mediates selection across filtering / bulk / undo."
- **Pages-calling-Prisma-directly nuance.** Most pages fetch via `get*` actions; some (room-schedule `print/page.tsx`, print-orders `new/page.tsx`) call Prisma directly for one-off lookups. The Data Layer rule allows this but doesn't say when to prefer one over the other.

### Notes for next iteration

- **OQ-1 reality.** Five commits and three validation passes in, the strict `requireAuth()` rule has flagged exactly zero violations the team didn't already know about. If the retrofit doesn't happen this quarter, the rule should be softened — "documents the target state" wording rots in the same way "aspirational" wording does. Open question for the next quarterly review: re-evaluate whether to retrofit or to soften.
- **Two reference implementations of "order type"** (AVOrder/SetupOrder/PresentationList) vs. PrintOrder. The lean PrintOrder pattern (no bulk-edit, card list) might be the right baseline for any future order type that doesn't have a clear bulk-edit use case. The "Order list and bulk edit pattern" section currently writes for the fat pattern only.
- **Breakout label rule (`3d47f4e` / `65f3c6b`) is the most successful rule added since pass 1.** Concrete helper, every call site uses it, the Prisma include is named, filter/sort dimension covered. Worth holding up as a model when writing future per-domain rules (e.g., a future "Vendor labels with model-type tag" rule).
- **`format-phone.ts` returning `""` vs. `formatBreakoutSessionName` returning the raw name** when input is missing — two different "no value" idioms in two helpers from the same month. No rule, just a sharper note for the next iteration: pick "always return a displayable string, never `null`" or "always return the raw passthrough."
- **Five commits surveyed in this pass, four in pass 2, five in pass 1.** Fourteen total. The rubric reads better now than at draft. Most of what's left is reality-reconciliation, not language work — same conclusion as pass 2.
