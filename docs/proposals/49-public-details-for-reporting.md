# Proposal — #49 Add public details for reporting

Status: draft for owner review. No code written.

## Problem

The schema has exactly one notion of "public": `FunctionSchedule.isPublic`
(`prisma/schema.prisma:530`, default `false`). It drives four things —
`getEventScheduleData` filters to `isPublic: true` unless `includeNonPublic` is
passed (`src/app/events/reports/actions.ts:1638-1641`); `RoomScheduleReport.tsx:50-55`
splits public rows first; `EventProfileReport.tsx:146` renders a "Public" badge;
and the Schedule Items page filters, sorts and bulk-edits on it
(`src/app/events/schedule-items/ScheduleItemList.tsx`).
`ShareLinkFilters.includeNonPublic` (`src/lib/shareLinks.ts:14`) persists the
toggle onto a share link via `resolveSharedBoolean`.

Everything else that would appear in an attendee-facing program is internal-only
or mixed:

- `Function.name` / `.description` / `.notes` — one name serves both "Opening
  General Session" and "GS1 — load in 6am, doors 8:15".
- `Presentation` already draws the line **once**: `title`, `description`,
  `schedulingNotes` (db column `notes`), plus a separate `internalNotes`
  (`schema.prisma:930-936`). That is the precedent worth copying.
