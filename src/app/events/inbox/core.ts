import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma, type HotelPickupMethod, type InboundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { getUploadDir, getUploadPath, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { blockTypeLabel, dateKey, formatNight, roomTypeLabel } from "@/lib/hotels";
import { readGrid, sheetKind } from "@/lib/spreadsheetRows";
import type { PickupGuestRow } from "@/lib/pickupMapping";
import {
  isParsingConfigured,
  parseInboundMessage,
  ParseError,
  type InboundProposal,
  type OfferHotel,
  type ParseAttachment,
  type ParseBlock,
  type ParseRfp,
  type ParseVenue,
} from "@/lib/inboundParse";
import { importPickupGuestsCore, savePickupCountsCore, type PickupCountArgs } from "@/app/events/hotels/blockCore";
import { createHotelProposalCore, type ProposalWriteArgs } from "@/app/events/hotels/core";
import { updateRfpRecipientCore } from "@/app/events/rfps/core";
import { createAndAddVenueContactCore, createVenueCore } from "@/app/venues/core";
import { EMAIL_SOURCE_FILE_TYPE, OPEN_STATUSES } from "./views";
import { buildDedupKey, formatSender, parseInboxAddress, readMessage, slugifyInboxSlug } from "@/lib/inboundMail";

// Event inboxes (docs/proposals/email-ingest.md). No "use server": the ingest
// is called by the signed /api/inbound-email route, and the person-facing
// cores take a userId the caller has already authenticated.

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
      fileType: EMAIL_SOURCE_FILE_TYPE,
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
      nights: { select: { roomType: true } },
      proposal: { select: { venue: { select: { name: true } } } },
    },
  });
  return blocks.map((b) => ({
    id: b.id,
    hotel: b.proposal.venue.name,
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
export async function inboundAttachments(id: string) {
  return prisma.fileUpload.findMany({
    where: { inboundEmailId: id, fileType: null },
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
    const [blocks, attachments, rfpContext] = await Promise.all([
      parseBlocks(event.id),
      readAttachments(id),
      parseRfpContext(event.id, item.tenantId, senders),
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
      attachments,
    });
    await settle({ status: "PARSED", kind: proposal.kind, proposal, model, error: null });
  } catch (err) {
    await settle({ status: "FAILED", error: parseFailure(err) });
  }
}

// Re-read: a failed read, a wrong guess, or one that never finished.
export async function reparseInboundEmailCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const item = await inboxItem(id, await requireEventTenantId(eventId), eventId);
  if (!["RECEIVED", "PARSED", "FAILED"].includes(item.status)) return;
  if (!isParsingConfigured()) throw new Error("Parsing isn't configured");
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
  if (item.status !== "PARSED") throw new Error("This message has nothing to apply");
  const claimed = await prisma.inboundEmail.updateMany({
    where: { id, tenantId, eventId, status: "PARSED" },
    data: { status: "APPLIED", handledById: userId, handledAt: new Date() },
  });
  if (claimed.count === 0) throw new Error("This message was already applied");
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

// A hotel's offer, as reviewed in the proposal form: creates the proposal
// (and first the hotel, when it's one not in Venues yet) and files the
// message's attachments on it. Returns the new proposal's id.
export async function applyInboundOfferCore(
  id: string,
  eventId: string,
  args: ProposalWriteArgs,
  newHotel: OfferHotel | null,
  userId: string,
): Promise<string> {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  let proposalId = "";
  await claimAndApply(id, eventId, userId, async () => {
    const venueId = newHotel ? (await createOfferHotel(eventId, newHotel, userId)).id : args.venueId;
    const proposal = await createHotelProposalCore(eventId, { ...args, venueId }, userId);
    proposalId = proposal.id;
    const files = await inboundAttachments(id);
    if (files.length) {
      mkdirSync(getUploadDir("hotelProposal", proposal.id), { recursive: true });
      for (const f of files) {
        copyFileSync(getUploadPath("inboundEmail", id, f.storedName), getUploadPath("hotelProposal", proposal.id, f.storedName));
      }
      await prisma.fileUpload.createMany({
        data: files.map((f) => ({
          fileName: f.fileName,
          storedName: f.storedName,
          mimeType: f.mimeType,
          fileSize: f.fileSize,
          hotelProposalId: proposal.id,
        })),
      });
    }
    return { appliedProposalId: proposal.id };
  });
  return proposalId;
}

// A hotel an offer came from that the org doesn't have yet: a lodging venue
// with the offer's contact. A venue with the same name is refused, so it gets
// picked instead.
async function createOfferHotel(eventId: string, hotel: OfferHotel, userId: string) {
  const tenantId = await requireEventTenantId(eventId);
  const name = hotel.name?.trim();
  if (!name) throw new Error("The hotel needs a name");
  const same = await prisma.venue.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (same) throw new Error(`${name} is already in Venues; choose it as the hotel`);
  const clean = (v: string | null) => v?.trim() || null;
  const venue = await createVenueCore(
    { name, address: clean(hotel.address), city: clean(hotel.city), state: clean(hotel.state), zip: clean(hotel.zip), country: null, notes: null, isLodging: true },
    userId,
    tenantId,
  );
  const first = clean(hotel.contactFirstName);
  const last = clean(hotel.contactLastName);
  if (first || last) {
    const link = await createAndAddVenueContactCore(
      { venueId: venue.id, firstName: first ?? "", lastName: last ?? "", email: clean(hotel.contactEmail), organization: name, role: clean(hotel.contactTitle) },
      userId,
      tenantId,
    );
    const phone = clean(hotel.contactPhone);
    if (phone) await prisma.contact.update({ where: { id: link.contactId, tenantId }, data: { phone } });
  }
  return venue;
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
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId } });
  if (!item) throw new Error("Inbox item not found");
  return item;
}

// HELD → RECEIVED. Only routed mail: Unrouted mail is routed first.
export async function releaseInboundEmailCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
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
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId ?? { tenantId });
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status === "APPLIED" || item.status === "DISMISSED") return;
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: { status: "DISMISSED", handledById: userId, handledAt: new Date() },
  });
}

// Back from Dismissed (until it's purged). Lands in Held: a person looks again.
export async function restoreInboundEmailCore(id: string, eventId: string | null, tenantId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId ?? { tenantId });
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
  await requirePermissionForUser(userId, "HOTELS", "WRITE", fromEventId ?? { tenantId });
  await requirePermissionForUser(userId, "HOTELS", "WRITE", toEventId);
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
  if (raw && !slug) throw new Error("The inbox name needs at least one letter or number");
  if (slug) {
    const clash = await prisma.event.findFirst({
      where: { tenantId, inboxSlug: slug, id: { not: eventId } },
      select: { name: true },
    });
    if (clash) throw new Error(`"${slug}" is already the inbox of ${clash.name}`);
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
