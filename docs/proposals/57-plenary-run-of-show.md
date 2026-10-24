# Proposal — #57 Plenary session run-of-show support

Status: draft for owner review. No code written.

## Problem

"Plenary Session" is a seeded `function_type` label (`prisma/seed.mjs:10`) and
"Plenary" a seeded `presentation_type` (`seed.mjs:47`), but **nothing in the code
branches on either**. The only structurally special function type is
`BREAKOUT_BLOCK`, hardcoded in ~20 places.

What a plenary function can hold today: `FunctionSchedule` rows — coarse phases
(`Setup` / `Rehearsal` / `Main Event` / `Breakdown`, `seed.mjs:31-36`) with
`isPublic`; `FunctionContact` — a contact plus a free-text `role`, unordered; and
linked AV / Setup / Print / Supply / Media orders.

What it cannot hold:

- **Ordered content.** `PresentationSlot` is gated to breakouts everywhere it is
  written or offered (`breakout-schedule/actions.ts:84,261,588`; the function
  picker at `src/app/events/[id]/presentations/[presentationId]/page.tsx:127`
  filters `where: { type: "BREAKOUT_BLOCK" }`). It also has no `sortOrder`, only
  `@@unique([functionId, presentationId])` — so even opened up it could not order
  a plenary's segments.
- **Cues.** `TimelineItem` (`schema.prisma:649-666`) is the closest shape
  (`label`, `startTime`, `endTime?`, `notes`, `sortOrder`) and already carries a
  **nullable `functionId` FK that nothing in the app ever sets** — every writer
  goes through `createTimelineItemCore(cateringOrderId, …)`
  (`src/app/events/catering-orders/core.ts:259`). It has no "who", no AV/lighting
  column, no cue number.

So the show caller's document — an ordered list of segments inside the main event
window, each with a time or offset, who's on, and AV/lighting/notes — has no home.
It is typed into `Function.notes`.

## Two readings

**(A) Activate `TimelineItem.functionId` and widen `TimelineItem`** with cue
columns. Cheapest — no new model, and Function Detail and Vendor Handoff already
render "Timeline" sections (`FunctionDetailReport.tsx:982`,
`VendorHandoffReport.tsx:701`).

**(B) A new `RunOfShowCue` model** scoped to a Function.

**Recommended: (B).** `TimelineItem` is the *catering* vocabulary — it is rendered
to catering vendors on the handoff report and means "when the food moves". Adding
`cueNumber`, `avNotes`, `lightingNotes`, `contactId`, `offsetMinutes` puts five
permanently-null columns on every catering row and makes the handoff timeline
ambiguous about what it shows. Same test `reviews/claudemd/candidates.md` applied
to `Equipment` vs `InventoryItem`: does one row need to exist in more than one
context at once? A plenary cue and a catering timeline entry never coexist on the
same record. If the owner would rather have one vocabulary, (A) is a legitimate
fallback and the proposal collapses to "widen `TimelineItem`, set `functionId`,
hide the new columns on the catering surface".

## Proposed model

`RunOfShowCue`, `functionId` Cascade, plus:

- `anchorScheduleId String?` → `FunctionSchedule`, `SetNull` — normally the "Main
  Event" row; the offsets hang off it.
- `cueNumber String?` — "1", "1A", "Q7". Free text, deliberately not an `Int`.
- `offsetMinutes Int?` — minutes from anchor start; **primary storage**.
- `startTime DateTime?` — absolute override, used when `offsetMinutes` is null.
- `durationMinutes Int?`
- `segment String` — "Welcome", "Keynote intro", "Video roll", "Awards".
- `presentationId String?`, `contactId String?`, `role String?` — who is on.
- `avNotes`, `lightingNotes`, `notes String?`
- `sortOrder Int @default(0)`, timestamps, indexes on every FK.

**Why offsets are the primary storage.** Plenaries get moved. Absolute times mean
moving the function on the agenda silently invalidates every row; storing
`offsetMinutes` against `anchorSchedule` means a drag in `AgendaGrid` reschedules
the whole run for free. Display time is `anchor.startTime + offsetMinutes`,
computed in `src/lib/runOfShow.ts` — which must be a plain module, not
`"use client"`, per the client-reference-proxy footgun recorded in
`reviews/claudemd/candidates.md`.

**Who.** Reuse the existing person vocabulary rather than free text: `contactId`
resolved from `FunctionContact` on this function plus the speakers of any linked
presentations — the pool `getResponsibleParties` (`src/lib/responsibleParties.ts`)
already assembles. Keep `role` free text for the things that are not a person
("house left mic", "band").

