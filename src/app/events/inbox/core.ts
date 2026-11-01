import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma, type HotelPickupMethod, type InboundOrigin, type InboundStatus, type PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { ENTITY_FK_FIELD, getUploadDir, getUploadPath, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { blockNames, blockTypeLabel, dateFromKey, dateKey, formatDateKey, formatMoney, formatNight, offerContractType, roomTypeLabel, toContractTypeOption } from "@/lib/hotels";
import { getOptionsForTenant } from "@/lib/options";
import { gridToRows, readGrid, sheetKind } from "@/lib/spreadsheetRows";
import { DEFAULT_CANCELLED, guessDateOrder, rowsToGuests, type PickupColumns, type PickupGuestRow } from "@/lib/pickupMapping";
import {
  isParsingConfigured,
  parseInboundMessage,
  ParseError,
  type InboundProposal,
  type OfferHotel,
  type ProposalOffer,
  type ParseAttachment,
  type ParseBlock,
  type ParseRfp,
  type ParseVenue,
  type ParseVendorContext,
  type ContractTarget,
  type OfferOutcome,
  offerAmenities,
  offerAttachmentIndexes,
  offerOutcomes,
  proposalOffers,
} from "@/lib/inboundParse";
import { importPickupGuestsCore, savePickupCountsCore, type PickupCountArgs } from "@/app/events/hotels/blockCore";
import { createHotelProposalCore, createNewHotelCore, proposalValuesInclude, updateHotelProposalCore, writeArgsOf, type ProposalWriteArgs } from "@/app/events/hotels/core";
import { createVendorQuoteCore, quoteResource, updateVendorQuoteCore, type QuoteWriteArgs } from "@/app/events/quotes/core";
import { updateCateringOrderCore, type UpdateCateringOrderArgs } from "@/app/events/catering-orders/core";
import { createVendorCore } from "@/app/vendors/core";
import { updateRfpRecipientCore } from "@/app/events/rfps/core";
import { eventScopeWhere } from "@/app/events/core";
import { MIME_BY_EXT, OPEN_STATUSES } from "./views";
import { buildDedupKey, formatSender, parseInboxAddress, readMessage, slugifyInboxSlug } from "@/lib/inboundMail";
import { meetingRequests, rfpMealTypes } from "@/lib/rfp/proposalSpace";
import { UserFacingError } from "@/lib/userErrors";
import { assertIds } from "@/lib/validation";

// Event inboxes (docs/proposals/email-ingest.md). No "use server": the ingest
// is called by the signed /api/inbound-email route, and the person-facing
// cores take a userId the caller has already authenticated.

// Permissions. The inbox is the event's mail, whatever it turns out to be, so
// reading it is EVENTS VIEW and triage — release, re-read, dismiss, restore,
// move, submit — is EVENTS WRITE (on the destination too, for a move).
// Applying an item writes the record its kind names, so it needs WRITE on that
// record's resource, checked by each apply core before it claims the item:
// HOTELS for pickup, hotel proposals and declines; the RFP kind's resource
// (EVENTS when standalone) for a vendor quote; CATERING_ORDERS for a BEO; the
// covered record's for a contract. Filing an attachment is FILES WRITE.

// The org-wide inbox: Unrouted mail plus mail on every event the user can see.
export async function orgInboxWhere(userId: string, tenantId: string): Promise<Prisma.InboundEmailWhereInput> {
  return { tenantId, OR: [{ eventId: null }, { event: await eventScopeWhere(userId, tenantId) }] };
}

export const PURGE_AFTER_DAYS = 90;
const PURGE_BATCH = 50;

// ─── Sender matching ─────────────────────────────────────────────────────────

export type SenderMatch = "MEMBER" | "CONTACT" | "ORG_CONTACT";

// MEMBER: an account in this tenant. CONTACT: a contact of this tenant tied to
// the event — at one of its venues, a hotel it has a proposal from or sent an
// RFP to, one of its vendors, or its key staff. ORG_CONTACT: any other contact
// of this tenant, which labels the sender but doesn't let the mail past Held.
export async function matchSender(
  address: string | null,
  tenantId: string,
  eventId: string | null,
): Promise<SenderMatch | null> {
  if (!address) return null;
  const email = { equals: address, mode: "insensitive" as const };
  const member = await prisma.user.findFirst({
    where: { email, memberships: { some: { tenantId } } },
    select: { id: true },
  });
  if (member) return "MEMBER";
  const orgContact = await prisma.contact.findFirst({ where: { tenantId, email }, select: { id: true } });
  if (!orgContact) return null;
  if (!eventId) return "ORG_CONTACT";
  const contact = await prisma.contact.findFirst({
    where: {
      tenantId,
      email,
      OR: [
        {
          venues: {
            some: {
              venue: {
                OR: [
                  { events: { some: { eventId } } },
                  { hotelProposals: { some: { eventId } } },
                  { rfpRecipients: { some: { rfp: { eventId } } } },
                ],
              },
            },
          },
        },
        { vendorContacts: { some: { vendor: { eventVendors: { some: { eventId } } } } } },
        { eventKeyStaff: { some: { eventId } } },
      ],
    },
    select: { id: true },
  });
  return contact ? "CONTACT" : "ORG_CONTACT";
}

export function arrivalStatus(eventId: string | null, match: SenderMatch | null): InboundStatus {
  return eventId && (match === "MEMBER" || match === "CONTACT") ? "RECEIVED" : "HELD";
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

export type IngestResult =
  | { outcome: "rejected" } // no such tenant: the Worker bounces the mail
  | { outcome: "duplicate"; id: string }
  | { outcome: "stored"; id: string; status: InboundStatus; routed: boolean };

function storedNameFor(fileName: string): string {
  const ext = path.extname(fileName).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 10);
  return `${randomUUID()}${ext}`;
}

function sourceFileName(subject: string | null): string {
  const base = (subject ?? "message").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "message";
  return `${base}.eml`;
}

export async function ingestInboundEmail(
  raw: Buffer,
  envelope: { to: string; from: string | null },
  domain: string,
): Promise<IngestResult> {
  const address = parseInboxAddress(envelope.to, domain);
  if (!address) return { outcome: "rejected" };
  const tenant = await prisma.tenant.findUnique({ where: { slug: address.tenantSlug }, select: { id: true } });
  if (!tenant) return { outcome: "rejected" };
  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, inboxSlug: address.eventSlug },
    select: { id: true },
  });
  const eventId = event?.id ?? null;

  const msg = await readMessage(raw);
  const dedupKey = buildDedupKey(msg.parsed, envelope.to, msg.receivedAt);
  const existing = await prisma.inboundEmail.findUnique({ where: { dedupKey }, select: { id: true } });
  if (existing) return { outcome: "duplicate", id: existing.id };

  const senderMatch = await matchSender(msg.senderAddress, tenant.id, eventId);
  const status = arrivalStatus(eventId, senderMatch);

  let row: { id: string };
  try {
    row = await prisma.inboundEmail.create({
      data: {
        tenantId: tenant.id,
        eventId,
        dedupKey,
        envelopeTo: envelope.to.trim().toLowerCase(),
        envelopeFrom: envelope.from?.trim().toLowerCase() || null,
        sender: msg.sender,
        senderAddress: msg.senderAddress,
        forwardedFrom: formatSender(msg.forwardedFrom),
        subject: msg.subject,
        receivedAt: msg.receivedAt,
        textBody: msg.textBody,
        authResults: msg.authResults,
        senderMatch,
        status,
      },
      select: { id: true },
    });
  } catch (err) {
    // A retry racing the first delivery.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.inboundEmail.findUnique({ where: { dedupKey }, select: { id: true } });
      if (again) return { outcome: "duplicate", id: again.id };
    }
    throw err;
  }

  // Files after the row (their directory is keyed by its id). On failure the
  // row goes too, so the Worker's retry starts clean rather than deduping
  // against a message with no files.
  const dir = getUploadDir("inboundEmail", row.id);
  try {
    mkdirSync(dir, { recursive: true });
    const files: Prisma.FileUploadCreateManyInput[] = [];
    const sourceName = storedNameFor("message.eml");
    writeFileSync(path.join(dir, sourceName), raw);
    files.push({
      fileName: sourceFileName(msg.subject),
      storedName: sourceName,
      mimeType: "message/rfc822",
      fileSize: raw.length,
      isEmailSource: true,
      inboundEmailId: row.id,
    });
    for (const a of msg.attachments) {
      if (a.content.length > MAX_UPLOAD_BYTES) continue; // still in the .eml
      const storedName = storedNameFor(a.fileName);
      writeFileSync(path.join(dir, storedName), a.content);
      files.push({
        fileName: a.fileName,
        storedName,
        mimeType: a.mimeType,
        fileSize: a.content.length,
        inboundEmailId: row.id,
      });
    }
    await prisma.fileUpload.createMany({ data: files });
  } catch (err) {
    await prisma.inboundEmail.delete({ where: { id: row.id } }).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }

  if (status === "RECEIVED") startInboundParse(row.id);
  return { outcome: "stored", id: row.id, status, routed: eventId !== null };
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