- `Room.name` is the internal room label, which may not be the public signage name.
- Speaker names come from `Contact`; there is no bio (see proposal **#55**).
- No `published` / `publishedAt` anywhere.

And the share surface is the only public one: `src/app/share/[token]/page.tsx`
branches on `link.reportType` and renders the *internal* report component, with
`stripUpdatedBy` (`src/lib/stripUpdatedBy.ts`) as the only redaction — it nulls
staff names and emails and nothing else. So "share the schedule with attendees"
today means sharing a staff report with generous filters and hoping the rest is
harmless.

## Two readings

**(A) Field-level** — add public counterparts (`publicName`, `publicTitle`,
`publicDescription`) to the entities in an attendee view, and give reports a
"Public view" that renders only those.
**(B) Row-level** — extend `isPublic` from `FunctionSchedule` to `Presentation`,
so publishing is a visibility decision rather than a second copy of the text.

**Recommended: both, minimally — (B) decides *whether* a row appears, (A) decides
*what text* it shows.** They answer different questions, and the codebase already
has one of each pattern. But see open question 2: if the real need is only "hide
the internal rows", the (A) half drops out and this becomes a small change.

## Proposed model — minimal field set

| Model | Column | Fallback |
|---|---|---|
| `Function` | `publicName String?` | `name` |
| `Presentation` | `isPublic Boolean @default(false)` | — |
| `Presentation` | `publicTitle String?` | `title` |
| `Room` | `publicName String?` | `name` |
| `Event` | `publicName`, `publicDescription String?` | `name`, `description` |

Five nullable columns and one boolean. No new models.

Deliberate omissions. **No `isPublic` on `Function`** — visibility already lives
on `FunctionSchedule`, the row a schedule report actually renders; a second flag
one level up creates a "public function with no public schedule rows" state every
report must reason about. **No `publishedAt`** — a share link's `expiresAt` /
`revokedAt` already governs *when* something is visible, and a publish timestamp
would be a second, competing gate with no surface to manage it. **No public
`description`** on Function or Presentation — `Presentation.description` is already
the outward-facing text (its internal sibling is `internalNotes`);
`Function.description` can be treated the same way with `Function.notes` suppressed.

Label resolution goes in a new plain module `src/lib/publicLabels.ts`
(`publicLabel(row)`, `publicTitle(row)`) — same shape as `formatBreakoutSessionName`
and `partyLabel`. It **must** live in `src/lib/`, not a `"use client"` module:
`reviews/claudemd/candidates.md` records a runtime `TypeError` from exactly this
mistake when `partyLabel` was imported from `party-field.tsx` into a server
component.

## Proposed "public view" toggle

The tempting move is a second boolean, `publicOnly`. Do not — it is the same axis
as `includeNonPublic`, inverted, and the two will disagree. CLAUDE.md's
absence-sentinel rule applies: pick one vocabulary, convert at the edge.

**Proposed:** add `audience?: "internal" | "public"` to `ShareLinkFilters`
(`src/lib/shareLinks.ts:4-17`), defaulting to `"internal"`. At the page boundary
`audience === "public"` **implies** `includeNonPublic: false`; the stored filter
stays single-valued. When public, report bodies render `publicLabel` /
`publicTitle` in place of internal names; include only `isPublic` schedule rows
and presentations; and suppress `notes`, `internalNotes`, `schedulingNotes`,
vendor names, order links, status/substatus and workflow badges, and
`LastUpdated`. `stripUpdatedBy` keeps doing what it already does for staff identity.

**Which reports get it.** Event Schedule and Room Schedule first — those are the
attendee artifacts. Event Profile, Function Detail, Equipment Responsibility and
Vendor Handoff are internal *by construction* (a "public" Vendor Handoff is a blank
page); those should simply not offer the toggle rather than half-redact. That is a
per-report decision, not a global one.

The toggle renders as a chip beside the existing "Include non-public" chip in each
`ReportFilters.tsx`, wired exactly like `includeNonPublic`
(`event-schedule/ReportFilters.tsx:56-66`) — including the `paramPrefix`
prepending the dashboard share view requires.

## Files touched

- `prisma/schema.prisma` — five nullable columns + `Presentation.isPublic`
- `src/lib/publicLabels.ts` (new); `src/lib/shareLinks.ts` — `audience` on `ShareLinkFilters`
- `src/app/events/reports/actions.ts` — `EventScheduleFilters` (:1619), `getEventScheduleData` (:1624), `RoomScheduleFilters` (:1085), `getRoomScheduleData` (:1090)
- `src/app/events/[id]/reports/{event-schedule,room-schedule}/{page,ReportFilters,*Report}.tsx` + their `print/page.tsx`
- The five surfaces in `docs/checklists/share-report-integration.md` — no new report type, so filter plumbing only
- `src/app/events/functions/{core,actions}.ts` + `FunctionForm.tsx` — `publicName`
- `src/app/events/presentations/{core,actions}.ts` + `PresentationForm.tsx` — `isPublic`, `publicTitle`
- `src/app/venues/{RoomList.tsx,core.ts}` — `Room.publicName`
- `src/app/events/schedule-items/ScheduleItemList.tsx` — extend the existing bulk `isPublic` to presentations if they gain the flag

## Open questions for the owner

1. Is "public" **one audience**, or are there tiers — attendee, speaker, vendor,
   sponsor? With tiers, `audience` should be a `CustomOption`-backed label rather
   than a two-value union and the suppression rules become per-tier. This is the
   single question that most changes the shape.
2. **Do public names actually differ from internal ones today**, or is the real
   need just "hide the internal rows"? If the latter, drop every `public*` column
   and ship the `audience` flag plus `Presentation.isPublic` alone — about a third
   of the work.
3. Should a public view **rename or suppress rooms**? Attendees see "Grand
   Ballroom"; staff see "GB-A/B". `Room.publicName` covers renaming, but there is
   also a case for showing no room at all.
4. Is a **share link** the right delivery mechanism for an attendee schedule, or
   does that content get exported to an event website / mobile app? If export is
   the real destination, the deliverable is a stable public data shape (and
   possibly an MCP read tool), not a report toggle.

## Alternatives considered

- **A separate `PublicSchedule` model**, curated by hand. Total control and no
  leak risk, but a second copy of the schedule that drifts the moment anything
  moves on the agenda.
- **A `publicOnly` boolean alongside `includeNonPublic`** — simplest to write, and
  precisely the mixed-vocabulary failure the absence-sentinel rule exists to prevent.
- **Field-level allowlist per report** instead of suppression rules in the body.
  Safer when a report gains a field, and worth revisiting if tiers turn out to be
  real — but a much larger refactor across six report bodies.
- **Do nothing structural; rely on filters** (today's status quo). Works only
  because someone remembers to set them, and filters cannot hide a vendor name
  inside a row that is otherwise public.

## Estimate

**Small-medium if question 2 answers "hide rows only"** — ~150 lines, mostly the
`audience` field threaded through the five share surfaces and two report bodies,
plus `Presentation.isPublic` and one migration. **Medium with public-label
columns** — ~400 lines, one migration, a label helper threaded through two report
bodies and their print routes, and three form surfaces. Answer question 2 before
writing anything; it halves the change.