**Permissions.** No new `PermissionResource`. A cue has the same lifetime, owner
and audience as its function — gate on `FUNCTIONS`. That also keeps it out of
`src/app/(admin)/users/roles/resources.ts` and `prisma/seed.mjs`.

**No status/workflow.** Do not give a cue `EntityStatus` / `StatusModelType` /
workflow templates — that pulls in the status-defaults panel, the workflow switch
arms and the sidebar, for a row whose only lifecycle is "written down". Live
check-off during the show is a separate ask (open question 3).

## Proposed UX

**Edit surface.** A `RunOfShowPanel` on the function detail page
(`src/app/events/[id]/functions/[functionId]/page.tsx`, alongside `ScheduleList`
at :394), built like `TimelineTable.tsx` — inline add/edit rows, `useFormStatus`
submit, inline confirm delete, dnd-kit reorder in the shape of `OptionList`.
Desktop columns: cue # · time (computed, offset editable) · segment · who · AV ·
lighting · notes.

**Which functions show it.** Render for every function that is not a
`BREAKOUT_BLOCK`, and let emptiness be the filter. Do **not** introduce a second
magic type string — the `BREAKOUT_BLOCK` precedent shows how sticky those get
(20 call sites, none discoverable from the type system).

**Report.** Add cues as a section in the existing Function Detail report first, by
adding `runOfShowCues` to `fdFunctionInclude` (`reports/data.ts:1339`) and
rendering it in `FunctionDetailReport.tsx`. `candidates.md` already records the
rule: check whether a requested view is a section or toggle on an existing report
before minting one. Only if the show caller needs different density (bigger type,
one page per segment, no order detail) does a standalone
`/events/[id]/reports/run-of-show/` earn the five surfaces in
`docs/checklists/share-report-integration.md`.

**Print.** The cue table is the artifact: `table-fixed` with an explicit
`<colgroup>` so columns line up across page breaks, `section { break-inside:
avoid-page }` (already in `globals.css`), and the mandatory mobile card
dual-render — a 7-column table is far past CLAUDE.md's 2-column/24-character
exemption.

## Files touched

- `prisma/schema.prisma` — `RunOfShowCue` + back-relations on `Function`, `FunctionSchedule`, `Presentation`, `Contact`
- `src/lib/runOfShow.ts` (new) — offset→absolute resolution, ordering, duration rollup
- `src/app/events/functions/run-of-show-core.ts` + `actions.ts` additions — `*Core(args, userId)` pair per CLAUDE.md § MCP writes
- `src/app/events/functions/RunOfShowPanel.tsx` (new, `"use client"`)
- `src/app/events/[id]/functions/[functionId]/page.tsx` — panel + inline `"use server"` closures binding `functionId` / `eventId`
- `src/app/events/reports/data.ts` (`fdFunctionInclude`, :1339) and `FunctionDetailReport.tsx` — cue section
- `src/lib/mcpTools/functions.ts` — `list_run_of_show_cues` / write tools if the connector should reach them
- *(standalone report only)* the five surfaces in `docs/checklists/share-report-integration.md`

## Open questions for the owner

1. Should cue times be **offsets from a schedule row** (recommended — the run
   slides when the function moves) or **absolute clock times** the show caller
   types? Both can be stored, but one has to win when they disagree.
2. Is "who" a `Contact` FK, or in practice free text ("house AV", "band", "video")
   that would fight a required person picker?
3. Does the show caller need **live state during the show** — done/standby
   check-off per cue — or is this purely a pre-production printed document? Live
   state changes the whole shape (polling, concurrency).
4. **Function Detail section, or standalone report?** The section is one file; the
   standalone route is five share surfaces plus a print route.

## Alternatives considered

- **Widen `TimelineItem`** — see above; the fallback if one vocabulary is preferred.
- **Open `PresentationSlot` to non-breakout functions** and add `sortOrder`. Fits
  "keynote is a Presentation" nicely, but a run of show is mostly *not*
  presentations (walk-in music, video roll, awards, transitions), so most cues
  would be slots with a null presentation. Can still be layered on later through
  `RunOfShowCue.presentationId`.
- **A rich-text field on `Function`** (like catering `menuContent`). Zero schema
  work, prints fine, but nothing is queryable — no "every cue needing a lav mic",
  no time recomputation when the function moves.

## Estimate

**Medium-large.** One model + migration, one lib helper, one core/action pair, one
client panel (~350 lines; `TimelineTable.tsx` is 222 as a reference), one report
section — roughly 900–1,100 lines as a Function Detail section. Add ~400 more plus
five share surfaces for a standalone report. Two PRs: model + panel, then report.
