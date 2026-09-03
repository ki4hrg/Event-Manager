# Proposal — #50 Calendar-style quick add function

Status: draft for owner review. No code written.

## Problem

`src/app/events/[id]/agenda/AgendaGrid.tsx` (1,372 lines) renders a
room × 30-minute-slot table. Every empty cell is **already** a drop target:
`DroppableCell` (`AgendaGrid.tsx:288-320`) registers
`useDroppable({ id: \`${roomId}:${slotTime.toISOString()}\`, data: { roomId,
slotTime } satisfies DropData })`, disabled unless `useCanWrite("FUNCTIONS")`.

Three mutations already run from the grid, all through the same envelope shape:
dragging an unscheduled function onto a cell → `scheduleUnscheduledFunction`
(`functions/actions.ts:406` → `core.ts:428`); dragging a scheduled entry →
`rescheduleEntry` (`actions.ts:431`); dragging a resize handle →
`resizeFunctionSchedule`. All three return `{ success, error?, conflicts? }`, feed
`ConflictWarning`, and end in `router.refresh()`. This is the documented carve-out
from CLAUDE.md's "no `{ success, error }` envelope" rule — conflict-bearing
non-form mutations from a client list.

What is missing: **nothing creates a new Function from the grid.** Creating one
means leaving for `/events/[id]/functions/new`, filling the form, and coming back —
and the room and time you clicked are lost on the way. That page reads only
`?type=` and `?groupId=` from `searchParams`.

Two incidental findings in the create path, worth fixing alongside:

- `createFunctionCore` (`functions/core.ts:86`) writes the auto-created schedule row
  with `type: "SESSION"`; `scheduleUnscheduledFunctionCore` (`core.ts:457`) writes
  `type: "MAIN"`. Neither matches any seeded `schedule_type` label (`Setup` /
  `Rehearsal` / `Main Event` / `Breakdown`, `prisma/seed.mjs:31-36`), so
  `resolveOptionLabel` finds nothing and the row renders with a raw key and no color.
- Both write `isPublic: false` (the schema default), and the Event Schedule report
  filters to `isPublic: true` unless `includeNonPublic` is set
  (`reports/actions.ts:1640`) — so anything created from the grid is invisible on
  the public schedule until someone toggles it on the Schedule Items page.

## Two readings

**(A) Prefill and navigate.** Clicking an empty cell links to
`/events/[id]/functions/new?roomId=…&startTime=…&endTime=…`; `FunctionForm` opens
with that room checked and the times filled. Ships in a day, reuses
`createFunction` and its redirect rules unchanged.

**(B) Inline quick-add.** Click — or drag across slots — opens a small composer
anchored in the cell: name, type, end time. It calls a new `quickCreateFunction`,
the grid `router.refresh()`es, and you never leave the calendar.

**Recommended: (B), with (A) as its escape hatch.** The whole value of a calendar
quick-add is not leaving the calendar; (A) alone is a bookmark, not a feature. But
(A)'s prefill plumbing is exactly what the composer's "Add full detail…" link
needs, so build it first and none of it is wasted.

## Proposed UX

**Affordance.** A `+` that fades in on cell hover rather than a bare click on any
empty cell — the grid is large and mostly empty, and a bare click is too easy to
trigger while panning. On touch, tap the cell.

**Span selection.** Dragging across empty cells in one room sets start/end. Do
**not** add a second `DndContext` — dnd-kit's `PointerSensor` already owns pointer
events inside the grid and the two gestures will fight. Implement it the way the
resize handles do: `onPointerDown` on the `<td>` plus document-level `pointermove`
/ `pointerup` listeners (`AgendaGrid.tsx:940-979`), with the same "snapshot, then
restore on failure" pattern.

**Composer.** Absolutely positioned inside the cell — `DroppableCell` already
renders `className="… relative"` (`AgendaGrid.tsx:314`), so no layout change is
needed. Fields: **Name** (required, autofocused); **Type** (`function_type`
options, defaulting to `General`); **End** (defaults to start + 1 h, matching the
`SLOT_INTERVAL_MS * 2` the unscheduled-drop path already uses at
`AgendaGrid.tsx:998`); **Public** checkbox (default per open question 2). Buttons:
**Add** · **Add full detail…** (navigates to the prefilled `/new` page) ·
**Cancel**. Enter submits; Esc and blur cancel. No modal `<Dialog>` — CLAUDE.md's
anti-pattern table is explicit about inline state on the trigger.

## Proposed server side

