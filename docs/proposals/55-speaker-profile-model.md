# Proposal — #55 Speaker profile model

Status: draft for owner review. No code written.

## Problem

There is one person model. `Contact` (`prisma/schema.prisma:414-455`) holds
`firstName`, `lastName`, `email`, `phone`, `organization`, `notes`,
`roles String[]` and ~30 back-relations. `PresentationContact`
(`schema.prisma:966-981`) is the presentation↔contact junction with `role` (from
the seeded `presenter_role` options), `isPrimary` and `sortOrder`, managed by
`src/app/events/presentations/SpeakerList.tsx` (470 lines).

Nowhere is there a bio, headshot, dietary restriction, A/V preference, travel
itinerary or honorarium. Concretely:

- `Contact` has no image field, and `FileUpload` (`schema.prisma:1565-1600`) has no
  `contactId`. `ENTITY_DIRS` (`src/lib/uploads.ts:30-39`) covers event / catering /
  av / print / setup / supply / media / venue — no contact. A headshot has no
  attachment point at all.
- Money appears in the schema exactly once (`CateringOrderLineItem.unitPrice`).
  There is no payment or status vocabulary for an honorarium.
- The only place a speaker fact fits today is `Contact.notes` — one free-text
  field shared with that contact's use as a venue rep, vendor contact or key staff.

`Contact` is also **global**, not event-scoped, and that matters: speaker facts
split along a clean seam.

## Two readings

**(A) Everything on `Contact`** — fewest joins, one edit surface, no new route.
**(B) Split by lifetime** — durable person facts on `Contact`; per-event
engagement facts on a new `SpeakerProfile` keyed `(eventId, contactId)`.

**Recommended: (B).** The test is the one `reviews/claudemd/candidates.md` used to
justify `InventoryItem` over a `locationId` on `Equipment`: does one row need to
exist in more than one place at once? A returning speaker's bio does not change
between the 2025 and 2026 editions; their flight, hotel, honorarium and rehearsal
slot change every time — and `EventSeries` (`schema.prisma:310-317`) exists
precisely because these events recur.

| Durable → `Contact` | Per-event → `SpeakerProfile` |
|---|---|
| bio, pronouns, job title, website, headshot | arrival/departure, flight, hotel, confirmation |
| standing dietary restriction | this-event dietary override |
| standing A/V preference (lav vs handheld) | this-event A/V needs |
| — | honorarium + status, shirt size, release form, rehearsal notes |

## Proposed model

**1. Durable columns on `Contact`** (all nullable): `bio` (rich text),
`pronouns`, `title` (job title — distinct from `organization`), `website`,
`headshotFileId` (FK → `FileUpload`, `SetNull`). `bio` becomes the app's fifth
`dangerouslySetInnerHTML` call site; per CLAUDE.md § Components, each render needs
the one-line comment naming `RichTextEditor` as its source.

**2. Headshot rides the existing upload route.** `src/app/api/upload/route.ts` and
`/api/files/[fileId]/route.ts` already do multipart and binary streaming, and the
allowlist (`uploads.ts:11-23`) already includes jpeg/png/webp. Wiring needed:
`FileUpload.contactId` + index; `ENTITY_DIRS.contact`; `ENTITY_FK_FIELD.contact`;
`getEntityTypeFromRecord` / `getEntityIdFromRecord` arms; and
`resolveEntityEventId` returning `null` for `contact` — same as `venue`, because
`Contact` is global, so `FILES` gating resolves at GLOBAL scope.

**3. New `SpeakerProfile`,** `@@unique([eventId, contactId])`, both FKs `Cascade`:
`arrivalAt` / `departureAt` / `travelNotes` / `hotel` / `hotelConfirmation`;
`dietary`, `avNeeds`; `honorarium Decimal?` + `honorariumStatus` (a
`honorarium_status` CustomOption); `shirtSize`; `notes` and `internalNotes` —
copying the split `Presentation` already draws (`schema.prisma:934-936`), which is
what makes a speaker-facing share view possible later; plus `updatedById`.

Deliberately **no** `EntityStatus` / `substatus`. Adding one drags in
`StatusModelType`, `EventStatusDefault`, `StatusDefaultsPanel`,
`WorkflowEntityType` and five switch arms per `docs/checklists/adding-entity.md`,
for a record whose lifecycle is "we filled it in".

**4. Roster is derived,** not stored: every `Contact` reachable via
`PresentationContact → Presentation.eventId`, unioned with speaker-role
`FunctionContact` rows. A curated join would immediately drift from the
presentations, and there is no data yet to justify maintaining it.

