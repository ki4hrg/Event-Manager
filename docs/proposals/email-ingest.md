# Proposal — Email ingest (per-event inbox)

Status: proposed. Nothing built yet.

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

Each event gets an address, `<inboxSlug>@eventmanage.net`. Mail sent there is
stored on the event, and Claude reads it and *proposes* a record. Staff review
each proposal in a per-event inbox queue, then apply it or dismiss it.
Staff can forward mail from their own mailbox, and hotels can be asked to send
to the event address directly: put it in each hotel's pickup-report
distribution list, and set it as the Reply-To on issued RFPs.

## Decisions

- **Claude proposes, a person applies.** The model never writes domain rows.
  Each proposal is the typed arguments for an existing core
  (`importPickupGuestsCore`, `savePickupCountsCore`,
  `createHotelProposalCore` with `rfpId` / `rfpBlockId`,
  `updateRfpRecipientCore`). **Apply** calls that core as the reviewing user,
  so permissions, event ownership, snapshots and business rules stay in one
  place. Mail from outside is untrusted, and so are the model's reading of it
  and any instructions inside it.
- **Transport: Cloudflare Email Routing → Email Worker → signed POST to the
  app.** The DNS is already on Cloudflare. This is push, not pull: the app
  needs no poller, no IMAP credentials and no extra container on docker-peter.
  Expense Tracker's approach (an `email-worker` container polling one Stalwart
  mailbox over IMAP every 5 min) was the alternative; see
  [Transport](#transport) for the trade-off.
- **One shared queue per event, tagged by origin.** The same model as
  Expense Tracker's `ReceiptInbox` (`origin` EMAIL / MCP). A future MCP
  `submit_inbox_document` tool lands in the same queue.
- **Store first, parse second.** The webhook stores the message and returns at
  once. Parsing runs after it, and a failed parse can be re-run from the
  queue. Mail is never lost to a model error.

## Addressing

- `Event.inboxSlug String? @unique`. Unique across all tenants, since the
  domain is shared. It is not called `slug`, because `Tenant.slug` already
  exists.
- Generated on first use from the event name + year (`gala-2027`), editable in
  event settings, with a collision suffix. Clearing it turns the inbox off.
- Plus-addressing is accepted and ignored (`gala-2027+hilton@…` → `gala-2027`).
  Staff can use it to label a source.
- An unknown slug is rejected at the edge (the Worker calls `setReject`), so
  the app never stores mail it can't attach to an event, and senders get a
  bounce instead of silence.

## Transport

```
hotel / staff ──SMTP──▶ Cloudflare Email Routing (catch-all on the domain)
                          │
                          ▼
                 Email Worker  (worker/email-inbound/, ~60 lines)
                   - reads message.raw (≤ 25 MiB)
                   - POST /api/inbound-email
                       body: raw MIME
                       headers: X-Envelope-To, X-Envelope-From,
                                X-Signature (HMAC-SHA256 over timestamp + body)
                   - app 404 (unknown slug)  → message.setReject("No such event inbox")
                   - app 5xx / network error → throw (Cloudflare retries / bounces)
                          │
                          ▼
                 Event Manager  POST /api/inbound-email
```

Why this over Stalwart:

| | Cloudflare Worker | Stalwart + IMAP poller (Expense Tracker) |
|---|---|---|
| Delivery | Push, seconds | Poll, up to 5 min |
| New infra | A Worker (free tier) | A worker container + a mailbox |
| Unknown address | Rejected at SMTP time | Lands in catch-all, handled later |
| Mail exposure | No mail ports on our host | Stalwart exposed for the domain |
| Fit | A route handler, like `/mcp` and `/api/upload` | Needs a long-running process the app doesn't have |

Expense Tracker code to port (not the transport):
`worker/email-ingest/forwarded.ts` (recovering the original sender from
inline forwards and `message/rfc822` attachments — staff forwarding hotel mail
is the main path here too), `buildMessageBaseKey` (message-id or content-hash
dedupe), and `mailparser` for MIME. Its regex extractor and global
`AllowedSender` table don't carry over: Claude does the extraction, and
trust is per tenant (below).

**Domain check before turning it on:** Email Routing takes over the MX
records for whatever (sub)domain it's enabled on. If `eventmanage.net` already
receives other mail, enable it on a subdomain (`in.eventmanage.net`) instead.

## Data model

```prisma
enum InboundOrigin { EMAIL MCP }

enum InboundStatus {
  RECEIVED  // stored, not parsed yet
  PARSED    // proposal ready for review
  APPLIED
  DISMISSED
  FAILED    // parse error; re-runnable
}

model InboundEmail {
  id            String        @id @default(cuid())
  eventId       String
  event         Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  origin        InboundOrigin @default(EMAIL)
  dedupKey      String        @unique // msgid:<id> | hash:<sha256>
  envelopeTo    String
  sender        String        // envelope / From: — whoever mailed the inbox
  forwardedFrom String?       // original sender recovered from a forward
  subject       String?
  receivedAt    DateTime
  textBody      String?       @db.Text
  rawStoredName String        // .eml under UPLOAD_DIR
  // Verdicts Cloudflare passed on (SPF / DKIM / DMARC) and who we matched.
  authResults   String?
  senderMatch   String?       // "member" | "venue-contact" | "vendor-contact" | null
  status        InboundStatus @default(RECEIVED)
  kind          String?       // PICKUP_GUESTS | PICKUP_COUNTS | RFP_PROPOSAL | RFP_DECLINE | OTHER
  proposal      Json?         // typed args for the target core + match ids
  model         String?
  error         String?
  appliedById   String?
  appliedBy     User?         @relation(fields: [appliedById], references: [id], onDelete: SetNull)
  appliedAt     DateTime?
  files         FileUpload[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([eventId, status])
}
```

`FileUpload.inboundEmailId` holds the attachments, so the hotel's original
PDF / spreadsheet stays on the event whether or not it's applied. On apply,
the files are also linked to the record they produced (`hotelProposalId`, or
the block's import).

## Parsing

One pass per message. Inputs:

- the text body (the HTML part converted to text when there's no plain part);
- **PDF attachments** as `document` content blocks (the API reads PDFs
  natively);
- **CSV / XLSX attachments**: the header row plus the first ~20 rows as text
  (`exceljs` is already a dependency). Not the whole file.
- **candidates**: the event's blocks (hotel, dates, room types), issued RFPs
  with their recipients and requested blocks, plus today's date and the
  event's timezone.

Output: structured output (`output_config.format`) with a JSON schema for
`{ kind, targetId, confidence, notes, args }`. `args` is a discriminated
union, one shape per kind:

| kind | args | Apply calls |
|---|---|---|
| `PICKUP_GUESTS` (spreadsheet) | **column mapping**: header → field, date format, which status values mean cancelled | the CSV wizard's parser, then `importPickupGuestsCore` (MERGE) |
| `PICKUP_GUESTS` (PDF) | guest rows | `importPickupGuestsCore` (MERGE) |
| `PICKUP_COUNTS` | night × room type → rooms | `savePickupCountsCore` |
| `RFP_PROPOSAL` | proposal fields, night grid, rates, concession answers | `createHotelProposalCore` with `rfpId` / `rfpBlockId` |
| `RFP_DECLINE` | reason | `updateRfpRecipientCore` (`declinedToBid`, notes) |
| `OTHER` | summary | nothing; file the attachments or dismiss |

For spreadsheets the model returns a mapping, not rows. A 400-guest report
then costs one small request, and every row comes from the deterministic
parser already used for manual imports, so the numbers are exact.

Model and settings: `claude-opus-5-5` at `effort: "low"` with structured
outputs, and `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`)
so a classifier refusal on hotel paperwork falls back instead of failing.
Raise effort only if a sample of real reports shows misses. `stop_reason` is
checked before reading the output; a refusal or invalid output marks the item
FAILED with the reason.

**Prompt injection.** Email text goes into the user turn as quoted data. The
call has no tools, and its output is only ever a proposal a person reviews.
The worst a hostile email can do is propose a wrong record.

## Review queue

- `/events/[id]/inbox` (sidebar entry under Hotels while hotels are the only
  kinds): a list of sender, subject, kind, status and age, plus an unread count
  on the sidebar link.
- The item page shows the email on the left: text body, attachments (via
  `/api/files`), the raw .eml download, and a sender badge (tenant member /
  known venue or vendor contact / unknown, plus SPF/DKIM). The HTML body is
  not rendered (`dangerouslySetInnerHTML` is reserved for `RichTextEditor`
  output).
- The proposal sits on the right, rendered by the existing UI prefilled:
  `ProposalForm` with defaults for an RFP response; the pickup import preview
  (inserted / updated / cancelled, with nights and room types) for a guest
  list; the counts grid for totals. The target is a picker, so a wrong match
  is a one-click fix.
- Actions: **Apply**, **Re-parse**, **Dismiss**, **Move to event** (when it was
  mailed to the wrong event).
- Permissions: viewing needs `HOTELS` VIEW (pickup and proposals carry
  contract money). Apply needs whatever the target core checks (`HOTELS`
  WRITE today).

## Route handler

`src/app/api/inbound-email/route.ts`, a new Archetype G entry (a protocol
endpoint posted by an outside service). It must also be added to the
`authorized` exemptions in `src/lib/auth.ts`, because it authenticates with
its own HMAC signature:

1. Verify `X-Signature` (constant-time compare) and a timestamp window of
   ±5 min. Otherwise 401.
2. Resolve the slug from `X-Envelope-To`. Unknown → 404, which tells the
   Worker to reject.
3. Parse the MIME and compute the `dedupKey`. A duplicate → 200 with no
   change (Cloudflare retries are safe).
4. Store the .eml and attachments (`@/lib/uploads`), insert `InboundEmail`
   (RECEIVED), return 200.
5. Start parsing without awaiting it. The app runs as a long-lived Node
   container, so the promise survives the response. An item stuck in
   RECEIVED shows a Re-parse button.

## Config

Two new secrets: `INBOUND_EMAIL_SECRET` (shared with the Worker) and
`ANTHROPIC_API_KEY`. CLAUDE.md allows `process.env` only in
`lib/{prisma,auth,uploads,email}`. Reading both from `@/lib/email` fits that
rule as written; a separate `@/lib/ai` would be a rule change. The inbound
domain goes in the same place as `INBOUND_EMAIL_DOMAIN`, so the address shown
in event settings is right.

## Phases

1. **Inbox without AI.** `inboxSlug` field + settings UI, the Worker, the
   route, `InboundEmail`, and the queue showing mail and attachments with
   *Dismiss* and *Attach files to…*. Useful on its own: hotel paperwork
   lands on the event.
2. **Pickup.** Parsing for `PICKUP_GUESTS` / `PICKUP_COUNTS`, applied through
   the pickup cores. Sender matching to the block's hotel contacts.
3. **RFP responses.** `RFP_PROPOSAL` / `RFP_DECLINE`. The RFP issue flow
   shows the event address for use as the Reply-To.
4. **Later.** Other kinds (vendor quotes, BEOs (banquet event orders),
   contracts), MCP `list_inbox_items` / `get_inbox_item` / `apply_inbox_item`,
   and an `origin: MCP` submit tool.

## Open questions

- Does `eventmanage.net` already receive other mail? (It decides apex vs a
  subdomain.)
- Should mail from an unknown sender be held separately from mail from known
  hotel contacts and members, or does the sender badge in one list suffice?
- Retention: how long to keep the raw .eml after an item is applied or
  dismissed?
