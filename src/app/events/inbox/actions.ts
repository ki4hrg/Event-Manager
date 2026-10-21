"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readFileSync } from "fs";
import type { HotelPickupMethod, InboundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getInboundEmailDomain } from "@/lib/email";
import { getUploadPath } from "@/lib/uploads";
import { dateKey } from "@/lib/hotels";
import { gridToRows, readGrid, sheetKind } from "@/lib/spreadsheetRows";
import { DEFAULT_CANCELLED, distinctValues, PICKUP_FIELD_KEYS, type PickupColumns, type PickupGuestRow } from "@/lib/pickupMapping";
import type { InboundProposal } from "@/lib/inboundParse";
import { eventScopeWhere } from "@/app/events/core";
import type { PickupCountArgs } from "@/app/events/hotels/blockCore";
import { readProposal } from "@/app/events/hotels/proposalArgs";
import { getProposalFormChoices } from "@/app/events/hotels/actions";
import type { ProposalValues, ConcessionAnswer } from "@/app/events/hotels/ProposalForm";
import {
  applyInboundDeclineCore,
  applyInboundOfferCore,
  applyInboundPickupCore,
  dismissInboundEmailCore,
  fileInboundAttachmentCore,
  inboundAttachments,
  purgeDismissedInboundEmails,
  releaseInboundEmailCore,
  reparseInboundEmailCore,
  restoreInboundEmailCore,
  routeInboundEmailCore,
  setEventInboxSlugCore,
  suggestInboxSlug,
} from "./core";
import { INBOX_VIEW_STATUSES, type InboxView } from "./views";

const listSelect = {
  id: true,
  sender: true,
  forwardedFrom: true,
  subject: true,
  receivedAt: true,
  status: true,
  kind: true,
  senderMatch: true,
  envelopeTo: true,
  _count: { select: { files: { where: { fileType: null } } } },
} as const;

// ─── Event inbox ─────────────────────────────────────────────────────────────

export async function getEventInbox(eventId: string, view: InboxView) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  await purgeDismissedInboundEmails(tenantId).catch(() => {});
  const [items, counts] = await Promise.all([
    prisma.inboundEmail.findMany({
      where: { tenantId, eventId, status: { in: INBOX_VIEW_STATUSES[view] } },
      select: listSelect,
      orderBy: { receivedAt: "desc" },
    }),
    prisma.inboundEmail.groupBy({ by: ["status"], where: { tenantId, eventId }, _count: true }),
  ]);
  const count = (statuses: InboundStatus[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);
  return {
    items,
    counts: { inbox: count(INBOX_VIEW_STATUSES.inbox), held: count(INBOX_VIEW_STATUSES.held) },
  };
}

// eventId null: an Unrouted item of the active tenant.
export async function getInboxItem(id: string, eventId: string | null) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  const item = await prisma.inboundEmail.findFirst({
    where: { id, tenantId, eventId },
    include: {
      files: { orderBy: { createdAt: "asc" } },
      handledBy: { select: { name: true, email: true } },
    },
  });
  if (!item) return null;
  // An attachment is filed when the event holds a copy with its storedName.
  const filed = eventId
    ? await prisma.fileUpload.findMany({
        where: { eventId, storedName: { in: item.files.map((f) => f.storedName) } },
        select: { storedName: true },
      })
    : [];
  return { ...item, filedStoredNames: filed.map((f) => f.storedName) };
}

export async function releaseInboundEmail(id: string, eventId: string) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await releaseInboundEmailCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
}

export async function dismissInboundEmail(id: string, eventId: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await dismissInboundEmailCore(id, eventId, session.tenantId, session.user.id);
  revalidatePath(eventId ? `/events/${eventId}/inbox` : "/inbox");
}

export async function restoreInboundEmail(id: string, eventId: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await restoreInboundEmailCore(id, eventId, session.tenantId, session.user.id);
  revalidatePath(eventId ? `/events/${eventId}/inbox` : "/inbox");
}

// Moves an item to another event, or routes an Unrouted one (fromEventId null).
export async function routeInboundEmail(id: string, fromEventId: string | null, toEventId: string) {
  const session = await requirePermission("HOTELS", "WRITE", fromEventId);
  await routeInboundEmailCore(id, fromEventId, toEventId, session.tenantId, session.user.id);
  revalidatePath(fromEventId ? `/events/${fromEventId}/inbox` : "/inbox");
  revalidatePath(`/events/${toEventId}/inbox`);
  redirect(`/events/${toEventId}/inbox/${id}?success=Moved`);
}

export async function fileInboundAttachment(fileId: string, id: string, eventId: string) {
  const session = await requirePermission("FILES", "WRITE", eventId);
  await fileInboundAttachmentCore(fileId, id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/inbox/${id}`);
  revalidatePath(`/events/${eventId}/files`);
}

export async function reparseInboundEmail(id: string, eventId: string) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await reparseInboundEmailCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
}

export async function applyInboundGuests(
  id: string,
  eventId: string,
  blockId: string,
  method: Exclude<HotelPickupMethod, "COUNTS">,
  fileName: string | null,
  guests: PickupGuestRow[],
) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await applyInboundPickupCore(id, eventId, blockId, { type: "guests", method, fileName, guests }, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/hotels/blocks/${blockId}`);
}

