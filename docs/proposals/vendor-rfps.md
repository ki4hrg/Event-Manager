# Proposal — Vendor RFPs (RFP tools phase 5)

Status: implemented (vendor RFPs, quotes, award, comparison, MCP, inbox
kinds). Follows docs/proposals/rfp-tools.md
(hotel RFPs, phases 1–4). Where this design and the code differ, the code
wins.

## As built

- Terms come from their own `rfp_term` list (Settings › RFPs › Terms, mergeable
  like concessions), not the hotel `rfp_concession` list; they're stored as
  `RfpConcession` rows on the vendor RFP and print as "Terms". Quotes record
  deposit, validity and cancellation as fields rather than per-term answers.
- The RFP document builder (`src/lib/rfp/document.ts`) serves every kind:
  vendor kinds turn on line items, terms, other requirements and a pricing
  response form; hotel-only parts are off.
- Line-item candidates: `rfpLineItemCandidatesCore` (`src/app/events/rfps/core.ts`)
  over the pure builders in `src/lib/rfp/lineItems.ts`. AV equipment
  includes the order's video section; a catering order contributes its meal
  (type · style, count) plus its line items; day and times come from the
  linked functions' own schedules (times only for a single sitting).
- Recipients picker: vendors tagged for the kind's order type, or untagged,
  are "Suggested"; for Other services, the vendors already on the event.
- Quotes: `src/app/events/quotes/` (core, actions, form, compare view,
  Accept). Files on a quote are `FileUpload.vendorQuoteId` (entity type
  `vendorQuote`). A standalone quote is guarded by EVENTS.
- MCP: `create_rfp` takes `kind` and `service`; `set_rfp_line_items`,
  `fill_rfp_line_items` (copies from orders, skipping items already
  copied); `add_rfp_recipients` takes `vendorIds`; `get_rfp_comparison`
  compares quotes on a vendor RFP; `src/lib/mcpTools/quotes.ts` has
  `list_vendor_quotes`, `get_vendor_quote`, `record_vendor_quote`,
  `update_vendor_quote`, `award_vendor_quote`, `delete_vendor_quote`.

## Problem

Hotel RFPs go out as a document, track who they went to, and line responses
up against the request. Everything else we buy for an event (AV, off-site
catering, print and signage, transportation, DMC, security) is still asked
for by email, and the quotes that come back live only as attachments. The
orders already hold what we need. AV orders list equipment, catering orders
list meals and counts, and print orders list items. None of it can be turned
into a request, and a quote can't be compared against one.

## Decisions

- **Kinds.** `RfpKind` gains `AV`, `CATERING`, `PRINT` and `OTHER`. An `OTHER`
  RFP names its service with an `rfp_service` option label (tenant defaults:
  Transportation, DMC, Security, Staffing, Photography), stored on
  `Rfp.service`.
- **Permissions** (`resourceForKind`): AV → `AV_ORDERS`, CATERING →
  `CATERING_ORDERS`, PRINT → `PRINT_ORDERS`, OTHER → `EVENTS`. OTHER has no
  order resource, and `VENDORS` guards the tenant catalog, not event work.
- **One RFPs page.** A new sidebar entry, `/events/[id]/rfps`, lists every RFP
  on the event. Hotel RFPs keep their routes under Hotels and link there.
  Vendor RFPs live at `/events/[id]/rfps/[rfpId]` (plus `/print`, `/compare`,
  `/compare/print`).
- **Line items are owned rows.** Like `RfpSpaceRequest`, a line item is
  *copied* from an order (it remembers its source, `SetNull`) or typed in by
  hand. A sent RFP then keeps exactly what was asked, even after the order
  changes. **Refresh from orders** re-copies the linked rows on request.
- **Recipients are vendors.** `RfpRecipient.vendorId` was already in the
  schema. The picker offers the tenant's vendors, with those tagged for the
  kind's model type listed first. `assertVendorInTenant` applies.
