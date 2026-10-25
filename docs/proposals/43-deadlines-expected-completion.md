# #43 — Deadlines / expected completion (absolute and relative to start)

> Folded into [workflow-progress.md](./workflow-progress.md) (phase 3), which settles this proposal's open questions and wins where they differ.

> Shares a schema change with **#44 (responsibility per step)**. Read both; land one migration.

## Problem

Workflow steps have no time dimension at all. `WorkflowStep`
(`prisma/schema.prisma:1002-1017`) carries `label`, `sortOrder`, `computedKey` and pending status
values; `WorkflowStepCompletion` records `completedAt` only once the box is checked. There is no
"should have been done by," so `WorkflowPanel` cannot distinguish a step that is early from one
that is three weeks late, and the event overview cannot warn about either.

Deadlines *do* exist elsewhere, hard-coded onto one entity: `CateringOrder` has
`depositDeadline`, `guaranteeDeadline` and `paymentDeadline` (`prisma/schema.prisma:625-627`).
They are plain `DateTime?` columns with no relative expression and no overdue indicator — they
render as dates and nothing watches them. That is the pattern this issue generalises.

The title asks for **both** forms: absolute ("2026-03-01") and relative ("10 days before the
event/function"). Both are needed, because a template that says "10 days before" survives being
reused for next year's event, while a one-off says "the venue needs this by the 1st."

## Proposed model / UX

### Schema

**Template step** (`WorkflowStep`, and the same three on `WorkflowChecklistItem`):

```
dueOffsetDays Int?       // signed: -10 = 10 days before anchor, +3 = 3 days after
dueAnchor     DueAnchor? // EVENT_START | EVENT_END | FUNCTION_START | ORDER_DATE
enum DueAnchor { EVENT_START EVENT_END FUNCTION_START ORDER_DATE }
```

A signed integer beats an offset plus a direction enum: one column, no illegal combinations, and
"+3 after event end" costs nothing extra. `DueAnchor` is a genuine closed union, so unlike #44's
party type it should be a Prisma enum with the usual `_exhaustive: never` closer.

**Per-instance** — three more columns on the `WorkflowStepState` / `WorkflowChecklistState` rows
that #44 introduces (this is why the two issues share a migration):

```
dueOffsetDays Int?        // copied from the template at instantiation, editable
dueAnchor     DueAnchor?
dueAtOverride DateTime?   // an absolute date wins over any relative rule
```

### Resolution: hybrid, not materialised

Two readings of "resolution at instantiation":

- **(A) Materialise.** Compute a concrete `dueAt` when the workflow is assigned and store it.
  Simple to query and sort. Goes stale the moment the event dates move — and event dates move.
- **(B) Compute on read.** Always correct, never overridable by hand.

**Recommended: hybrid**, which is also the plainest reading of the title. Store the *rule* on the
instance (copied from the template so a later template edit does not silently reschedule live
work) plus an optional absolute override:

```
effectiveDueAt = dueAtOverride ?? resolveAnchor(anchor, instance) + dueOffsetDays
```

Move the event by a week and every unoverridden deadline moves with it. `src/lib/dueDates.ts`
holds `resolveDueAt()` and `dueTier()`; nothing is denormalised, so nothing can drift.

### Anchor resolution — the details the code makes non-obvious

- **`EVENT_START` / `EVENT_END`** — `Event.startDate` / `Event.endDate`. Straightforward.
- **`FUNCTION_START`** — a `Function` **has no start time of its own**; times live in
  `FunctionSchedule[]` rows with a `type` and an `isPublic` flag
  (`prisma/schema.prisma:520-535`). Use `mainScheduleStart()` from `src/lib/functionSchedules.ts`,
  which already encodes the house rule: earliest public schedule, else the longest schedule.
- **Which function anchors an order?** Depends on the entity type:
  `CateringOrder.functionId` is a 1:1 FK, so unambiguous. `AVOrder`, `SetupOrder`, `PrintOrder`,
  `SupplyOrder` and `MediaDeliverable` link many-to-many through `*OrderFunction` junctions, so an
  order linked to three functions has three candidate anchors — take the **earliest**
  `mainScheduleStart` and say so in the UI ("relative to Opening Reception"). A `Presentation`
  anchors on its earliest `PresentationSlot`'s function.
- **`ORDER_DATE` is not resolvable today.** No order model has a due/needed-by date; the only
  order-level dates in the schema are the three catering deadlines. Either drop `ORDER_DATE` from
  v1, or add `neededBy DateTime?` to the five order models first. See open question 1.
- **Timezone.** Offsets are day-granular and must be computed in `Event.timezone` (the field
  exists and defaults to `America/Chicago`), with due time at end-of-day local — otherwise "10 days
  before" lands on the wrong date for anyone in another zone. This is the same class of arithmetic
  as `src/lib/conflicts.ts`, which CLAUDE.md flags as the riskiest logic in the codebase; keep it in
  one helper with the anchor math beside it.
- **No anchor available** (an unscheduled function, an order with no linked function) →
  `effectiveDueAt` is null and the step renders as "No due date," never as overdue.

### Overdue indicator

`src/lib/dueDates.ts` exports `dueTier(dueAt): "overdue" | "dueSoon" | "upcoming" | "none"` with
`dueSoon` at ≤ 3 days, mirroring the tier-map styling `LastUpdated.tsx` already uses
(`TIER_CLASSES` with a dot + text colour per tier). Surfaces:

- **`WorkflowPanel`** step rows — due chip, red when overdue, amber when due soon, muted otherwise.
  A completed step shows its date without a tier (it is done; late no longer matters).
- **`WorkflowBadge` / `WorkflowStatusBadge`** — a small marker when the instance has any overdue
  step, so a list row shows it without expanding.
- **Print** — `src/components/print/WorkflowSection.tsx` prints the date; colour is not a reliable
  print channel, so append "(overdue)".

### Rollup

1. **Event overview.** `getEventOverviewStats()` (`src/app/events/[id]/actions.ts`) already builds
   per-entity `attention: { label, count, href }[]` rows behind `hasPermission` checks. Add
   "N overdue steps" per entity type — the cheapest possible surface, and it reuses the existing
   card.
2. **Deadlines page.** `/events/[id]/deadlines` — Archetype A list page, `force-dynamic`, grouping
   open steps by week (Overdue / This week / Next week / Later) with entity, step label, due date
   and — once #44 lands — responsible party. Filters (entity type, party, overdue-only) live in URL
   search params, validated against an allowed set. Sidebar entry under Schedule.
3. **Not reminders.** Nothing in this project runs on a schedule; `src/lib/email.ts` exists but
   there is no worker, cron or queue. "Overdue" is computed at render. Emailed reminders are a
   separate, larger piece of work — see open question 4.

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `DueAnchor` enum; `dueOffsetDays` / `dueAnchor` on `WorkflowStep` + `WorkflowChecklistItem`; three due columns on #44's `WorkflowStepState` / `WorkflowChecklistState` |
| `src/lib/dueDates.ts` | new — `resolveDueAt`, `dueTier`, anchor resolution per entity type |
| `src/lib/functionSchedules.ts` | reused (`mainScheduleStart`) — no change expected |
| `src/app/events/workflows/core.ts` | copy template due rules into state rows at instantiation |
| `src/app/events/workflows/actions.ts` | `setStepDueDate` / `clearStepDueDate` (reuse `assertInstanceMatches`) |
| `src/components/WorkflowPanel.tsx` | due chip + inline date/offset editor |
| `src/components/{WorkflowBadge,WorkflowStatusBadge}.tsx` | overdue marker |
| `src/app/(admin)/workflows/[id]/WorkflowEditor.tsx`, `src/app/(admin)/workflows/actions.ts` | per-step "due N days before <anchor>" control |
| `src/app/events/[id]/actions.ts` | overdue counts in `attention` |
| `src/app/events/[id]/deadlines/{page.tsx,actions.ts,DeadlineFilters.tsx}` | new — rollup page |
| `src/components/EventSidebar.tsx` | `NAV` entry |
| `src/components/print/WorkflowSection.tsx` | print the due date |

Closest archetype: **A (authenticated list)** for the deadlines page; the existing
`CateringOrder.*Deadline` fields for the absolute-date UI; `LastUpdated`'s tier map for the
indicator styling.

## Open questions for the owner

1. Is `ORDER_DATE` a required anchor? Nothing in the schema supplies it today — supporting it means
   adding `neededBy DateTime?` to the five order models first. Drop it from v1?
2. When an order links to several functions, should the deadline anchor on the **earliest**
   (recommended), the latest, or a function the user picks per instance?
3. Confirm the hybrid resolution: relative rule stored on the instance, absolute override wins, and
   moving the event's dates moves every unoverridden deadline. The alternative — freeze dates at
   instantiation — is more predictable but goes stale when dates shift.
4. Do deadlines need to *notify*, or is an on-screen overdue indicator plus the deadlines page
   enough? Notification means introducing a scheduler, which is a much larger change than this
   issue.

## Alternatives considered

- **Absolute `dueAt` only.** Half the ask, and templates become useless across events.
- **Relative offsets only, computed everywhere at read time.** No way to say "the venue needs this
  by the 1st" for a one-off.
- **A generic `Deadline` model attached to any entity** (not just workflow steps). More flexible,
  but it duplicates workflow steps as the place work is tracked and gives two competing to-do
  systems. If a non-workflow deadline is needed, add it to the order models directly.
- **Materialising `dueAt` on instantiation.** Simpler queries and easy sorting; rejected because
  event dates move and stale deadlines are worse than none.

## Estimate

**Medium–Large, ~2–2.5 days** on top of #44's shared migration. Schema + `dueDates.ts` with anchor
resolution and timezone handling ~0.75d (this is the risky part); `WorkflowPanel` + badges ~0.5d;
template editor ~0.25d; deadlines page with filters and mobile layout ~0.75d; overview attention
rows + print ~0.25d.