// Runs the parse without holding up the caller (a delivery, a release, a
// move). The item shows Received until the result lands; Re-read runs it again
// if the process stopped first.
export function startInboundParse(id: string) {
  if (!isParsingConfigured()) return;
  void parseInboundEmail(id).catch(() => {});
}

function parseFailure(err: unknown): string {
  if (err instanceof ParseError) return err.message;
  // The API's own message says what it objected to.
  if (err instanceof Anthropic.APIError) return `Couldn't reach Claude (${err.status ?? "no response"}): ${err.message}`.slice(0, 500);
  return `Couldn't read the message: ${err instanceof Error ? err.message : String(err)}`;
}

async function parseBlocks(eventId: string): Promise<ParseBlock[]> {
  const blocks = await prisma.hotelBlock.findMany({
    where: { proposal: { eventId } },
    select: {
      id: true,
      checkIn: true,
      checkOut: true,
      groupCode: true,
      contractType: true,
      guestType: true,
      nights: { select: { roomType: true } },
      proposal: { select: { venue: { select: { name: true } } } },
    },
  });
  // A hotel with several blocks names each by its type.
  const names = blockNames(blocks.map((b) => ({ ...b, hotel: b.proposal.venue.name })));
  return blocks.map((b) => ({
    id: b.id,
    hotel: names.get(b.id) ?? b.proposal.venue.name,
    checkIn: b.checkIn ? dateKey(b.checkIn) : null,
    checkOut: b.checkOut ? dateKey(b.checkOut) : null,
    groupCode: b.groupCode,
    roomTypes: Array.from(new Set(b.nights.map((n) => n.roomType))),
  }));
}

