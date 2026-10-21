# Proposal — RFP tools (hotels first, then other vendors)

Status: Stages 1–4 (hotel RFP, document export, recipients and responses, bid comparison, MCP) implemented, then revised after first use: block type split into contract type + guest type, Run of House as a room type, RFP-owned function-space rows, requested dates / peak rooms, and an APEX-ordered document. Stage 5 (other vendor kinds) implemented per docs/proposals/vendor-rfps.md. Implementation notes in docs/hotels.md § RFPs; where this design and the code differ, the code and docs/hotels.md win.

## Problem

The hotel module tracks what hotels *send back*, not what we *ask for*.

- `HotelProposal` (`prisma/schema.prisma`, `HotelProposal`) is one hotel's offer:
  a `proposal_status` whose group is the stage (REQUESTED / PENDING / ACCEPTED /
  DECLINED), a room × night grid, charges, attrition, amenities, revisions with
  diffs, files. ACCEPTED → `HotelBlock`.
- `/hotels/reports?view=pattern` ("RFP pattern") proposes a room block from
  series pickup history (`proposeNights` in `src/lib/hotelPattern.ts`), but the
  result is a CSV. The aggregation (average / highest / latest, ± adjust) is
  inline in `src/app/hotels/reports/page.tsx` and can't be reused.

Missing:

1. **The request itself.** Requested blocks and pattern, target rates, response
   due date, concessions we want, meeting space and F&B needs.
2. **Who it went to.** REQUESTED is the only trace — no sent date, no
   "no response / overdue / declined to bid".
3. **An RFP document** to send (.docx, print/PDF).
4. **Bid comparison** of responses against the request.

## Decisions taken

- **Generic RFP header + per-kind detail.** One `Rfp` table for every kind;
  hotels attach requested blocks. Later kinds add their own detail tables
  without re-migrating the shared parts.
- **Document content**, each part optional per RFP: room blocks, meeting space
  (from functions), F&B summary (from catering orders), concessions / terms
  wishlist, event profile / history (series pickup + attendance).
- **Block kinds**: an RFP can request several blocks, each typed with the
  existing `HotelBlockType` — CONTRACT (contract attendee), COURTESY (courtesy
  attendee), STAFF (contract staff). No enum change.
- **Exports**: .docx + a `/print` route (Print / Save PDF). No .xlsx in phase 1.

## Data model

```prisma
enum RfpKind {
  HOTEL
  // AV, CATERING, TRANSPORTATION, DMC, ... added in phase 5
}

enum RfpStatus {
  DRAFT      // being written
  ISSUED     // sent; responses coming in
  CLOSED     // decision made (awarded or not)
}

// What we ask vendors for. Event-scoped (tenant via the event).
model Rfp {
  id             String         @id @default(cuid())
  eventId        String
  event          Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  kind           RfpKind
  title          String
  status         RfpStatus      @default(DRAFT)
  responseDue    DateTime?      @db.Date
  decisionBy     DateTime?      @db.Date
  issuedOn       DateTime?      @db.Date
  // Optional document parts that are on — validated against RFP_SECTIONS
  // (src/lib/rfp/sections.ts): "blocks", "meetingSpace", "fb", "concessions",
  // "history", "requirements". Kind decides which keys apply.
  sections       String[]       @default([])
  introduction   String?        // RichTextEditor HTML
  requirements   String?        // RichTextEditor HTML — anything not structured
  // Our point of contact printed on the document.
  contactId      String?
  contact        Contact?       @relation(fields: [contactId], references: [id], onDelete: SetNull)
  // Meeting-space part: room names are usually left for the hotel to assign.
  showRoomNames  Boolean        @default(false)
  recipients     RfpRecipient[]
  concessions    RfpConcession[]
  hotelBlocks    RfpHotelBlock[]
  hotelProposals HotelProposal[]
  files          FileUpload[]
  updatedById    String?
  updatedBy      User?          @relation("RfpUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([eventId])
}

// Who the RFP went to. Hotels are Venues (isLodging); other kinds are Vendors.
model RfpRecipient {
  id            String    @id @default(cuid())
  rfpId         String
  rfp           Rfp       @relation(fields: [rfpId], references: [id], onDelete: Cascade)
  venueId       String?
  venue         Venue?    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  vendorId      String?
  vendor        Vendor?   @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  sentOn        DateTime? @db.Date
  declinedToBid Boolean   @default(false)
  notes         String?

  @@unique([rfpId, venueId])
  @@unique([rfpId, vendorId])
}

// Terms / concessions wished for. Labels come from a new `rfp_concession`
// CustomOption list (tenant defaults: comp ratio, attrition, cut-off, rate
// cap, deposit schedule, Wi-Fi, parking, upgrades…); value is free text
// ("1/40", "20%", "30 days").
model RfpConcession {
  id        String  @id @default(cuid())
  rfpId     String
  rfp       Rfp     @relation(fields: [rfpId], references: [id], onDelete: Cascade)
  label     String
  value     String?
  required  Boolean @default(false) // must-have vs nice-to-have
  sortOrder Int     @default(0)
}

// One requested hotel block (contract attendee / courtesy attendee / staff).
model RfpHotelBlock {
  id           String              @id @default(cuid())
  rfpId        String
  rfp          Rfp                 @relation(fields: [rfpId], references: [id], onDelete: Cascade)
  blockType    HotelBlockType
  isRunOfHouse Boolean             @default(false)
  targetRate   Decimal?            @db.Decimal(10, 2)
  notes        String?
  sortOrder    Int                 @default(0)
  nights       RfpHotelBlockNight[]
  proposals    HotelProposal[]
}

model RfpHotelBlockNight {
  id       String        @id @default(cuid())
  blockId  String
  block    RfpHotelBlock @relation(fields: [blockId], references: [id], onDelete: Cascade)
  roomType String?       // null = run of house
  night    DateTime      @db.Date
  rooms    Int

  @@unique([blockId, roomType, night])
}
```

