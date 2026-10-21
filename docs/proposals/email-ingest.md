# Proposal — Email ingest (per-event inbox)

Status: Phases 1–4 implemented (inbox, pickup parsing, RFP responses, MCP, vendor quotes / BEOs / contracts).
Where this design and the code differ, the code wins.

## Problem

Hotel paperwork arrives by email and is keyed in by hand:

- **Pickup reports.** Hotels send them on a schedule as CSV / XLSX guest
  lists, PDF reports, or plain nightly totals in the email body. Today someone
  downloads the attachment and runs the CSV wizard (`PickupImport.tsx` →
  `importPickupGuestsCore`) or types counts into `savePickupCountsCore`.
- **RFP responses.** After an RFP is issued, hotels reply with a proposal
  (usually a PDF), a decline, or a question. Today *Record response* opens a
  blank proposal prefilled only from the requested block, and the rest is
  typed in from the PDF.

## Goal

Each event gets an address, `<org>.<event>@eventmanage.net` (e.g.
`acme.gala-2027@eventmanage.net`). Mail sent there is stored on the event, and
Claude reads it and *proposes* a record. Staff review each proposal in the
event's inbox, then apply it or dismiss it. Staff can forward mail from their
own mailbox, and hotels can be asked to send to the event address directly:
put it in each hotel's pickup-report distribution list, and set it as the
Reply-To on issued RFPs.

## Decisions

- **Claude proposes, a person applies.** The model never writes domain rows.
  Each proposal is the typed arguments for an existing core
  (`importPickupGuestsCore`, `savePickupCountsCore`,
  `createHotelProposalCore` with `rfpId` / `rfpBlockId`,
  `updateRfpRecipientCore`). **Apply** calls that core as the reviewing user,
  so permissions, event ownership, snapshots and business rules stay in one
  place. Mail from outside is untrusted, and so are the model's reading of it
  and any instructions inside it.
- **Transport: Cloudflare Email Routing → Email Worker → signed POST.** DNS is
  on Cloudflare and the apex receives no other mail, so the catch-all sits on
  `eventmanage.net`. Push, not pull: no poller, no IMAP credentials, no extra
  container. Expense Tracker's approach (an `email-worker` container polling
  one Stalwart mailbox over IMAP every 5 min) was the alternative.
- **Address = org slug + event slug, split on a dot.** Slugs are `[a-z0-9-]`,
  so the dot is unambiguous. Event inbox names are unique per org. Changing an
  org's slug changes every event address in it (the tenant form says so).
- **Unknown senders are held.** Mail from anyone who isn't a member of the org
  or a contact tied to the event lands in **Held** and is not read by Claude
  until someone releases it.
- **Known org, unknown event → Unrouted.** Stored for the org (always Held)
  and listed at `/inbox`, where staff route it to an event. An unknown org or
  a malformed address bounces.
- **Store first, read after.** The route stores the message and returns; a
  model failure never loses mail.
- **Retention.** Dismissed items (row, raw .eml, attachments) are purged 90
  days after dismissal. Applied items stay with the event.

## Transport

```
hotel / staff ──SMTP──▶ Cloudflare Email Routing (catch-all on eventmanage.net)
                          │
                          ▼
                 Email Worker  (workers/email-inbound/)
                   POST /api/inbound-email   body: raw MIME
                     X-Envelope-To / X-Envelope-From
                     X-Timestamp, X-Signature = hex HMAC-SHA256(secret, "<ts>.<body>")
                   404 → message.setReject()  (bounce)
                   other non-2xx → throw      (delivery fails, nothing silently lost)
```

Setup steps: `workers/email-inbound/README.md`.

## Addressing and matching (implemented)

- `Event.inboxSlug`, `@@unique([tenantId, inboxSlug])`; set in event Settings ›
  Inbox (suggested from name + year, editable, can be turned off).
- `parseInboxAddress()` (`src/lib/inboundMail.ts`) lowercases, drops a
  `+tag`, checks the domain, splits on the first dot.
- Sender matching (`matchSender`, `src/app/events/inbox/core.ts`): MEMBER — an
  account in the org; CONTACT — an org contact (by email, case-insensitive)
  at one of the event's venues, a hotel it has a proposal from or an RFP out
  to, one of its vendors, or its key staff. Mail that named no event is
  always Held.