// RFPs the event has sent (or drafted), and the hotels an offer could come
// from: its recipients, hotels with a proposal already, and the sender's own
// hotel when the sender is one of its contacts.
async function parseRfpContext(eventId: string, tenantId: string, senderAddresses: string[]) {
  const [rfps, proposals, senderVenues, options] = await Promise.all([
    prisma.rfp.findMany({
      where: { eventId, kind: "HOTEL" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        issuedOn: true,
        responseDue: true,
        recipients: { where: { venueId: { not: null } }, select: { venue: { select: { id: true, name: true } } } },
        hotelBlocks: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, contractType: true, guestType: true, nights: { select: { night: true, roomType: true, rooms: true } } },
        },
        concessions: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, value: true } },
        spaceRequests: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.hotelProposal.findMany({ where: { eventId }, select: { venue: { select: { id: true, name: true } } } }),
    senderAddresses.length
      ? prisma.venue.findMany({
          where: {
            tenantId,
            contacts: { some: { contact: { OR: senderAddresses.map((a) => ({ email: { equals: a, mode: "insensitive" as const } })) } } },
          },
          select: { id: true, name: true },
        })
      : [],
    prisma.customOption.findMany({
      where: { tenantId, category: { in: ["hotel_room_type", "hotel_amenity", "rfp_concession"] } },
      select: { category: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const hotels = new Map<string, ParseVenue>();
  const add = (v: { id: string; name: string } | null, why: string) => {
    if (v && !hotels.has(v.id)) hotels.set(v.id, { id: v.id, name: v.name, why });
  };
  senderVenues.forEach((v) => add(v, "the sender is one of its contacts"));
  rfps.forEach((r) => r.recipients.forEach((x) => add(x.venue, `sent RFP "${r.title}"`)));
  proposals.forEach((p) => add(p.venue, "already has a proposal for this event"));

  const nightsText = (nights: { night: Date; roomType: string | null; rooms: number }[]) => {
    const byNight = new Map<string, string[]>();
    for (const n of [...nights].sort((a, b) => a.night.getTime() - b.night.getTime())) {
      const k = dateKey(n.night);
      byNight.set(k, [...(byNight.get(k) ?? []), `${n.rooms} ${roomTypeLabel(n.roomType)}`]);
    }
    return Array.from(byNight, ([k, v]) => `${formatNight(k)}: ${v.join(", ")}`).join("; ") || "no nights";
  };
  const parseRfps: ParseRfp[] = rfps.map((r) => ({
    id: r.id,
    title: r.title,
    issuedOn: r.issuedOn ? dateKey(r.issuedOn) : null,
    responseDue: r.responseDue ? dateKey(r.responseDue) : null,
    recipients: r.recipients.flatMap((x) => (x.venue ? [x.venue.id] : [])),
    blocks: r.hotelBlocks.map((b) => ({
      id: b.id,
      label: blockTypeLabel(b.contractType, b.guestType) ?? "Block",
      nights: `requested ${nightsText(b.nights)}`,
    })),
    concessions: r.concessions,
    meetingSpace: meetingRequests(r.spaceRequests).map((m) => ({ id: m.id, name: m.name, label: [m.when, m.name, m.asked && `asked ${m.asked}`].filter(Boolean).join(" · ") })),
    mealTypes: rfpMealTypes(r.spaceRequests),
  }));
  return {
    hotels: Array.from(hotels.values()),
    rfps: parseRfps,
    roomTypes: options.filter((o) => o.category === "hotel_room_type").map((o) => o.label),
    amenities: options.filter((o) => o.category === "hotel_amenity").map((o) => o.label),
    concessionLabels: options.filter((o) => o.category === "rfp_concession").map((o) => o.label),
  };
}

const addressOf = (formatted: string | null) => formatted?.match(/<([^>]+)>/)?.[1] ?? formatted?.trim() ?? null;

// Attachments in the order the item lists them (Prisma createdAt, then id),
// which is the order proposal.sheet.attachment indexes.
// Vendor-side candidates for a read: vendors a quote could come from (the
// event's, its vendor RFPs' recipients, the sender's own), vendor RFPs with
// their line items, catering orders a BEO could be for, and the records a
// contract could cover.
async function parseVendorContext(eventId: string, tenantId: string, senderAddresses: string[], timezone: string): Promise<ParseVendorContext> {
  const [eventVendors, senderVendors, rfps, orders, proposals, quotes, leadSources] = await Promise.all([
    prisma.eventVendor.findMany({ where: { eventId }, select: { vendor: { select: { id: true, name: true } } } }),
    senderAddresses.length
      ? prisma.vendor.findMany({
          where: { tenantId, contacts: { some: { contact: { OR: senderAddresses.map((a) => ({ email: { equals: a, mode: "insensitive" as const } })) } } } },
          select: { id: true, name: true },
        })
      : [],
    prisma.rfp.findMany({
      where: { eventId, kind: { not: "HOTEL" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        kind: true,
        service: true,
        recipients: { where: { vendorId: { not: null } }, select: { vendor: { select: { id: true, name: true } } } },
        lineItems: { orderBy: { sortOrder: "asc" }, select: { id: true, group: true, description: true, quantity: true, unit: true } },
      },
    }),
    prisma.cateringOrder.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        mealType: true,
        expectedCount: true,
        guaranteeCount: true,
        function: { select: { schedules: { select: { startTime: true }, orderBy: { startTime: "asc" }, take: 1 } } },
      },
    }),
    prisma.hotelProposal.findMany({ where: { eventId }, select: { id: true, status: true, revision: true, venue: { select: { name: true } } } }),
    prisma.vendorQuote.findMany({ where: { eventId }, select: { id: true, status: true, vendor: { select: { name: true } }, rfp: { select: { title: true } } } }),
    prisma.vendor.findMany({ where: { tenantId, models: { has: "LEAD_SOURCE" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const vendors = new Map<string, ParseVenue>();
  const add = (v: { id: string; name: string } | null, why: string) => {
    if (v && !vendors.has(v.id)) vendors.set(v.id, { id: v.id, name: v.name, why });
  };
  senderVendors.forEach((v) => add(v, "the sender is one of its contacts"));
  rfps.forEach((r) => r.recipients.forEach((x) => add(x.vendor, `sent RFP "${r.title}"`)));
  eventVendors.forEach((e) => add(e.vendor, "a vendor on this event"));
  const orderLabel = (o: (typeof orders)[number]) => {
    const at = o.function?.schedules[0]?.startTime;
    const count = o.guaranteeCount ?? o.expectedCount;
    return [o.name, o.mealType, at ? formatNight(getDateKeyInTimezone(at, timezone)) : null, count != null ? `${count} guests` : null].filter(Boolean).join(" · ");
  };
  const contractTargets: { target: ContractTarget; id: string; label: string }[] = [
    ...proposals.map((p) => ({ target: "HOTEL_PROPOSAL" as const, id: p.id, label: `${p.venue.name} proposal · ${p.status}${p.revision > 1 ? ` · rev ${p.revision}` : ""}` })),
    ...quotes.map((q) => ({ target: "VENDOR_QUOTE" as const, id: q.id, label: `${q.vendor.name} quote${q.rfp ? ` for "${q.rfp.title}"` : ""} · ${q.status}` })),
    ...orders.map((o) => ({ target: "CATERING_ORDER" as const, id: o.id, label: orderLabel(o) })),
  ];
  return {
    vendors: Array.from(vendors.values()),
    leadSources,
    vendorRfps: rfps.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind === "OTHER" ? (r.service ?? "Other services") : r.kind,
      recipients: r.recipients.flatMap((x) => (x.vendor ? [`${x.vendor.name} (${x.vendor.id})`] : [])),
      lineItems: r.lineItems.map((l) => ({
        id: l.id,
        label: [l.group, l.description, l.quantity != null ? `${l.quantity}${l.unit ? ` ${l.unit}` : ""}` : null].filter(Boolean).join(" · "),
      })),
    })),
    cateringOrders: orders.map((o) => ({ id: o.id, label: orderLabel(o) })),
    contractTargets,
  };
}

export async function inboundAttachments(id: string) {
  return prisma.fileUpload.findMany({
    where: { inboundEmailId: id, isEmailSource: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function readAttachments(id: string): Promise<ParseAttachment[]> {
  const files = await inboundAttachments(id);
  return Promise.all(
    files.map(async (f): Promise<ParseAttachment> => {
      const path = getUploadPath("inboundEmail", id, f.storedName);
      if (f.mimeType === "application/pdf" || f.fileName.toLowerCase().endsWith(".pdf")) {
        return { fileName: f.fileName, type: "pdf", content: readFileSync(path) };
      }
      const kind = sheetKind(f.fileName, f.mimeType);
      if (kind) {
        try {
          return { fileName: f.fileName, type: "sheet", grid: await readGrid(readFileSync(path), kind) };
        } catch {
          // Unreadable sheet: list it like any other file.
        }
      }
      return { fileName: f.fileName, type: "other", mimeType: f.mimeType };
    }),
  );
}

async function parseInboundEmail(id: string) {
  const item = await prisma.inboundEmail.findUnique({
    where: { id },
    include: { event: { select: { id: true, name: true, timezone: true } } },
  });
  if (!item?.event || !OPEN_STATUSES.includes(item.status) || item.status === "HELD") return;
  const event = item.event;
  // Only lands if the item is still open on the same event.
  const settle = (data: Prisma.InboundEmailUpdateManyMutationInput) =>
    prisma.inboundEmail.updateMany({
      where: { id, eventId: event.id, status: { in: ["RECEIVED", "PARSED", "FAILED"] } },
      data,
    });
  try {
    const senders = [item.senderAddress, addressOf(item.forwardedFrom)].filter((x): x is string => !!x);
    const [blocks, attachments, rfpContext, vendorContext] = await Promise.all([
      parseBlocks(event.id),
      readAttachments(id),
      parseRfpContext(event.id, item.tenantId, senders),
      parseVendorContext(event.id, item.tenantId, senders, event.timezone),
    ]);
    const { proposal, model } = await parseInboundMessage({
      subject: item.subject,
      sender: item.sender,
      forwardedFrom: item.forwardedFrom,
      receivedAt: item.receivedAt,
      textBody: item.textBody,
      today: getDateKeyInTimezone(new Date(), event.timezone),
      timezone: event.timezone,
      eventName: event.name,
      blocks,
      ...rfpContext,
      ...vendorContext,
      attachments,
    });
    await settle({ status: "PARSED", kind: proposal.kind, proposal, model, error: null });
  } catch (err) {
    await settle({ status: "FAILED", error: parseFailure(err) });
  }
}

// Re-read: a failed read, a wrong guess, or one that never finished.
export async function reparseInboundEmailCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const item = await inboxItem(id, await requireEventTenantId(eventId), eventId);
  if (!["RECEIVED", "PARSED", "FAILED"].includes(item.status)) return;
  if (!isParsingConfigured()) throw new Error("Parsing isn't configured");
  // A fresh read forgets which offers became proposals. Ones since deleted
  // don't count.
  const proposal = item.proposal as InboundProposal | null;
  const outcomes = proposal ? offerOutcomes(proposal) : [];
  const savedIds = outcomes.flatMap((o) => (o && "proposalId" in o ? [o.proposalId] : []));
  if (outcomes.some((o) => o && "pending" in o) || (savedIds.length && (await prisma.hotelProposal.count({ where: { id: { in: savedIds }, eventId } })))) {
    throw new Error("Some of its offers are already saved as proposals");
  }
  await prisma.inboundEmail.update({
    where: { id },
    data: { status: "RECEIVED", kind: null, proposal: Prisma.DbNull, model: null, error: null },
  });
  startInboundParse(id);
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export type InboundApply =
  | { type: "guests"; method: Exclude<HotelPickupMethod, "COUNTS">; fileName: string | null; guests: PickupGuestRow[] }
  | { type: "counts"; counts: PickupCountArgs[] };

// Claims a Ready item (PARSED → APPLIED) so a second click can't apply it
// twice, runs the apply, and puts the item back if that fails.
async function claimAndApply(id: string, eventId: string, userId: string, apply: () => Promise<Partial<InboundProposal>>) {
  const tenantId = await requireEventTenantId(eventId);
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status !== "PARSED") throw new UserFacingError("This message has nothing to apply");
  const claimed = await prisma.inboundEmail.updateMany({
    where: { id, tenantId, eventId, status: "PARSED" },
    data: { status: "APPLIED", handledById: userId, handledAt: new Date() },
  });
  if (claimed.count === 0) throw new UserFacingError("This message was already applied");
  let result: Partial<InboundProposal>;
  try {
    result = await apply();
  } catch (err) {
    await prisma.inboundEmail.update({
      where: { id },
      data: { status: "PARSED", handledById: item.handledById, handledAt: item.handledAt },
    });
    throw err;
  }
  // Remember where it went.
  const proposal = item.proposal as InboundProposal | null;
  if (proposal) await prisma.inboundEmail.update({ where: { id }, data: { proposal: { ...proposal, ...result } } });
}

// A pickup proposal, applied to a block through the pickup cores as the reviewer.
export async function applyInboundPickupCore(
  id: string,
  eventId: string,
  blockId: string,
  apply: InboundApply,
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await claimAndApply(id, eventId, userId, async () => {
    if (apply.type === "guests") {
      await importPickupGuestsCore(blockId, eventId, { method: apply.method, fileName: apply.fileName, guests: apply.guests }, userId);
    } else {
      await savePickupCountsCore(blockId, eventId, apply.counts, userId);
    }
    return { blockId };
  });
}

// ─── Hotel offers ────────────────────────────────────────────────────────────

// One message can hold several hotels' offers (one sales rep, several
// properties), each saved or skipped on its own. The item stays Ready until
// every offer has an outcome.

const hasAppliedOffer = (p: InboundProposal | null) => !!p && offerOutcomes(p).some((o) => o && !("skipped" in o));

// Sets one offer's outcome. change sees the current outcome and the item's
// status, and throws to refuse. The write is a compare-and-set on updatedAt,
// so two offers saved at once can't overwrite each other's outcome. Returns
// every offer's outcome after the change.
async function setOfferOutcome(
  id: string,
  eventId: string,
  index: number,
  userId: string,
  change: (current: OfferOutcome, status: InboundStatus) => OfferOutcome,
): Promise<OfferOutcome[]> {
  const tenantId = await requireEventTenantId(eventId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const item = await inboxItem(id, tenantId, eventId);
    const proposal = item.proposal as InboundProposal | null;
    if (!proposal || !proposalOffers(proposal)[index]) throw new Error("This message has no such offer");
    const outcomes = offerOutcomes(proposal);
    outcomes[index] = change(outcomes[index], item.status);
    const open = outcomes.flatMap((o, i) => (o ? [] : [i]));
    const updated = await prisma.inboundEmail.updateMany({
      where: { id, tenantId, eventId, updatedAt: item.updatedAt },
      data: {
        proposal: { ...proposal, offerOutcomes: outcomes },
        // Every offer skipped is the same as dismissing the message.
        status: open.length ? "PARSED" : outcomes.some((o) => o && !("skipped" in o)) ? "APPLIED" : "DISMISSED",
        handledById: userId,
        handledAt: new Date(),
      },
    });
    if (updated.count) return outcomes;
  }
  throw new Error("This message is being changed by someone else; reload and try again");
}

const firstOpen = (outcomes: OfferOutcome[]) => {
  const i = outcomes.findIndex((o) => !o);
  return i < 0 ? null : i;
};

// Claims an offer (so a second click can't save it twice), saves it, and
// records the proposal; frees the claim if saving fails. Returns the
// proposal, the next offer still to handle, how many of the message's
// offers are now proposals, and how many offers it holds.
async function claimAndApplyOffer(id: string, eventId: string, index: number, userId: string, apply: () => Promise<string>) {
  await setOfferOutcome(id, eventId, index, userId, (current, status) => {
    if (status !== "PARSED") throw new Error("This message has nothing to apply");
    if (current) throw new Error("This offer was already applied");
    return { pending: true };
  });
  let proposalId: string;
  try {
    proposalId = await apply();
  } catch (err) {
    await setOfferOutcome(id, eventId, index, userId, () => null);
    throw err;
  }
  const outcomes = await setOfferOutcome(id, eventId, index, userId, () => ({ proposalId }));
  return { proposalId, next: firstOpen(outcomes), saved: outcomes.filter((o) => o && "proposalId" in o).length, total: outcomes.length };
}

// The message's attachments filed on offer index's proposal: those picked in
// the review (attachmentIds), else the ones the read gives that offer.
async function offerAttachments(id: string, eventId: string, index: number, attachmentIds: string[] | null) {
  const files = await inboundAttachments(id);
  if (attachmentIds) return files.filter((f) => attachmentIds.includes(f.id));
  const tenantId = await requireEventTenantId(eventId);
  const item = await inboxItem(id, tenantId, eventId);
  const keep = new Set(offerAttachmentIndexes(proposalOffers(item.proposal as InboundProposal | null), index, files.length));
  return files.filter((_, i) => keep.has(i));
}

// A hotel's offer, as reviewed in the proposal form: creates the proposal
// (and first the hotel, when it's one not in Venues yet) and files the
// offer's attachments on it (attachmentIds: the reviewer's pick; null: the
// read's).
export async function applyInboundOfferCore(
  id: string,
  eventId: string,
  index: number,
  args: ProposalWriteArgs,
  newHotel: OfferHotel | null,
  attachmentIds: string[] | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const files = await offerAttachments(id, eventId, index, attachmentIds);
  return claimAndApplyOffer(id, eventId, index, userId, async () => {
    // A new hotel's profile starts with the amenities its offer confirms.
    const confirmed = args.amenities.filter((a) => a.status === "CONFIRMED").map((a) => a.label);
    const venueId = newHotel ? (await createNewHotelCore(eventId, newHotel, confirmed, userId)).id : args.venueId;
    const proposal = await createHotelProposalCore(eventId, { ...args, venueId }, userId);
    await copyAttachmentsTo(id, "hotelProposal", proposal.id, files);
    return proposal.id;
  });
}

// A revised offer, saved over the proposal it revises (args.revision says
// which revision it becomes).
export async function applyInboundRevisionCore(
  id: string,
  eventId: string,
  index: number,
  proposalId: string,
  args: ProposalWriteArgs,
  attachmentIds: string[] | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const files = await offerAttachments(id, eventId, index, attachmentIds);
  return claimAndApplyOffer(id, eventId, index, userId, async () => {
    await updateHotelProposalCore(proposalId, eventId, args, userId);
    await copyAttachmentsTo(id, "hotelProposal", proposalId, files);
    return proposalId;
  });
}

// Passes over one offer (a property the event won't use). Returns the next
// offer still to handle.
export async function skipInboundOfferCore(id: string, eventId: string, index: number, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const outcomes = await setOfferOutcome(id, eventId, index, userId, (current, status) => {
    if (status !== "PARSED") throw new Error("This message has nothing to apply");
    if (current) throw new Error("This offer was already handled");
    return { skipped: true };
  });
  return firstOpen(outcomes);
}

// The message's attachments (all, or the ones given), filed on the record it
// was applied to.
async function copyAttachmentsTo(
  id: string,
  entityType: "hotelProposal" | "vendorQuote" | "cateringOrder",
  entityId: string,
  only?: Awaited<ReturnType<typeof inboundAttachments>>,
) {
  const files = only ?? (await inboundAttachments(id));
  if (!files.length) return;
  mkdirSync(getUploadDir(entityType, entityId), { recursive: true });
  for (const f of files) {
    copyFileSync(getUploadPath("inboundEmail", id, f.storedName), getUploadPath(entityType, entityId, f.storedName));
  }
  await prisma.fileUpload.createMany({
    data: files.map((f) => ({
      fileName: f.fileName,
      storedName: f.storedName,
      mimeType: f.mimeType,
      fileSize: f.fileSize,
      [ENTITY_FK_FIELD[entityType]]: entityId,
    })),
  });
}


// ─── Vendor quotes, BEOs, contracts ──────────────────────────────────────────

const KIND_MODEL: Partial<Record<string, string>> = { AV: "AV_ORDER", CATERING: "CATERING_ORDER", PRINT: "PRINT_ORDER" };

// A vendor's quote, as reviewed in the quote form: records it (on its RFP, or
// standalone) and files the message's attachments on it. A vendor not on
// file is created first (VENDORS WRITE), tagged for the RFP's order type.
export async function applyInboundQuoteCore(
  id: string,
  eventId: string,
  rfpId: string | null,
  args: QuoteWriteArgs,
  newVendorName: string | null,
  userId: string,
): Promise<string> {
  const rfp = rfpId ? await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } }) : null;
  if (rfpId && !rfp) throw new PermissionError("NOT_FOUND", "RFP not found");
  await requirePermissionForUser(userId, quoteResource(rfp), "WRITE", eventId);
  if (newVendorName?.trim()) await requirePermissionForUser(userId, "VENDORS", "WRITE", { tenantId: await requireEventTenantId(eventId) });
  let quoteId = "";
  await claimAndApply(id, eventId, userId, async () => {
    let vendorId = args.vendorId;
    if (newVendorName?.trim()) {
      const tenantId = await requireEventTenantId(eventId);
      const name = newVendorName.trim();
      const same = await prisma.vendor.findFirst({ where: { tenantId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
      if (same) throw new Error(`${name} is already a vendor; choose it`);
      const model = rfp ? KIND_MODEL[rfp.kind] : undefined;
      vendorId = (await createVendorCore({ name, models: model ? [model] : [], notes: null }, userId, tenantId)).id;
    }
    const quote = await createVendorQuoteCore(eventId, rfpId, { ...args, vendorId }, userId);
    quoteId = quote.id;
    await copyAttachmentsTo(id, "vendorQuote", quote.id);
    return { appliedQuoteId: quote.id };
  });
  return quoteId;
}

// What a BEO changes on its catering order: only the fields the reviewer
// kept (undefined leaves one as it is).
export type BeoApplyArgs = Pick<
  UpdateCateringOrderArgs,
  "mealType" | "serviceStyle" | "expectedCount" | "confirmedCount" | "guaranteeCount" | "fbMinimum" | "depositDeadline" | "guaranteeDeadline" | "paymentDeadline" | "cancellationTerms" | "dietaryNotes" | "notes"
>;

export async function applyInboundBeoCore(id: string, eventId: string, cateringOrderId: string, args: BeoApplyArgs, userId: string) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const order = await prisma.cateringOrder.findFirst({ where: { id: cateringOrderId, eventId }, select: { id: true, name: true } });
  if (!order) throw new PermissionError("NOT_FOUND", "Catering order not found");
  await claimAndApply(id, eventId, userId, async () => {
    await updateCateringOrderCore(order.id, eventId, args, userId);
    await copyAttachmentsTo(id, "cateringOrder", order.id);
    return { appliedTo: { target: "CATERING_ORDER" as const, id: order.id, label: order.name } };
  });
}

// What a contract writes on the record it covers; undefined leaves a field.
// note is appended to the record's notes.
export type ContractApplyArgs = {
  depositAmount?: number | null; // vendor quote
  depositDue?: string | null; // vendor quote (deposit due), catering order (deposit deadline)
  attrition?: number | null; // hotel proposal
  signBy?: string | null; // hotel proposal (valid until)
  cancellationTerms?: string | null; // vendor quote, catering order
  note?: string | null;
};

const appendNote = (current: string | null, note: string | null | undefined) =>
  note?.trim() ? [current, note.trim()].filter(Boolean).join("\n\n") : current;

// The resource guarding what a contract covers; a foreign id is a not-found.
export async function contractTargetResource(target: ContractTarget, targetId: string, eventId: string): Promise<PermissionResource> {
  switch (target) {
    case "HOTEL_PROPOSAL":
      return "HOTELS";
    case "CATERING_ORDER":
      return "CATERING_ORDERS";
    case "VENDOR_QUOTE": {
      const q = await prisma.vendorQuote.findFirst({ where: { id: targetId, eventId }, select: { rfp: { select: { kind: true } } } });
      if (!q) throw new PermissionError("NOT_FOUND", "Quote not found");
      return quoteResource(q.rfp);
    }
    default: {
      const _exhaustive: never = target;
      throw new Error(`Unhandled contract target: ${_exhaustive}`);
    }
  }
}

export async function applyInboundContractCore(
  id: string,
  eventId: string,
  target: ContractTarget,
  targetId: string,
  args: ContractApplyArgs,
  userId: string,
) {
  const day = (v: string | null | undefined) => (v === undefined ? undefined : v ? dateFromKey(v) : null);
  await requirePermissionForUser(userId, await contractTargetResource(target, targetId, eventId), "WRITE", eventId);
  await claimAndApply(id, eventId, userId, async () => {
    switch (target) {
      case "HOTEL_PROPOSAL": {
        const p = await prisma.hotelProposal.findFirst({
          where: { id: targetId, eventId },
          include: proposalValuesInclude,
        });
        if (!p) throw new PermissionError("NOT_FOUND", "Proposal not found");
        const v = writeArgsOf(p);
        await updateHotelProposalCore(
          p.id,
          eventId,
          {
            ...v,
            allowedAttrition: args.attrition !== undefined ? args.attrition : v.allowedAttrition,
            validUntil: args.signBy !== undefined ? args.signBy : v.validUntil,
            notes: appendNote(v.notes, args.note),
          },
          userId,
        );
        await copyAttachmentsTo(id, "hotelProposal", p.id);
        return { appliedTo: { target, id: p.id, label: `${p.venue.name} proposal` } };
      }
      case "VENDOR_QUOTE": {
        const q = await prisma.vendorQuote.findFirst({ where: { id: targetId, eventId }, include: { vendor: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" } } } });
        if (!q) throw new PermissionError("NOT_FOUND", "Quote not found");
        const n = (x: { toString(): string } | null) => (x == null ? null : Number(x.toString()));
        const k = (d: Date | null) => (d ? dateKey(d) : null);
        await updateVendorQuoteCore(
          q.id,
          eventId,
          {
            vendorId: q.vendorId,
            reference: q.reference,
            submittedOn: k(q.submittedOn),
            validUntil: k(q.validUntil),
            revision: q.revision,
            serviceCharge: n(q.serviceCharge),
            tax: n(q.tax),
            otherFees: n(q.otherFees),
            depositAmount: args.depositAmount !== undefined ? args.depositAmount : n(q.depositAmount),
            depositDue: args.depositDue !== undefined ? args.depositDue : k(q.depositDue),
            cancellationTerms: args.cancellationTerms !== undefined ? args.cancellationTerms : q.cancellationTerms,
            notes: appendNote(q.notes, args.note),
            lines: q.lines.map((l) => ({ id: l.id, rfpLineItemId: l.rfpLineItemId, description: l.description, quantity: n(l.quantity), unitPrice: n(l.unitPrice), amount: n(l.amount), notes: l.notes })),
          },
          userId,
        );
        await copyAttachmentsTo(id, "vendorQuote", q.id);
        return { appliedTo: { target, id: q.id, label: `${q.vendor.name} quote` } };
      }
      case "CATERING_ORDER": {
        const o = await prisma.cateringOrder.findFirst({ where: { id: targetId, eventId }, select: { id: true, name: true, notes: true } });
        if (!o) throw new PermissionError("NOT_FOUND", "Catering order not found");
        await updateCateringOrderCore(
          o.id,
          eventId,
          { depositDeadline: day(args.depositDue), cancellationTerms: args.cancellationTerms, notes: appendNote(o.notes, args.note) ?? undefined },
          userId,
        );
        await copyAttachmentsTo(id, "cateringOrder", o.id);
        return { appliedTo: { target, id: o.id, label: o.name } };
      }
      default: {
        const _exhaustive: never = target;
        throw new Error(`Unhandled contract target: ${_exhaustive}`);
      }
    }
  });
}


// A hotel declining to bid: marks it on the RFP's recipient row, keeping when
// the RFP went out and adding the reason to its notes.
export async function applyInboundDeclineCore(
  id: string,
  eventId: string,
  rfpId: string,
  venueId: string,
  reason: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const recipient = await prisma.rfpRecipient.findFirst({
    where: { rfpId, venueId, rfp: { eventId } },
    select: { id: true, sentOn: true, notes: true },
  });
  if (!recipient) throw new Error("That hotel isn't on this RFP");
  const note = reason?.trim() ? `Declined: ${reason.trim()}` : null;
  await claimAndApply(id, eventId, userId, async () => {
    await updateRfpRecipientCore(
      recipient.id,
      rfpId,
      eventId,
      {
        sentOn: recipient.sentOn ? dateKey(recipient.sentOn) : null,
        declinedToBid: true,
        notes: [recipient.notes, note].filter(Boolean).join("\n") || null,
      },
      userId,
    );
    return { decline: { rfpId, venueId, reason } };
  });
}

// ─── Purge ───────────────────────────────────────────────────────────────────

// Dismissed items older than PURGE_AFTER_DAYS: files on disk, then the row
// (its FileUploads cascade). Filed copies live under the event, untouched.
// The app has no scheduler, so this runs opportunistically on ingest and on
// inbox page loads; the batch cap keeps one call cheap.
export async function purgeDismissedInboundEmails(tenantId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const stale = await prisma.inboundEmail.findMany({
    where: { status: "DISMISSED", handledAt: { lt: cutoff }, ...(tenantId ? { tenantId } : {}) },
    select: { id: true },
    take: PURGE_BATCH,
  });
  for (const { id } of stale) {
    rmSync(getUploadDir("inboundEmail", id), { recursive: true, force: true });
    await prisma.inboundEmail.delete({ where: { id } });
  }
  return stale.length;
}

// ─── Person-facing cores ─────────────────────────────────────────────────────

async function inboxItem(id: string, tenantId: string, eventId: string | null) {
  // Every claim and apply loads the item here first; an id that's a filter
  // object would match (and then claim) every item in scope.
  assertIds(id);
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId } });
  if (!item) throw new Error("Inbox item not found");
  return item;
}

// HELD → RECEIVED. Only routed mail: Unrouted mail is routed first.
export async function releaseInboundEmailCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status !== "HELD") return;
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: { status: "RECEIVED", handledById: userId, handledAt: new Date() },
  });
  startInboundParse(id);
}

// eventId null: an Unrouted item, checked against the tenant.
export async function dismissInboundEmailCore(id: string, eventId: string | null, tenantId: string, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId ?? { tenantId });
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status === "APPLIED" || item.status === "DISMISSED") return;
  // Some offers already saved: the rest are passed over, and the item stays
  // with the proposals it made rather than being purged.
  const proposal = item.proposal as InboundProposal | null;
  if (proposal && hasAppliedOffer(proposal)) {
    const outcomes = offerOutcomes(proposal).map((o) => o ?? { skipped: true as const });
    await prisma.inboundEmail.update({
      where: { id, tenantId },
      data: { status: "APPLIED", proposal: { ...proposal, offerOutcomes: outcomes }, handledById: userId, handledAt: new Date() },
    });
    return;
  }
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: { status: "DISMISSED", handledById: userId, handledAt: new Date() },
  });
}