`HotelProposal` gains `rfpId String?` and `rfpBlockId String?` (both
`SetNull`). A hotel answering two requested blocks returns two proposals — one
per block — which keeps `HotelProposal` ↔ `HotelBlock` 1:1 and block-typed.
Proposals without an RFP keep working (ad-hoc offers, imported history).

**Concession responses** (phase 3): `HotelProposalConcession { proposalId,
concessionId, offered String?, met MET | PARTIAL | NOT_MET }` so the comparison
can line responses up against each requested term. Until then, the existing
amenities / charges / attrition fields cover it.

**Derived, not stored**: meeting space and F&B are read live from functions and
catering orders when the document renders, so the RFP never drifts from the
schedule. To keep a record of exactly what was sent, **Issue** renders the
.docx and attaches it to the RFP as a `FileUpload` (`file_type` "RFP"), stamps
`issuedOn`, and moves DRAFT → ISSUED. Re-issuing attaches a new file.

## Document parts

| Part | Source | Notes |
|---|---|---|
| Cover / introduction | `Rfp.introduction`, event name, dates, `responseDue`, `decisionBy`, contact | Always on. |
| Room blocks | `RfpHotelBlock` + nights | One grid per block: room type × night, peak night, total room nights, target rate. |
| Meeting space | Event functions (not off-site) + `FunctionSchedule` | Date, time range (`formatTimeRange`), function name (`formatFunctionLabel`), setup style, attendance (`setForCount ?? expectedAttendance`), 24-hr hold. Room names only when `showRoomNames`. |
| F&B | `CateringOrder` linked to functions | Date, meal type, service style, expected count. No menus or money. |
| Concessions | `RfpConcession` | Two groups: required, requested. |
| Event profile / history | Series events via the pattern builder | Past events: dates, attendance, peak night, room nights, pickup %. Ended events only. |
| Additional requirements | `Rfp.requirements` | Rich text. |

Builder: `src/lib/rfp/assemble.ts` → a plain `RfpDocument` shape (like
`EsgDocument`). Rendered by `src/lib/rfp/renderDocx.ts` (lazy-imported) and by
the print page. One shape, two renderers.

## Pattern reuse

Move the aggregation out of `src/app/hotels/reports/page.tsx` into
`src/lib/hotelPattern.ts` (`buildPattern(events, { basis, adjust })` returning
the per-role figures). Then:

- The RFP block editor gets **Fill from history**: series (defaults to the
  event's), basis (average / highest / latest), ± adjust → `proposeNights` over
  the event dates → fills the grid. Editable afterwards.
- The pattern report's "Proposed block" gains **Use in RFP** when the target is
  an event the user can write.

## Routes and UI

All under the event's Hotels area, `HOTELS` permission. Not a report under
`/reports` — RFPs go out as files, and contract terms shouldn't be on a share
link, so no share surfaces.

- `/events/[id]/hotels` — new **RFPs** section above Proposals: title, status,
  due date, "3 sent · 2 responded · 1 overdue".
- `/events/[id]/hotels/rfps/new` → detail on create (needs further setup).
- `/events/[id]/hotels/rfps/[rfpId]` — Archetype C. Main column: details form
  (title, dates, contact, intro, requirements, part toggles), blocks (grid
  editor — reuse `RoomGrid` / the `ProposalForm` grid, extracted), concessions.
  Side column: recipients, files (issued copies), actions (Print, Download
  .docx, Issue).
- `/events/[id]/hotels/rfps/[rfpId]/print` — `PrintHeader` + document.
- `/events/[id]/hotels/rfps/[rfpId]/compare` (+ `/print`) — one column per
  proposal linked to the RFP, grouped by block: rooms per night vs requested
  (shortfall highlighted), average rate vs target, total room revenue,
  attrition, cut-off, concessions met. Mobile: one card per proposal.
- `api/events/[id]/rfps/[rfpId]?format=docx&doc=rfp|compare` — binary stream
  (Archetype G), `requirePermission("HOTELS", "VIEW", eventId)` first. Add to
  CLAUDE.md's route-handler list.

**Recipients**: add hotels (lodging venues in the tenant; `assertVenueInTenant`),
set sent date, mark declined to bid. Each recipient row shows its state —
*not sent / awaiting (due in 5 days) / overdue / declined / responded (n
proposals)* — and a **Record response** button that opens the new-proposal page
with `?rfpBlockId=` so the proposal starts as a copy of the requested block
(dates, nights, block type). Staff then edit only the differences.

## Permissions and tenancy

- `Rfp` is event-scoped: `where: { id, eventId }`; children through
  `{ rfp: { eventId } }`. Kind → resource map in `src/lib/rfp/kinds.ts`
  (`HOTEL → HOTELS`); every action calls `requirePermission(resourceFor(kind), …, eventId)`.
- Cores in `src/app/events/rfps/core.ts` (no `"use server"`), Server Action
  wrappers in `actions.ts`, MCP tools in `src/lib/mcpTools/rfps.ts`.

## Phases

1. **Hotel RFP + document.** Schema/migration, `rfp_concession` defaults in
   `prisma/tenantDefaults.mjs`, pattern extraction, RFP editor, `/print`,
   .docx download, Issue (attach file).
2. **Recipients + responses.** Recipients panel, status on the Hotels page,
   Record response (prefilled proposal), `rfpId`/`rfpBlockId` on proposals.
3. **Comparison.** Compare view, `/print`, .docx; `HotelProposalConcession`.
4. **MCP.** `list_rfps` / `get_rfp`, create / update, add recipient,
   record response — following the list/get and `*Core` conventions.
5. **Other vendor kinds.** Separate proposal. Sketch: `RfpLineItem { category,
   description, quantity, notes }` filled from existing orders (AV orders →
   equipment list, setup orders → tables/staging, catering orders off-site),
   plus a generic `VendorQuote` response with line-item pricing. Candidate
   kinds: AV, off-site catering, transportation, DMC, print, security.

## Decisions

The Stage 1 questions, as settled:

- **Several RFPs per event.** Yes (an HQ hotel RFP alongside an overflow or
  courtesy one to a different hotel set).
- **Meeting-space scope.** Every on-site function, with per-RFP function-type
  exclusions (`Rfp.excludedFunctionTypes`).
- **Block types.** Relabelled for the RFP, then split into a contract type and
  a `hotel_guest_type` option (`blockTypeLabel`), which also covers a courtesy
  staff block without a fourth enum value.
- **Branding.** No letterhead or tenant logo on the .docx.
- **Existing REQUESTED proposals.** Not backfilled into RFPs.
- **Point of contact.** Picked from the event's key staff.

`RfpRecipient` and `HotelProposal.rfpId/rfpBlockId` shipped in the Stage 1
migration, unused until Stage 2.