## Proposed UX

- **`/events/[id]/speakers`** — Archetype A list. Name, org, presentations, and
  completeness pills (bio ✓, headshot ✓, travel ✓, dietary ✓). Sidebar entry under
  "Content" next to Presentations.
- **`/events/[id]/speakers/[contactId]`** — Archetype C detail. Left: durable
  `Contact` fields (writes gated on `CONTACTS`). Right: the `SpeakerProfile` panel
  (gated on `PRESENTATIONS`). Headshot via `FileUploadPanel` with
  `entityType="contact"`.
- **On the presentation detail page**, a compact completeness chip per speaker
  next to `SpeakerList`, linking through — so the gap is visible where speakers
  are actually assigned.

**Permissions.** No new `PermissionResource`: durable fields ride `CONTACTS`
(GLOBAL), `SpeakerProfile` rides `PRESENTATIONS` (event-scoped). Note the trap in
`reviews/claudemd/candidates.md` — resolving a GLOBAL-only resource *with* an
`eventId` yields ASSIGNED → no row → NONE, so the two halves must be gated at
their own scopes, not in one call.

**Reports.** Feed `avNeeds` and `dietary` into the speaker blocks
`FunctionDetailReport.tsx` already renders from `presentationSlots → presentation
→ speakers` (`reports/data.ts:1381-1389`) — no new report, immediate value for
the AV lead and the caterer. A **Speaker Roster** report is the obvious next step
but splits into two audiences (bio + headshot for the program; travel + dietary +
honorarium for logistics), and the first is attendee-facing. That is exactly the
axis proposal **#49** covers — build the toggle there and the roster report gets
it free instead of inventing its own redaction.

## Files touched

- `prisma/schema.prisma` — `SpeakerProfile`, 5 `Contact` columns, `FileUpload.contactId`
- `src/lib/uploads.ts` — five arms listed above; `src/app/api/upload/route.ts` — contact branch
- `src/app/contacts/{ContactForm.tsx,core.ts,actions.ts}` — durable fields + headshot picker
- `src/app/events/speakers/` — `actions.ts`, `core.ts`, `SpeakerRosterList.tsx`, `SpeakerProfilePanel.tsx` (new)
- `src/app/events/[id]/speakers/page.tsx` and `[contactId]/page.tsx` (new)
- `src/components/EventSidebar.tsx` — `NAV` entry + `getActiveSection`
- `src/app/events/[id]/presentations/[presentationId]/page.tsx` — completeness chip
- `src/app/events/reports/data.ts` — widen the speaker select in `fdFunctionInclude`; `FunctionDetailReport.tsx`
- `src/lib/mcpTools/contacts.ts` — `get_speaker_profile` / `update_speaker_profile`

## Open questions for the owner

1. Is the durable/per-event split in the right place? Specifically, for a speaker
   who attends every year, is **travel** genuinely per-event, or is what you
   actually store a durable preference ("always flies into DFW, always the Hyatt")?
2. Is **honorarium in scope**? The schema stores money exactly once today and has
   no payment-status vocabulary.
3. **Permissions:** ride `CONTACTS` + `PRESENTATIONS` as proposed, or mint a
   `SPEAKERS` resource? A dedicated resource is the only way to let a program
   coordinator edit bios without edit rights on every contact in the system.
4. Is the roster **derived** from presentations (proposed), or must staff add a
   speaker who has no presentation yet — a keynote booked before the title exists?
   The second needs an explicit `EventSpeaker` join.

## Alternatives considered

- **Everything on `Contact`** — one surface, no join, but per-event facts collide
  across editions of the same series.
- **Key on `PresentationContact`** instead of `(event, contact)` — a speaker with
  two sessions would need two travel itineraries.
- **Headshot as a URL string** — no upload plumbing, but the app has a working
  private-file pipeline and an external URL leaks the image outside access control.
- **Reuse `EventKeyStaff`** (`schema.prisma:468-482`) as the roster join. It
  already links Event↔Contact with a `title` and `models[]`, but it means "our
  staff" and mixing speakers in pollutes every key-staff surface. Worth a second
  look only if question 4 answers "curated".

## Estimate

**Large — two PRs.** PR1 (~500 lines): durable `Contact` fields, the five
`uploads.ts` arms, headshot upload + display, contact form. Independently useful.
PR2 (~700 lines): `SpeakerProfile`, roster list + detail routes, sidebar,
presentation chip, Function Detail report fields, MCP tools. A Speaker Roster
report is a third PR and should wait on #49.