// Back from Dismissed (until it's purged). Lands in Held: a person looks again.
export async function restoreInboundEmailCore(id: string, eventId: string | null, tenantId: string, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId ?? { tenantId });
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status !== "DISMISSED") return;
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: { status: "HELD", handledById: userId, handledAt: new Date() },
  });
}

// Moves an item to another event of the same tenant (or routes an Unrouted
// one). Needs WRITE on the destination; the sender is re-matched against it,
// and the item starts over as Received or Held.
export async function routeInboundEmailCore(
  id: string,
  fromEventId: string | null,
  toEventId: string,
  tenantId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", fromEventId ?? { tenantId });
  await requirePermissionForUser(userId, "EVENTS", "WRITE", toEventId);
  if ((await requireEventTenantId(toEventId)) !== tenantId) throw new Error("Event not found");
  const item = await inboxItem(id, tenantId, fromEventId);
  if (item.status === "APPLIED") throw new Error("An applied item can't be moved");
  const match = await matchSender(item.senderAddress, tenantId, toEventId);
  const status = arrivalStatus(toEventId, match);
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: {
      eventId: toEventId,
      senderMatch: match,
      status,
      kind: null,
      proposal: Prisma.DbNull,
      model: null,
      error: null,
      handledById: userId,
      handledAt: new Date(),
    },
  });
  if (status === "RECEIVED") startInboundParse(id);
}