export async function applyInboundCounts(id: string, eventId: string, blockId: string, counts: PickupCountArgs[]) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await applyInboundPickupCore(id, eventId, blockId, { type: "counts", counts }, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/hotels/blocks/${blockId}`);
}

// A hotel's offer as reviewed in the proposal form: creates the proposal and
// opens it.
export async function applyInboundOffer(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  const proposalId = await applyInboundOfferCore(id, eventId, readProposal(formData), session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/hotels`);
  redirect(`/events/${eventId}/hotels/proposals/${proposalId}?success=Proposal created`);
}

export async function applyInboundDecline(id: string, eventId: string, rfpId: string, venueId: string, reason: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await applyInboundDeclineCore(id, eventId, rfpId, venueId, reason, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/hotels/rfps/${rfpId}`);
}

// The proposal form, filled from a hotel's offer: the draft, the concessions
// of the RFP it answers, and the RFP block it starts from.
export async function getOfferReview(id: string, eventId: string) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId }, select: { proposal: true } });
  const proposal = item?.proposal as InboundProposal | null;
  const offer = proposal?.kind === "RFP_PROPOSAL" ? proposal.offer : null;
  if (!offer) return null;
  const [choices, rfpBlock, existing] = await Promise.all([
    getProposalFormChoices(eventId),
    offer.rfpBlockId
      ? prisma.rfpHotelBlock.findFirst({
          where: { id: offer.rfpBlockId, rfp: { eventId } },
          select: { id: true, contractType: true, guestType: true, rfp: { select: { concessions: { orderBy: { sortOrder: "asc" } } } } },
        })
      : null,
    offer.venueId
      ? prisma.hotelProposal.findMany({
          where: { eventId, venueId: offer.venueId },
          select: { id: true, revision: true, status: true },
        })
      : [],
  ]);
  const pending = choices.statuses.find((s) => s.group === "PENDING")?.label ?? choices.statuses[0]?.label ?? "";
  const draft: ProposalValues = {
    venueId: offer.venueId ?? "",
    status: pending,
    leadSource: null,
    contractType: rfpBlock?.contractType ?? null,
    guestType: rfpBlock?.guestType ?? null,
    submittedOn: offer.submittedOn,
    checkIn: offer.checkIn,
    checkOut: offer.checkOut,
    declinedReason: null,
    notes: offer.hotelNotes,
    revision: 1,
    allowedAttrition: offer.allowedAttrition != null ? String(offer.allowedAttrition) : null,
    guaranteedRevenue: offer.guaranteedRevenue != null ? String(offer.guaranteedRevenue) : null,
    amenities: offer.amenities,
    nights: offer.nights.map((n) => ({ roomType: n.roomType, night: n.night, rooms: n.rooms, rate: n.rate != null ? String(n.rate) : null })),
    charges: offer.charges.map((c) => ({ chargeType: c.chargeType, amount: c.amount != null ? String(c.amount) : null, scope: c.scope })),
  };
  const answers = new Map(offer.concessions.map((c) => [c.concessionId, c]));
  const concessions: ConcessionAnswer[] = (rfpBlock?.rfp.concessions ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    value: c.value,
    required: c.required,
    offered: answers.get(c.id)?.offered ?? null,
    met: answers.get(c.id)?.met ?? null,
  }));
  return { choices, draft, concessions, rfpBlock: rfpBlock ? { id: rfpBlock.id, contractType: rfpBlock.contractType, guestType: rfpBlock.guestType } : null, existing };
}

// RFPs a decline could be for, with the hotels each went to.
export async function getDeclineReview(id: string, eventId: string) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId }, select: { proposal: true } });
  const proposal = item?.proposal as InboundProposal | null;
  if (proposal?.kind !== "RFP_DECLINE") return null;
  const rfps = await prisma.rfp.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      recipients: {
        where: { venueId: { not: null } },
        select: { declinedToBid: true, venue: { select: { id: true, name: true } } },
        orderBy: { venue: { name: "asc" } },
      },
    },
  });
  return {
    decline: proposal.decline ?? { rfpId: null, venueId: null, reason: null },
    rfps: rfps.map((r) => ({
      id: r.id,
      title: r.title,
      hotels: r.recipients.flatMap((x) => (x.venue ? [{ id: x.venue.id, name: x.venue.name, declined: x.declinedToBid }] : [])),
    })),
  };
}

// What the review of a pickup proposal needs: the event's blocks to apply to,
// and for a spreadsheet, its rows read from the stored attachment with the
// proposed mapping (the reviewer adjusts it in the wizard before applying).
export async function getInboxReview(id: string, eventId: string) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId }, select: { proposal: true, subject: true } });
  const proposal = item?.proposal as InboundProposal | null;
  if (!item || !proposal || (proposal.kind !== "PICKUP_GUESTS" && proposal.kind !== "PICKUP_COUNTS")) return null;

  const [blocks, roomTypeOptions] = await Promise.all([
    prisma.hotelBlock.findMany({
      where: { proposal: { eventId } },
      select: {
        id: true,
        checkIn: true,
        checkOut: true,
        nights: { select: { roomType: true } },
        pickupCounts: { select: { night: true, roomType: true, rooms: true } },
        _count: { select: { pickupGuests: true } },
        proposal: { select: { venue: { select: { name: true } } } },
      },
      orderBy: [{ isHq: "desc" }, { createdAt: "asc" }],
    }),
    prisma.customOption.findMany({
      where: { tenantId, category: "hotel_room_type" },
      select: { label: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  let sheet: {
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
    columns: PickupColumns;
    roomMap: Record<string, string>;
    statusMap: Record<string, boolean>;
  } | null = null;
  if (proposal.kind === "PICKUP_GUESTS" && proposal.sheet) {
    const file = (await inboundAttachments(id))[proposal.sheet.attachment];
    const kind = file && sheetKind(file.fileName, file.mimeType);
    if (file && kind) {
      const grid = await readGrid(readFileSync(getUploadPath("inboundEmail", id, file.storedName)), kind);
      const { headers, rows } = gridToRows(grid, proposal.sheet.headerRow - 1);
      // Only headers that exist; the wizard shows the rest unmapped.
      const columns = Object.fromEntries(
        PICKUP_FIELD_KEYS.map((k) => {
          const h = proposal.sheet!.columns[k];
          return [k, h && headers.includes(h) ? h : ""];
        }),
      ) as PickupColumns;
      const cancelled = new Set(proposal.sheet.cancelledStatuses);
      const statusMap = Object.fromEntries(
        distinctValues(rows, columns.status).map((raw) => [raw, cancelled.has(raw) || DEFAULT_CANCELLED.test(raw)]),
      );
      const roomMap = Object.fromEntries(proposal.sheet.roomTypes.map((r) => [r.raw, r.roomType ?? ""]));
      sheet = { fileName: file.fileName, headers, rows, columns, roomMap, statusMap };
    }
  }

  return {
    proposal,
    fileName: item.subject ? `Email: ${item.subject}` : "Email",
    tenantRoomTypes: roomTypeOptions.map((o) => o.label),
    sheet,
    blocks: blocks.map((b) => ({
      id: b.id,
      hotel: b.proposal.venue.name,
      checkIn: b.checkIn ? dateKey(b.checkIn) : null,
      checkOut: b.checkOut ? dateKey(b.checkOut) : null,
      roomTypes: Array.from(new Set(b.nights.map((n) => n.roomType))),
      hasGuests: b._count.pickupGuests > 0,
      counts: b.pickupCounts.map((c) => ({ night: dateKey(c.night), roomType: c.roomType, rooms: c.rooms })),
    })),
  };
}

// Events an item can move to: ones the user can see in the active tenant.
// Each move still checks HOTELS WRITE on the destination.
export async function getInboxDestinationEvents(excludeEventId: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", excludeEventId);
  return prisma.event.findMany({
    where: {
      AND: [await eventScopeWhere(session.user.id, session.tenantId), excludeEventId ? { id: { not: excludeEventId } } : {}],
    },
    select: { id: true, name: true, startDate: true },
    orderBy: { startDate: "desc" },
  });
}

// ─── Unrouted (org-level) ────────────────────────────────────────────────────

export async function getUnroutedInbox(view: InboxView) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW");
  await purgeDismissedInboundEmails(tenantId).catch(() => {});
  return prisma.inboundEmail.findMany({
    where: { tenantId, eventId: null, status: { in: INBOX_VIEW_STATUSES[view] } },
    select: listSelect,
    orderBy: { receivedAt: "desc" },
  });
}

export async function countUnroutedInbox() {
  const { tenantId } = await requirePermission("HOTELS", "VIEW");
  return prisma.inboundEmail.count({ where: { tenantId, eventId: null, status: "HELD" } });
}

// ─── Inbox address ───────────────────────────────────────────────────────────

export async function getEventInboxAddress(eventId: string) {
  const { tenantId } = await requirePermission("EVENTS", "WRITE", eventId);
  const [event, tenant] = await Promise.all([
    prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { inboxSlug: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
  ]);
  return {
    domain: getInboundEmailDomain(),
    tenantSlug: tenant?.slug ?? "",
    inboxSlug: event?.inboxSlug ?? null,
    suggestion: event?.inboxSlug ? null : await suggestInboxSlug(eventId, tenantId),
  };
}

export async function setEventInboxSlug(eventId: string, slug: string | null) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await setEventInboxSlugCore(eventId, slug, session.user.id);
  revalidatePath(`/events/${eventId}/settings`);
  revalidatePath(`/events/${eventId}/inbox`);
}
