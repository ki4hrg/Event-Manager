# Proposal — Email ingest (per-event inbox)

Status: Phase 1 (inbox without AI) implemented. Phase 2 (pickup parsing) and
Phase 3 (RFP responses) next. Where this design and the code differ, the code
wins.

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
  forwarding hotel mail is trusted.
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
- **Unrouted mail** (`/inbox`, header link while any is waiting): Held / Done
  tabs; Route to an event re-matches the sender against that event.
- Event Settings › **Inbox**: the address, copy, change, turn off.

## Parsing (phase 2–3)

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
2. **Pickup.** Parsing for `PICKUP_GUESTS` / `PICKUP_COUNTS`, review with an
   import preview, apply through the pickup cores.
3. **RFP responses.** `RFP_PROPOSAL` / `RFP_DECLINE`; the RFP page shows the
   event address for use as the Reply-To.
4. **Later.** Other kinds (vendor quotes, BEOs (banquet event orders),
   contracts), MCP `list_inbox_items` / `get_inbox_item` / `apply_inbox_item`,
   and an `origin: MCP` submit tool.