// Files one attachment on the event's Files page: a copy under the event with
// the same storedName, which is how the item tells it's been filed.
export async function fileInboundAttachmentCore(fileId: string, id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FILES", "WRITE", eventId);
  await inboxItem(id, await requireEventTenantId(eventId), eventId);
  const file = await prisma.fileUpload.findFirst({ where: { id: fileId, inboundEmailId: id } });
  if (!file) throw new Error("Attachment not found");
  const already = await prisma.fileUpload.findFirst({ where: { eventId, storedName: file.storedName }, select: { id: true } });
  if (already) return;
  mkdirSync(getUploadDir("event", eventId), { recursive: true });
  copyFileSync(getUploadPath("inboundEmail", id, file.storedName), getUploadPath("event", eventId, file.storedName));
  await prisma.fileUpload.create({
    data: {
      fileName: file.fileName,
      storedName: file.storedName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      eventId,
    },
  });
}

// ─── Inbox slug ──────────────────────────────────────────────────────────────

export async function setEventInboxSlugCore(eventId: string, raw: string | null, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const slug = raw ? slugifyInboxSlug(raw) : null;
  if (raw && !slug) throw new UserFacingError("The inbox name needs at least one letter or number");
  if (slug) {
    const clash = await prisma.event.findFirst({
      where: { tenantId, inboxSlug: slug, id: { not: eventId } },
      select: { name: true },
    });
    if (clash) throw new UserFacingError(`"${slug}" is already the inbox of ${clash.name}`);
  }
  await prisma.event.update({ where: { id: eventId, tenantId }, data: { inboxSlug: slug, updatedById: userId } });
}