New pair following the `*Core(args, userId)` convention —
`quickCreateFunctionCore(eventId, { name, type, roomId, startTime, endTime,
scheduleType, isPublic }, force, userId)` returning
`{ success, error?, conflicts? }`:

- `requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId)` first.
- Parse times with `parseDateTimeInTimezone` (`src/lib/timezones.ts`) against the
  event timezone — the canonical helper per `reviews/claudemd/candidates.md`.
- Reject `end <= start` the way `scheduleUnscheduledFunctionCore:441` does.
- Unless `force`, run `checkRoomConflicts([roomId], start, end)`
  (`src/lib/conflicts.ts`) and return `{ success: false, conflicts }`.
- Create the `Function` + one `FunctionRoom` + one `FunctionSchedule` in a single
  `prisma.$transaction`. Call `resolveCreateStatus(eventId, "FUNCTION")` and
  `autoAssignDefaultWorkflowsCore` **outside** it — they use the global singleton
  and would wait on locks the transaction holds (`candidates.md`).

The Server Action wrapper `revalidatePath`s the agenda and the new detail page and
**returns the envelope — it does not `redirect()`**. That is a deliberate
departure from "entities needing further setup redirect to the detail view": this
is CLAUDE.md return-shape (b), a non-form mutation from a client list ending in
`router.refresh()`, exactly like its three sibling grid mutations. Worth a line in
`reviews/claudemd/candidates.md` when it lands.

For (A), `new/page.tsx` gains `roomId` / `startTime` / `endTime` to its
`searchParams` type and passes them into `FunctionForm`. `RoomSelector` already
takes `selectedRoomIds` (`FunctionForm.tsx:45`), so the room half is nearly free.

## Files touched

- `src/app/events/[id]/agenda/QuickAddComposer.tsx` (new, `"use client"`) — keep it out of `AgendaGrid.tsx`, already 1,372 lines
- `src/app/events/[id]/agenda/AgendaGrid.tsx` — hover `+`, `pendingCell` state, span-drag handlers, composer mount, refresh on success
- `src/app/events/[id]/agenda/page.tsx` — fetch `getOptions("function_type")` and `getOptions("schedule_type")`, pass down
- `src/app/events/functions/core.ts` — `quickCreateFunctionCore`; fix the `"SESSION"` / `"MAIN"` schedule-type constants
- `src/app/events/functions/actions.ts` — `quickCreateFunction` wrapper
- `src/app/events/[id]/functions/new/page.tsx` and `FunctionForm.tsx` — prefill room and times
- `src/lib/mcpTools/functions.ts` — optional; `create_function` could take the same args

## Open questions for the owner

1. What **schedule type** should a quick-added row get? Today's two create paths
   write `"SESSION"` and `"MAIN"`, neither of which is a seeded `schedule_type`
   option. Should the composer offer the picker, or always write `Main Event`?
2. Should a quick-added schedule row be **public by default**? It is `false` today,
   so it will not appear on the Event Schedule report — or any share link built
   from it — until someone flips it on the Schedule Items page. A real trap for a
   "quick" add.
3. **Drag-to-span in v1**, or click-only with a fixed 1-hour default and resize
   afterwards? Click-only is roughly a third of the work and the resize handles
   already exist.
4. Should the composer also offer **"schedule an existing unscheduled function"**?
   A drag path for that already exists from the room panel, so a picker may just be
   a second way to do the same thing.

## Alternatives considered

- **Modal dialog composer** — rejected outright; CLAUDE.md's anti-pattern table
  bans `<Dialog>` for this class of interaction.
- **Double-click to create** — no hover affordance needed, but undiscoverable and
  awkward on touch.
- **A "New function" button above the grid** pre-selecting the visible day —
  trivial, but it carries neither the room nor the time, which is the whole ask.
- **Create the function with no schedule row, then drag it in from the unscheduled
  panel** — reuses the existing drop path entirely and needs no new action, but it
  is two gestures for one intent.

## Estimate

**(A) alone: Small** — ~120 lines across three files, no schema, no new action.
**(B): Medium** — ~350 lines: one new component (~180), grid wiring (~100), core +
action (~70). No migration. The schedule-type and `isPublic` fixes are a handful of
lines but touch two existing create paths, so they should land as their own commit.

> **Update:** the `"SESSION"` / `"MAIN"` schedule-type bug noted above was fixed alongside this proposal. All three writers now call `defaultScheduleType()` from `src/lib/scheduleTypes.ts`, and `scripts/repair-schedule-types.ts` rewrites existing rows.