- **Responses are quotes.** A new `VendorQuote` (the vendor's price, with
  lines matched to the RFP's line items) plays the role `HotelProposal` plays
  for hotels. A quote may also stand alone, with no RFP.
- **Award assigns the vendor.** Accepting a quote marks it ACCEPTED. Work can
  be split, so several quotes on one RFP may be accepted; the confirm step
  offers to decline the RFP's other open quotes and close the RFP. It also adds the vendor to
  the event (`EventVendor`) and to every source order the line items came
  from (`AVOrderVendor` / `CateringOrderVendor` / `PrintOrderVendor`, skip
  existing). It's all one transaction, and undoing it is a manual edit.
- **No share surfaces**, as for hotel RFPs: prices and terms don't go on share
  links.

## Data model

```prisma
enum RfpKind { HOTEL AV CATERING PRINT OTHER }

model Rfp {
  // + for OTHER: an rfp_service option label
  service   String?
  lineItems RfpLineItem[]
  quotes    VendorQuote[]
}

// One thing asked for. Copied from an order (source ids remember which) or
// typed in. `group` is the heading it prints under (the order's name by
// default); day / times are event-local.
model RfpLineItem {
  id              String   @id @default(cuid())
  rfpId           String
  rfp             Rfp      @relation(..., onDelete: Cascade)
  group           String?
  description     String
  quantity        Int?
  unit            String?  // "each", "day", "hour", "person"
  day             DateTime? @db.Date
  endDay          DateTime? @db.Date
  startTime       String?
  endTime         String?
  notes           String?
  avOrderId       String?  // SetNull sources
  cateringOrderId String?
  printOrderId    String?
  equipmentItemId String?
  printItemId     String?
  sortOrder       Int      @default(0)
  quoteLines      VendorQuoteLine[]
}

enum QuoteStatus { RECEIVED ACCEPTED DECLINED }

// A vendor's price for an event: an answer to an RFP or standalone.
model VendorQuote {
  id          String   @id @default(cuid())
  eventId     String   // event-scoped (tenant via the event)
  vendorId    String
  rfpId       String?  // SetNull
  status      QuoteStatus @default(RECEIVED)
  reference   String?  // the vendor's quote number
  submittedOn DateTime? @db.Date
  validUntil  DateTime? @db.Date
  revision    Int      @default(1)
  // Fees not on a line: tax, service charge, delivery. Total = lines + these.
  serviceCharge Decimal? @db.Decimal(10, 2)
  tax           Decimal? @db.Decimal(10, 2)
  otherFees     Decimal? @db.Decimal(10, 2)
  depositDue    DateTime? @db.Date
  depositAmount Decimal?  @db.Decimal(10, 2)
  cancellationTerms String?
  notes       String?
  lines       VendorQuoteLine[]
  files       FileUpload[]   // + FileUpload.vendorQuoteId
  ...updatedBy, timestamps
}

// One priced line: an answer to an RFP line (rfpLineItemId) or extra.
model VendorQuoteLine {
  id            String   @id @default(cuid())
  quoteId       String
  rfpLineItemId String?  // SetNull
  description   String
  quantity      Decimal? @db.Decimal(10, 2)
  unitPrice     Decimal? @db.Decimal(10, 2)
  amount        Decimal? @db.Decimal(10, 2) // as quoted; else qty × unit
  notes         String?
  sortOrder     Int      @default(0)
}
```

`RfpRecipient` rows for vendor kinds carry `vendorId`. A recipient's state
comes from its quotes, as it does from proposals for hotels.

## Filling from orders

**Add from orders** opens a picker of the kind's orders. The rows each order
contributes:

| Kind | Per order | Rows |
|---|---|---|
| AV | `AVOrder` + its functions' schedule | one per `EquipmentItem` (item, qty, notes), grouped under the order name; day / times from the first linked function's schedule |
| CATERING | `CateringOrder` + function schedule | one per order: meal type, service style, count (`guaranteeCount ?? confirmedCount ?? expectedCount`), plus one per `CateringOrderLineItem`. No menus or money. |
| PRINT | `PrintOrder` | one per `PrintItem` (description, qty, distribution notes) |
| OTHER | — | typed in only |

The editor is a table (group, description, qty, unit, day, times, notes) with
add / remove / reorder, the same shape as `RfpSpaceEditor`.

## Document

The same `RfpDocument` builder and two renderers (`renderDocx`, print page).
Vendor kinds use these parts (`RFP_SECTIONS` gains the kinds):

- Cover / contact / event profile / dates: always on (shared with hotels).
- **Line items** (`lineItems`): by group, with day, times, qty, unit, notes.
- **Terms** (`concessions`): the `rfp_concession` list, with vendor-kind
  defaults (deposit schedule, cancellation, overtime rate, delivery window).
- **Other requirements** (`requirements`).
- **Response form** (`responseForm`): a price column per line, plus the fees
  and terms the quote form asks for.

## Comparison

`/events/[id]/rfps/[rfpId]/compare` (+ `/print`, .docx): one column per quote,
one row per RFP line item. Each cell shows the amount (unit × qty), and a
missing line is highlighted. Extra lines are listed per quote. Footer rows:
subtotal, fees, total, deposit, valid until. Mobile: one card per quote.
Built in `src/lib/rfp/compareQuotes.ts`, a plain module beside
`compare.ts`.

## Code layout

- Cores: `src/app/events/rfps/core.ts` gains `saveRfpLineItemsCore` and
  `fillRfpLineItemsCore`. Quotes get `src/app/events/quotes/core.ts`
  (`create/update/deleteVendorQuoteCore`, `awardVendorQuoteCore`) with
  `actions.ts` wrappers.
- Quote pages: `/events/[id]/rfps/[rfpId]/quotes/new?vendorId=` and
  `/events/[id]/quotes/[quoteId]`. A standalone quote is created from the
  RFPs page.
- MCP (`src/lib/mcpTools/rfps.ts`): `create_rfp` accepts the new kinds and
  `service`; `set_rfp_line_items`, `fill_rfp_line_items`; recipients take
  `vendorIds`; `list_vendor_quotes` / `get_vendor_quote`,
  `record_vendor_quote`, `award_vendor_quote`. `get_rfp_comparison` handles
  vendor kinds.

## Email ingest (email-ingest.md phase 4)

The inbox learns three more kinds. Each one is a proposal, and a person
applies it.

- **VENDOR_QUOTE**: the quote form, prefilled (vendor matched by sender or
  name, RFP when the vendor is a recipient, lines matched to the RFP's line
  items, fees, deposit, validity). Saving goes through
  `createVendorQuoteCore` and files the attachments on the quote.
- **BEO**: matched to a catering order. The review lists each field the BEO
  states next to the order's current value (counts, deadlines, service
  style, times, notes). The reviewer ticks what to take, and apply updates
  the order through its core and files the BEO on it. Menus are listed for
  reference, not merged.
- **CONTRACT**: matched to a hotel proposal, a vendor quote or a catering
  order. Key dates and terms (deposit, cut-off, attrition, cancellation) are
  shown against the target. Apply files the document on the target and
  writes the fields it has (for example catering deadlines, quote deposit,
  proposal attrition). Everything else goes into notes.
- **MCP**: `list_inbox_items` / `get_inbox_item` / `apply_inbox_item`
  (pickup, decline, and "apply as proposed" for the rest), plus
  `submit_inbox_item`. That tool stores a message with `origin: MCP`, the
  caller as a MEMBER sender, a text body and base64 attachments, and starts
  a read.

## Phases

1. Schema + migration, kinds, the RFPs page, the vendor RFP editor with line
   items and fill-from-orders, the document (print + .docx), and Issue.
2. Vendor recipients, quotes (form, pages, files), award.
3. Comparison (+ print, .docx).
4. MCP for vendor RFPs and quotes.
5. Inbox: VENDOR_QUOTE, BEO, CONTRACT; inbox MCP tools.