// "Annual Gala" starting 2027-03-04 → "annual-gala-2027", unless the name
// already ends in the year; a taken slug gets -2, -3, …
export async function suggestInboxSlug(eventId: string, tenantId: string): Promise<string> {
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { name: true, startDate: true } });
  if (!event) throw new Error("Event not found");
  const year = String(event.startDate.getUTCFullYear());
  const name = slugifyInboxSlug(event.name) || "event";
  const base = name.endsWith(year) ? name : slugifyInboxSlug(`${name}-${year}`);
  const taken = new Set(
    (
      await prisma.event.findMany({
        where: { tenantId, inboxSlug: { startsWith: base }, id: { not: eventId } },
        select: { inboxSlug: true },
      })
    ).map((e) => e.inboxSlug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// ─── Handed in (MCP, upload) ─────────────────────────────────────────────────

export type SubmitAttachment = { fileName: string; mimeType: string | null; content: Buffer };

// A message handed in by a person — through MCP, or files dropped on the
// event inbox (UPLOAD): stored on the event's inbox from the caller, a
// member, and read like delivered mail.
export async function submitInboundItemCore(
  eventId: string,
  args: { subject: string | null; text: string | null; attachments: SubmitAttachment[] },
  userId: string,
  origin: Exclude<InboundOrigin, "EMAIL"> = "MCP",
) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  if (!args.text?.trim() && args.attachments.length === 0) throw new Error("Give a text body or at least one attachment");
  for (const a of args.attachments) {
    if (!a.fileName.trim()) throw new Error("Each attachment needs a file name");
    if (a.content.length === 0) throw new Error(`${a.fileName} is empty`);
    if (a.content.length > MAX_UPLOAD_BYTES) throw new Error(`${a.fileName} is larger than the upload limit`);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  const row = await prisma.inboundEmail.create({
    data: {
      tenantId,
      eventId,
      origin,
      dedupKey: `${origin.toLowerCase()}:${randomUUID()}`,
      envelopeTo: origin.toLowerCase(),
      sender: user.name ? `${user.name} <${user.email}>` : user.email,
      senderAddress: user.email.toLowerCase(),
      subject: args.subject?.trim() || null,
      receivedAt: new Date(),
      textBody: args.text?.trim() || null,
      senderMatch: "MEMBER",
      status: "RECEIVED",
    },
    select: { id: true, status: true },
  });
  const dir = getUploadDir("inboundEmail", row.id);
  try {
    mkdirSync(dir, { recursive: true });
    const files: Prisma.FileUploadCreateManyInput[] = args.attachments.map((a) => {
      const storedName = storedNameFor(a.fileName);
      writeFileSync(path.join(dir, storedName), a.content);
      return {
        fileName: a.fileName.trim(),
        storedName,
        mimeType: a.mimeType || MIME_BY_EXT[path.extname(a.fileName).toLowerCase()] || "application/octet-stream",
        fileSize: a.content.length,
        inboundEmailId: row.id,
      };
    });
    if (files.length) await prisma.fileUpload.createMany({ data: files });
  } catch (err) {
    await prisma.inboundEmail.delete({ where: { id: row.id } }).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  startInboundParse(row.id);
  return row;
}

// The guests a pickup proposal reads, mapped as the review wizard starts
// them: the sheet through its column mapping, or the rows read from a PDF;
// room types through the proposed map (unmapped codes go to Run of House).
async function proposedGuests(id: string, proposal: InboundProposal): Promise<{ fileName: string | null; guests: PickupGuestRow[] }> {
  const map = new Map((proposal.roomTypes ?? proposal.sheet?.roomTypes ?? []).map((r) => [r.raw, r.roomType]));
  const roomFor = (raw: string) => map.get(raw) ?? null;
  if (proposal.sheet) {
    const file = (await inboundAttachments(id))[proposal.sheet.attachment];
    const kind = file && sheetKind(file.fileName, file.mimeType);
    if (!file || !kind) throw new Error("The spreadsheet this read maps is missing");
    const grid = await readGrid(readFileSync(getUploadPath("inboundEmail", id, file.storedName)), kind);
    const { headers, rows } = gridToRows(grid, proposal.sheet.headerRow - 1);
    const columns = Object.fromEntries(
      Object.entries(proposal.sheet.columns).map(([k, h]) => [k, h && headers.includes(h) ? h : ""]),
    ) as PickupColumns;
    const cancelled = new Set(proposal.sheet.cancelledStatuses);
    const dateOrder = proposal.sheet.dateOrder ?? guessDateOrder(rows, columns);
    return {
      fileName: file.fileName,
      guests: rowsToGuests(rows, columns, roomFor, (raw) => cancelled.has(raw) || DEFAULT_CANCELLED.test(raw), dateOrder),
    };
  }
  if (proposal.guests) return { fileName: null, guests: proposal.guests.map((g) => ({ ...g, roomType: g.roomType ? roomFor(g.roomType) : null })) };
  throw new Error("This read has no guests to import");
}

// The proposal an emailed offer reads as, for applying it unreviewed.
async function offerArgs(eventId: string, offer: ProposalOffer, venueId: string): Promise<ProposalWriteArgs> {
  const tenantId = await requireEventTenantId(eventId);
  const [pending, block, contractTypes] = await Promise.all([
    prisma.customOption.findFirst({
      where: { tenantId, category: "proposal_status" },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
      select: { label: true, group: true },
    }),
    offer.rfpBlockId ? prisma.rfpHotelBlock.findFirst({ where: { id: offer.rfpBlockId, rfp: { eventId } }, select: { id: true, contractType: true, guestType: true } }) : null,
    getOptionsForTenant(tenantId, "hotel_contract_type"),
  ]);
  const status =
    (await prisma.customOption.findFirst({ where: { tenantId, category: "proposal_status", group: "PENDING" }, orderBy: { sortOrder: "asc" }, select: { label: true } }))
      ?.label ?? pending?.label;
  if (!status) throw new Error("No proposal statuses are set up");
  return {
    venueId,
    status,
    leadSourceDirect: false,
    leadSourceVendorId: offer.leadSourceVendorId ?? null,
    leadSourceContactId: null,
    contractType: offerContractType(offer.contractType, block?.contractType ?? null, contractTypes.map(toContractTypeOption)),
    guestType: block?.guestType ?? null,
    submittedOn: offer.submittedOn,
    checkIn: offer.checkIn,
    checkOut: offer.checkOut,
    declinedReason: null,
    notes: offer.hotelNotes,
    revision: 1,
    revisionSummary: null,
    allowedAttrition: offer.allowedAttrition,
    guaranteedRevenue: offer.guaranteedRevenue,
    validUntil: offer.validUntil ?? null,
    taxIncluded: offer.taxIncluded ?? null,
    amenities: offerAmenities(offer),
    nights: offer.nights.map((n) => ({ roomType: n.roomType, night: n.night, rooms: n.rooms, rate: n.rate })),
    charges: offer.charges.map((c) => ({ chargeType: c.chargeType, amount: c.amount, scope: c.scope })),
    meetingCharges: offer.meetingCharges ?? [],
    // Requested rows only answer the RFP of the block it was read as.
    spaces: (offer.spaces ?? []).map((r) => (block ? r : { ...r, spaceRequestId: null })),
    fbMinimum: offer.fbMinimum ?? null,
    fbMinimumScope: offer.fbMinimumScope ?? null,
    fbMinimumNote: offer.fbMinimumNote ?? null,
    fbTaxRate: offer.fbTaxRate ?? null,
    fbServiceCharge: offer.fbServiceCharge ?? null,
    meals: offer.meals ?? [],
    rfpBlockId: block?.id ?? null,
    concessions: block ? offer.concessions.map((c) => ({ concessionId: c.concessionId, offered: c.offered, met: c.met })) : undefined,
    offeredConcessions: offer.offeredConcessions ?? [],
  };
}

export type ApplyAsProposedArgs = {
  blockId?: string | null; // pickup kinds: the block, else the one it was read as
  offerIndex?: number | null; // offers: which one, when the message holds several
  venueId?: string | null; // offers / declines: the hotel, else the one it was read as
  newHotel?: boolean; // an offer from a hotel not in Venues: create it from the offer
  method?: Exclude<HotelPickupMethod, "COUNTS">; // pickup guests: MERGE by default
  vendorId?: string | null; // quotes: the vendor, else the one it was read as
  newVendor?: boolean; // a quote from a vendor not on file: create it by the quote's name
  cateringOrderId?: string | null; // BEOs: the order, else the one it was read as
  target?: ContractTarget | null; // contracts: what it covers, else as read
  targetId?: string | null;
};

// The quote a read proposes, as the quote form's args.
export function quoteArgsFromRead(q: NonNullable<InboundProposal["quote"]>, vendorId: string): QuoteWriteArgs {
  return {
    vendorId,
    reference: q.reference,
    submittedOn: q.submittedOn,
    validUntil: q.validUntil,
    revision: 1,
    serviceCharge: q.serviceCharge,
    tax: q.tax,
    otherFees: q.otherFees,
    depositAmount: q.depositAmount,
    depositDue: q.depositDue,
    cancellationTerms: q.cancellationTerms,
    notes: q.notes,
    lines: q.lines.map((l) => ({ id: null, rfpLineItemId: l.rfpLineItemId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, notes: l.notes })),
  };
}

// The fields a BEO states, as catering-order changes (unstated ones left out).
export function beoArgsFromRead(b: NonNullable<InboundProposal["beo"]>): BeoApplyArgs {
  const out: BeoApplyArgs = {};
  const set = <K extends keyof BeoApplyArgs>(k: K, v: BeoApplyArgs[K] | null) => {
    if (v != null) out[k] = v;
  };
  set("mealType", b.mealType);
  set("serviceStyle", b.serviceStyle);
  set("expectedCount", b.expectedCount);
  set("confirmedCount", b.confirmedCount);
  set("guaranteeCount", b.guaranteeCount);
  set("fbMinimum", b.fbMinimum);
  set("depositDeadline", b.depositDeadline ? dateFromKey(b.depositDeadline) : null);
  set("guaranteeDeadline", b.guaranteeDeadline ? dateFromKey(b.guaranteeDeadline) : null);
  set("paymentDeadline", b.paymentDeadline ? dateFromKey(b.paymentDeadline) : null);
  set("cancellationTerms", b.cancellationTerms);
  set("dietaryNotes", b.dietaryNotes);
  return out;
}

// What a contract read writes, per target: only fields that target holds;
// the rest of its terms become a note.
export function contractArgsFromRead(c: NonNullable<InboundProposal["contract"]>, target: ContractTarget): ContractApplyArgs {
  const status = c.signed === true ? "Contract signed" : c.signed === false ? "Contract sent for signature" : "Contract";
  const unheld = [
    target !== "HOTEL_PROPOSAL" && c.signBy ? `sign by ${formatDateKey(c.signBy)}` : null,
    target !== "VENDOR_QUOTE" && c.depositAmount != null ? `deposit ${formatMoney(String(c.depositAmount))}` : null,
    target === "HOTEL_PROPOSAL" && c.depositDue ? `deposit due ${formatDateKey(c.depositDue)}` : null,
    target !== "HOTEL_PROPOSAL" && c.attrition != null ? `attrition ${c.attrition}%` : null,
    c.cutoffDate ? `cut-off ${formatDateKey(c.cutoffDate)}` : null,
    target === "HOTEL_PROPOSAL" && c.cancellationTerms ? `cancellation: ${c.cancellationTerms}` : null,
    c.notes,
  ].filter(Boolean);
  return {
    ...(target === "VENDOR_QUOTE" && c.depositAmount != null ? { depositAmount: c.depositAmount } : {}),
    ...(target !== "HOTEL_PROPOSAL" && c.depositDue ? { depositDue: c.depositDue } : {}),
    ...(target === "HOTEL_PROPOSAL" && c.attrition != null ? { attrition: c.attrition } : {}),
    ...(target === "HOTEL_PROPOSAL" && c.signBy ? { signBy: c.signBy } : {}),
    ...(target !== "HOTEL_PROPOSAL" && c.cancellationTerms ? { cancellationTerms: c.cancellationTerms } : {}),
    note: `${status}${unheld.length ? `: ${unheld.join("; ")}` : ""}`,
  };
}

// Applies a Ready item as Claude read it, without the review form (MCP).
// Pickup goes to the block, a decline marks the hotel on its RFP, an offer
// becomes a proposal. Returns what was done.
// Each branch's apply core checks WRITE on its kind's resource.
export async function applyInboundAsProposedCore(id: string, eventId: string, args: ApplyAsProposedArgs, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const item = await inboxItem(id, tenantId, eventId);
  const proposal = item.proposal as InboundProposal | null;
  if (item.status !== "PARSED" || !proposal) throw new Error("This message has nothing to apply");
  switch (proposal.kind) {
    case "PICKUP_COUNTS":
    case "PICKUP_GUESTS": {
      const blockId = args.blockId ?? proposal.blockId;
      if (!blockId) throw new Error("Which block? Pass blockId (list_hotel_blocks)");
      if (proposal.kind === "PICKUP_COUNTS") {
        const block = await prisma.hotelBlock.findFirst({ where: { id: blockId, proposal: { eventId } }, select: { nights: { select: { roomType: true } } } });
        if (!block) throw new Error("Hotel block not found");
        // As in the review: counts for a room type the block doesn't have are left out.
        const types = new Set(block.nights.map((n) => n.roomType));
        const counts = (proposal.counts ?? []).filter((c) => types.has(c.roomType));
        await applyInboundPickupCore(id, eventId, blockId, { type: "counts", counts }, userId);
        return { applied: "counts", blockId, counts: counts.length, skipped: (proposal.counts?.length ?? 0) - counts.length };
      }
      const { fileName, guests } = await proposedGuests(id, proposal);
      await applyInboundPickupCore(id, eventId, blockId, { type: "guests", method: args.method ?? "MERGE", fileName, guests }, userId);
      return { applied: "guests", blockId, guests: guests.length };
    }
    case "RFP_DECLINE": {
      const rfpId = proposal.decline?.rfpId;
      const venueId = args.venueId ?? proposal.decline?.venueId;
      if (!rfpId || !venueId) throw new Error("This decline names no RFP or hotel; mark it on the RFP with update_rfp_recipient, then dismiss this item");
      await applyInboundDeclineCore(id, eventId, rfpId, venueId, proposal.decline?.reason ?? null, userId);
      return { applied: "decline", rfpId, venueId };
    }
    case "RFP_PROPOSAL": {
      const offers = proposalOffers(proposal);
      const outcomes = offerOutcomes(proposal);
      const open = offers.flatMap((o, i) => (outcomes[i] ? [] : [`${i}: ${o.hotel?.name ?? "unnamed hotel"}`]));
      if (args.offerIndex == null && offers.length > 1) throw new Error(`This message holds ${offers.length} offers; pass offerIndex (still open: ${open.join("; ")})`);
      const index = args.offerIndex ?? 0;
      const offer = offers[index];
      if (!offer) throw new Error("This read has no such offer");
      const venueId = args.venueId ?? offer.venueId;
      if (!venueId && !args.newHotel) throw new Error("The offer's hotel isn't in Venues: pass venueId, or newHotel: true to add it from the offer");
      const proposalArgs = await offerArgs(eventId, offer, venueId ?? "");
      const { proposalId, next } = await applyInboundOfferCore(id, eventId, index, proposalArgs, venueId ? null : offer.hotel, null, userId);
      return { applied: "proposal", proposalId, offerIndex: index, nextOfferIndex: next };
    }
    case "VENDOR_QUOTE": {
      const q = proposal.quote;
      if (!q) throw new Error("This read has no quote");
      const vendorId = args.vendorId ?? q.vendorId;
      if (!vendorId && !(args.newVendor && q.vendorName)) throw new Error("The quote's vendor isn't on file: pass vendorId, or newVendor: true to add it by the quote's name");
      const quoteId = await applyInboundQuoteCore(id, eventId, q.rfpId, quoteArgsFromRead(q, vendorId ?? ""), vendorId ? null : q.vendorName, userId);
      return { applied: "quote", quoteId };
    }
    case "BEO": {
      const b = proposal.beo;
      const orderId = args.cateringOrderId ?? b?.cateringOrderId;
      if (!b || !orderId) throw new Error("Which catering order? Pass cateringOrderId (list_catering_orders)");
      const changes = beoArgsFromRead(b);
      await applyInboundBeoCore(id, eventId, orderId, changes, userId);
      return { applied: "beo", cateringOrderId: orderId, fields: Object.keys(changes) };
    }
    case "CONTRACT": {
      const c = proposal.contract;
      const target = args.target ?? c?.target;
      const targetId = args.targetId ?? c?.targetId;
      if (!c || !target || !targetId) throw new Error("What does it cover? Pass target (HOTEL_PROPOSAL, VENDOR_QUOTE, CATERING_ORDER) and targetId");
      await applyInboundContractCore(id, eventId, target, targetId, contractArgsFromRead(c, target), userId);
      return { applied: "contract", target, targetId };
    }
    case "OTHER":
      throw new Error("Nothing to apply: file its attachments or dismiss it");
    default: {
      const _exhaustive: never = proposal.kind;
      throw new Error(`Unhandled kind: ${_exhaustive}`);
    }
  }
}