- Forwards: the original sender is recovered from a forward-as-attachment or
  quoted forward headers (ported from Expense Tracker's `forwarded.ts`) and
  shown as "Originally". Matching uses the actual sender, so a member
  forwarding hotel mail is trusted. ORG_CONTACT — any other contact of the org
  (and every known contact on Unrouted mail): labels the sender in blue but
  stays Held, since the address isn't tied to this event.
- Dedupe per recipient address: `<to>:msgid:<Message-ID>` (or a content
  hash). A Worker retry is a no-op; one message to two inboxes is two items.

## Data model (implemented)

`InboundEmail` (tenant-owned; `eventId` null = Unrouted): sender / forwarded
from / subject / received / text body / Authentication-Results / sender match,
`status` (`HELD`, `RECEIVED`, `PARSED`, `APPLIED`, `DISMISSED`, `FAILED`),
`kind` / `proposal` / `model` / `error` for phase 2, and `handledBy` /
`handledAt` (release, dismiss, move; drives the purge).

Files are `FileUpload`s with `inboundEmailId`, stored under
`inbound-emails/<id>/`: the raw message (`fileType` `EMAIL_SOURCE`) and every
attachment, including those inside a forwarded message (signature images
excluded). They can't be uploaded through `/api/upload`. *File on event*
copies an attachment to the event's Files with the same `storedName`, which
is how the item shows it as filed; the purge never touches the copy. File
downloads of Unrouted items also check the org (`inboundFileTenantId`).

## UI (implemented)

- Event › **Inbox** (sidebar, `HOTELS` VIEW): tabs Inbox (Received / Ready /
  Failed), Held, Done. Item page: text body (HTML is never rendered),
  attachments with *File on event*, the original .eml, sender and SPF / DKIM /
  DMARC badges; actions Release, Dismiss, Restore, Move to another event
  (`HOTELS` WRITE).
- **Org inbox** (`/inbox`, header link "Inbox (n)" counting open items): the
  same tabs across every event the user can see, plus Unrouted mail (always
  Held; Route to an event re-matches the sender against that event). Event
  items open on their event's inbox.
- A page showing an item being read refreshes itself until the read lands.
- Event Settings › **Inbox**: the address, copy, change, turn off.
- **Diagnostics** (the raw .eml, SPF / DKIM / DMARC badges, the model that
  read an item) show only to super admins and to accounts a super admin marks
  *Show diagnostics* on the user page (`User.showDiagnostics`,
  `canSeeDiagnostics` in `src/lib/tenant.ts`).

## Parsing (phase 2 implemented for pickup; phase 3 adds the RFP kinds)

Implemented in `src/lib/inboundParse.ts` (the call) and
`parseInboundEmail` / `applyInboundPickupCore` in
`src/app/events/inbox/core.ts`. Review: `InboxReview.tsx` on the item page.

- A parse starts, without being awaited, when an item becomes Received
  (delivery from a known sender, Release, Move / Route). The item reads
  *Received* ("Reading…") until it lands as Ready to review or Failed.
  **Re-read** runs it again (also for an item a restart left Received).
- Spreadsheets (CSV, XLSX via `src/lib/spreadsheetRows.ts`): the model sees
  the first 25 rows numbered, and returns the header row, a column mapping,
  the cancelled statuses and a room-type map. The review is the CSV wizard
  (`GuestImport`, now fed a `source`) prefilled with that mapping, so the
  reviewer can correct any of it; the mapping and row → guest step live in
  `src/lib/pickupMapping.ts`, shared with the wizard.
- PDFs and guest lists in the body: guest rows from the model, with each
  room type kept as the report writes it (hotel codes such as NKR) and a
  proposed code → room type map. They go through the same wizard, so the
  mapping can be corrected before importing. Codes map to the block's own
  room types, or to the org's when the block doesn't list the type (a Run of
  House block still records what each guest booked; pickup math counts them
  against Run of House).
- Counts: the wizard's count grid prefilled for the chosen block; proposed
  counts for a room type or night the block doesn't have are listed, not
  saved.
- Apply claims the item (PARSED → APPLIED) before importing, so a second click
  can't import twice, and puts it back if the import fails. The block it went
  to is kept in `proposal.blockId`.
- No API key (`ANTHROPIC_API_KEY` blank): nothing is read; the inbox works as
  in phase 1.

Design notes, as planned:

One pass per Received message. Inputs:

- the text body;
- **PDF attachments** as `document` content blocks;
- **CSV / XLSX attachments**: the header row plus the first ~20 rows as text
  (`exceljs` / `papaparse` are already dependencies);
- **candidates**: the event's blocks (hotel, dates, room types), issued RFPs
  with their recipients and requested blocks, plus today's date and the
  event's timezone.

Output: structured output (`output_config.format`) with a JSON schema for
`{ kind, targetId, confidence, notes, args }`:

| kind | args | Apply calls |
|---|---|---|
| `PICKUP_GUESTS` (spreadsheet) | **column mapping**: header → field, which status values mean cancelled, room-type map | the CSV wizard's mapping (moved to `src/lib/pickupMapping.ts`), then `importPickupGuestsCore` (MERGE) |
| `PICKUP_GUESTS` (PDF) | guest rows | `importPickupGuestsCore` (MERGE) |
| `PICKUP_COUNTS` | night × room type → rooms | `savePickupCountsCore` |
| `RFP_PROPOSAL` | proposal fields, night grid, rates, concession answers | `createHotelProposalCore` with `rfpId` / `rfpBlockId` |
| `RFP_DECLINE` | reason | `updateRfpRecipientCore` (`declinedToBid`, notes) |
| `OTHER` | summary | nothing; file the attachments or dismiss |

For spreadsheets the model returns a mapping, not rows: one small request, and
every row comes from the deterministic parser already used for manual
imports.

Model and settings: `claude-opus-5-5` at `effort: "low"` with structured
outputs and `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
`stop_reason` is checked before reading the output; a refusal or invalid
output marks the item FAILED with the reason, and Re-parse runs it again.
Release and Route start a parse for an item that becomes Received.

**Prompt injection.** Email text goes in as quoted data, the call has no
tools, and its output is only ever a proposal a person reviews.

## Config

`INBOUND_EMAIL_DOMAIN` and `INBOUND_EMAIL_SECRET` (phase 1), plus
`ANTHROPIC_API_KEY` (phase 2), are read in `@/lib/email` per the env-var rule.
Both inbound values blank turns the route off (503) and the settings panel
says it isn't configured.

## Phases

1. **Inbox without AI** — done.
2. **Pickup** — done. Parsing for `PICKUP_GUESTS` / `PICKUP_COUNTS`, review
   in the import wizard, apply through the pickup cores.
3. **RFP responses** — done. `RFP_PROPOSAL` opens the proposal form filled
   from the offer (hotel, RFP block, dates, night grid with rates,
   charges, attrition, amenities, concession answers, notes); saving creates
   the proposal through `createHotelProposalCore` and files the message's
   attachments on it. When the hotel already has a proposal for the event,
   the review defaults to *Revision of* it: the form opens on the next
   revision, what the offer states (dates, grid, charges, terms, amenity
   statuses, concession answers) replacing the proposal's values and the rest
   carried over, and saving goes through `updateHotelProposalCore`, so the
   version history shows what changed. *New proposal* stays available. `RFP_DECLINE`
   marks the hotel declined on the RFP (`updateRfpRecipientCore`), keeping
   its sent date and adding the reason to its notes. The RFP page shows the
   event's address as the Reply-To. Context given to Claude: the event's
   RFPs (blocks, recipients, concessions) and candidate hotels (recipients,
   hotels with a proposal, the sender's own hotel).
   An offer from a hotel not on file: an existing venue with the offer's
   hotel name is picked; otherwise the Hotel dropdown offers **New hotel:
   <name>**, whose fields (prefilled from the offer: name, address, sales
   contact) open under it, and saving creates it as a lodging venue with that
   contact (VENUES WRITE) along with the proposal.
   The form's **Source** picks the RFP block the offer answers, or
   **Standalone proposal** (no RFP, no concessions). It defaults to the block
   Claude read it as, which it sets only when the offer responds to that RFP.
   Amenities are read as statuses against the hotel's profile: Confirmed when
   the offer commits to one, Unavailable when it says it's out for the event;
   unmentioned ones are left out. Concessions offered unasked must be on the
   concession list (others go in the notes); a new hotel's profile starts
   with the confirmed amenities.
   Reading is two calls: classify (kind, summary, notes), then only that
   kind's fields — one schema for every kind compiled to a grammar the API
   rejected as too large.
4. **MCP and more kinds.** MCP (`src/lib/mcpTools/inbox.ts`) — done:
   `list_inbox_items` (one event, or org-wide with Unrouted), `get_inbox_item`,
   `apply_inbox_item` (applies a Ready item as read, without the review form:
   pickup counts / guests to a block, a decline, an offer as a proposal —
   `applyInboundAsProposedCore`), `release_inbox_item`, `route_inbox_item`,
   `dismiss_inbox_item`, and `submit_inbox_item`, which stores a message
   from the caller (`origin: MCP`, a MEMBER sender, text and base64
   attachments) and reads it like delivered mail
   (`submitInboundItemCore`). New kinds — done (see
   docs/proposals/vendor-rfps.md § Email ingest): **VENDOR_QUOTE** opens the
   quote form prefilled (vendor or *New vendor*, the vendor RFP it answers or
   standalone, lines priced against that RFP's line items) and records it
   with the attachments filed on the quote (`applyInboundQuoteCore`);
   **BEO** shows each field it states beside the catering order's value,
   ticked where they differ, and writes the ticked ones and files the BEO
   (`applyInboundBeoCore`); **CONTRACT** picks the hotel proposal, vendor
   quote or catering order it covers, writes the terms that record holds
   (attrition / valid until; deposit / cancellation; deposit deadline /
   cancellation) and puts the rest in its notes (`applyInboundContractCore`).
   Context given to Claude adds the event's vendors, vendor RFPs with line
   items, catering orders, and contract targets.
