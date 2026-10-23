"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readFileSync } from "fs";
import type { HotelPickupMethod, InboundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { resourceForKind } from "@/lib/rfp/kinds";
import { getInboundEmailDomain } from "@/lib/email";
import { getUploadPath } from "@/lib/uploads";
import { blockTypeLabel, dateKey } from "@/lib/hotels";
import { gridToRows, readGrid, sheetKind } from "@/lib/spreadsheetRows";
import { DEFAULT_CANCELLED, distinctValues, PICKUP_FIELD_KEYS, type PickupColumns, type PickupGuestRow } from "@/lib/pickupMapping";
import {
  offerAmenities,
  offerAttachmentIndexes,
  offerOutcomes,
  proposalOffers,
  type InboundProposal,
  type OfferCharge,
  type OfferHotel,
} from "@/lib/inboundParse";
import { meetingRequests, rfpMealTypes } from "@/lib/rfp/proposalSpace";
import { eventScopeWhere } from "@/app/events/core";
import type { PickupCountArgs } from "@/app/events/hotels/blockCore";
import { readNewHotel, readProposal } from "@/app/events/hotels/proposalArgs";
import { getProposalFormChoices } from "@/app/events/hotels/actions";
import type { ConcessionAnswer, OfferedConcession, ProposalValues, RfpChoice } from "@/app/events/hotels/ProposalForm";
import { toProposalValues } from "@/app/events/hotels/core";
import {
  applyInboundDeclineCore,
  applyInboundBeoCore,
  applyInboundContractCore,
  contractTargetResource,
  applyInboundQuoteCore,
  beoArgsFromRead,
  contractArgsFromRead,
  quoteArgsFromRead,
  applyInboundOfferCore,
  applyInboundRevisionCore,
  applyInboundPickupCore,
  skipInboundOfferCore,
  dismissInboundEmailCore,
  fileInboundAttachmentCore,
  inboundAttachments,
  orgInboxWhere,
  purgeDismissedInboundEmails,
  releaseInboundEmailCore,
  reparseInboundEmailCore,
  restoreInboundEmailCore,
  routeInboundEmailCore,
  setEventInboxSlugCore,
  suggestInboxSlug,
} from "./core";
import { INBOX_VIEW_STATUSES, NEW_VENDOR, type InboxView } from "./views";
import { CONTRACT_TARGETS, type ContractTarget } from "@/lib/inboundParse";
import { quoteResource, type QuoteLineArgs } from "@/app/events/quotes/core";
import { formatDateKey, formatMoney } from "@/lib/hotels";

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
// Reading and triage are EVENTS; applying needs WRITE on the kind's resource
// (see the permissions note in ./core).

export async function getEventInbox(eventId: string, view: InboxView) {
  const { tenantId } = await requirePermission("EVENTS", "VIEW", eventId);
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
  const { tenantId } = await requirePermission("EVENTS", "VIEW", eventId);
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
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await releaseInboundEmailCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  redirect(`/events/${eventId}/inbox/${id}?success=Released`);
}

export async function dismissInboundEmail(id: string, eventId: string | null) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await dismissInboundEmailCore(id, eventId, session.tenantId, session.user.id);
  revalidatePath(eventId ? `/events/${eventId}/inbox` : "/inbox");
  // Back to the list, for the next item.
  redirect(eventId ? `/events/${eventId}/inbox?success=Dismissed` : "/inbox?view=held&success=Dismissed");
}

export async function restoreInboundEmail(id: string, eventId: string | null) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await restoreInboundEmailCore(id, eventId, session.tenantId, session.user.id);
  revalidatePath(eventId ? `/events/${eventId}/inbox` : "/inbox");
  redirect(`${eventId ? `/events/${eventId}/inbox` : "/inbox"}/${id}?success=Restored`);
}

// Moves an item to another event, or routes an Unrouted one (fromEventId null).
export async function routeInboundEmail(id: string, fromEventId: string | null, toEventId: string) {
  const session = await requirePermission("EVENTS", "WRITE", fromEventId);
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
  redirect(`/events/${eventId}/inbox/${id}?success=Filed on event`);
}

export async function reparseInboundEmail(id: string, eventId: string) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await reparseInboundEmailCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  redirect(`/events/${eventId}/inbox/${id}?success=Reading again`);
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


// After saving one of a message's offers: the proposal just saved, or the
// event's proposals once the message has made more than one (the rest stay
// open in the Inbox).
function savedOfferRedirect(eventId: string, proposalId: string, saved: number, done: string): never {
  const success = `success=${encodeURIComponent(done)}`;
  redirect(saved > 1 ? `/events/${eventId}/hotels?${success}#proposals` : `/events/${eventId}/hotels/proposals/${proposalId}?${success}`);
}

// The attachments the review picked to file on the proposal; null when the
// form had no picker (the read decides).
const readAttachmentPick = (formData: FormData) =>
  formData.get("attachmentPick") === "true" ? (formData.getAll("attachmentIds") as string[]) : null;

// A hotel's offer as reviewed in the proposal form: creates the proposal (and
// the hotel, when it's a new one).
export async function applyInboundOffer(id: string, eventId: string, index: number, formData: FormData) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  const args = readProposal(formData);
  const newHotel = readNewHotel(formData);
  const { proposalId, saved } = await applyInboundOfferCore(id, eventId, index, args, newHotel, readAttachmentPick(formData), session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/hotels`);
  if (newHotel) revalidatePath("/venues");
  savedOfferRedirect(eventId, proposalId, saved, saved > 1 ? `${saved} proposals created` : "Proposal created");
}

// A revised offer applied to the hotel's proposal it revises.
export async function applyInboundRevision(id: string, eventId: string, index: number, proposalId: string, formData: FormData) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  const { saved } = await applyInboundRevisionCore(id, eventId, index, proposalId, readProposal(formData), readAttachmentPick(formData), session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/hotels`);
  savedOfferRedirect(eventId, proposalId, saved, "Revision saved");
}

export async function skipInboundOffer(id: string, eventId: string, index: number) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  const next = await skipInboundOfferCore(id, eventId, index, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  const success = `success=${encodeURIComponent("Offer skipped")}`;
  redirect(next != null ? `/events/${eventId}/inbox/${id}?offer=${next + 1}&${success}` : `/events/${eventId}/inbox?${success}`);
}

export async function applyInboundDecline(id: string, eventId: string, rfpId: string, venueId: string, reason: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await applyInboundDeclineCore(id, eventId, rfpId, venueId, reason, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/hotels/rfps/${rfpId}`);
}

// The offers a message holds, each with what became of it: a proposal saved
// from it (and the hotel's name), skipped, or still to review.
export async function getInboundOffers(id: string, eventId: string) {
  const { tenantId } = await requirePermission("EVENTS", "VIEW", eventId);
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId }, select: { proposal: true } });
  const proposal = item?.proposal as InboundProposal | null;
  const offers = proposalOffers(proposal);
  if (!proposal || !offers.length) return [];
  const outcomes = offerOutcomes(proposal);
  const ids = outcomes.flatMap((o) => (o && "proposalId" in o ? [o.proposalId] : []));
  const venueIds = offers.flatMap((o) => (o.venueId ? [o.venueId] : []));
  const [proposals, venues] = await Promise.all([
    ids.length ? prisma.hotelProposal.findMany({ where: { id: { in: ids }, eventId }, select: { id: true, venue: { select: { name: true } } } }) : [],
    venueIds.length ? prisma.venue.findMany({ where: { id: { in: venueIds }, tenantId }, select: { id: true, name: true } }) : [],
  ]);
  return offers.map((o, i) => {
    const outcome = outcomes[i];
    const saved = outcome && "proposalId" in outcome ? proposals.find((p) => p.id === outcome.proposalId) : undefined;
    return {
      name: saved?.venue.name ?? venues.find((v) => v.id === o.venueId)?.name ?? o.hotel?.name ?? `Hotel ${i + 1}`,
      state: !outcome ? ("OPEN" as const) : "skipped" in outcome ? ("SKIPPED" as const) : "pending" in outcome ? ("SAVING" as const) : ("SAVED" as const),
      proposalId: saved?.id ?? null,
    };
  });
}

const text = (n: number | null | undefined) => (n != null ? String(n) : null);
const chargeValue = (c: OfferCharge) => ({ chargeType: c.chargeType, amount: text(c.amount), scope: c.scope });
const sameSpace = (a: { spaceRequestId: string | null; name: string }, b: { spaceRequestId: string | null; name: string }) =>
  a.spaceRequestId ? a.spaceRequestId === b.spaceRequestId : !b.spaceRequestId && a.name.toLowerCase() === b.name.toLowerCase();

// The proposal form, filled from one of a message's hotel offers: the draft,
// and the event's RFP blocks it could answer, defaulting to the one it was
// read as (none: a standalone proposal).
export async function getOfferReview(id: string, eventId: string, index: number) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId }, select: { proposal: true } });
  const proposal = item?.proposal as InboundProposal | null;
  const offer = proposalOffers(proposal)[index];
  if (!proposal || !offer || offerOutcomes(proposal)[index]) return null;
  // Not matched to a candidate: an existing venue with the offer's hotel name
  // is the one; otherwise the reviewer can add the hotel.
  const byName =
    !offer.venueId && offer.hotel?.name
      ? await prisma.venue.findFirst({ where: { tenantId, name: { equals: offer.hotel.name.trim(), mode: "insensitive" } }, select: { id: true } })
      : null;
  const venueId = offer.venueId ?? byName?.id ?? null;
  const [choices, files, rfps, existing] = await Promise.all([
    getProposalFormChoices(eventId),
    inboundAttachments(id),
    prisma.rfp.findMany({
      where: { eventId, kind: "HOTEL", hotelBlocks: { some: {} } },
      orderBy: { createdAt: "asc" },
      select: {
        title: true,
        concessions: { orderBy: { sortOrder: "asc" } },
        spaceRequests: { orderBy: { sortOrder: "asc" } },
        hotelBlocks: { orderBy: { sortOrder: "asc" }, select: { id: true, contractType: true, guestType: true } },
      },
    }),
    venueId
      ? prisma.hotelProposal.findMany({
          where: { eventId, venueId },
          orderBy: { updatedAt: "desc" },
          include: {
            venue: { select: { name: true } },
            nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
            charges: { orderBy: { sortOrder: "asc" } },
            amenities: { orderBy: { sortOrder: "asc" } },
            concessions: { orderBy: { sortOrder: "asc" }, include: { concession: { select: { label: true } } } },
            spaces: { orderBy: { sortOrder: "asc" } },
            meals: { orderBy: { sortOrder: "asc" } },
            rfp: { select: { title: true, concessions: { orderBy: { sortOrder: "asc" } }, spaceRequests: { orderBy: { sortOrder: "asc" } } } },
          },
        })
      : [],
  ]);
  const pending = choices.statuses.find((s) => s.group === "PENDING")?.label ?? choices.statuses[0]?.label ?? "";
  const draft: ProposalValues = {
    venueId: venueId ?? "",
    status: pending,
    leadSourceDirect: false,
    leadSourceVendorId: offer.leadSourceVendorId ?? null,
    leadSourceContactId: null,
    contractType: null,
    guestType: null,
    submittedOn: offer.submittedOn,
    checkIn: offer.checkIn,
    checkOut: offer.checkOut,
    declinedReason: null,
    notes: offer.hotelNotes,
    revision: 1,
    allowedAttrition: offer.allowedAttrition != null ? String(offer.allowedAttrition) : null,
    guaranteedRevenue: offer.guaranteedRevenue != null ? String(offer.guaranteedRevenue) : null,
    validUntil: offer.validUntil ?? null,
    taxIncluded: offer.taxIncluded ?? null,
    amenities: offerAmenities(offer),
    nights: offer.nights.map((n) => ({ roomType: n.roomType, night: n.night, rooms: n.rooms, rate: n.rate != null ? String(n.rate) : null })),
    charges: offer.charges.map(chargeValue),
    meetingCharges: (offer.meetingCharges ?? []).map(chargeValue),
    spaces: offer.spaces ?? [],
    fbMinimum: text(offer.fbMinimum),
    fbMinimumScope: offer.fbMinimumScope ?? null,
    fbMinimumNote: offer.fbMinimumNote ?? null,
    fbTaxRate: text(offer.fbTaxRate),
    fbServiceCharge: text(offer.fbServiceCharge),
    meals: (offer.meals ?? []).map((m) => ({ mealType: m.mealType, price: text(m.price) })),
  };
  // The offer's concession answers are for the block it was read as.
  const answers = new Map(offer.concessions.map((c) => [c.concessionId, c]));
  const rfpChoices: RfpChoice[] = rfps.flatMap((r) =>
    r.hotelBlocks.map((b) => ({
      id: b.id,
      label: `${r.title} · ${blockTypeLabel(b.contractType, b.guestType) ?? "Block"}`,
      contractType: b.contractType,
      guestType: b.guestType,
      concessions: r.concessions.map((c) => {
        const answer = b.id === offer.rfpBlockId ? answers.get(c.id) : undefined;
        return { id: c.id, label: c.label, value: c.value, required: c.required, offered: answer?.offered ?? null, met: answer?.met ?? null };
      }),
      spaceRequests: meetingRequests(r.spaceRequests),
      mealTypes: rfpMealTypes(r.spaceRequests),
    })),
  );
  const rfpChoice = rfpChoices.find((c) => c.id === offer.rfpBlockId) ?? null;
  // Each of the hotel's proposals, revised by the offer: what the offer
  // states replaces what the proposal had, the rest carries over.
  const revisions = existing.map((p) => {
    const current = toProposalValues(p);
    const amenities = new Map(current.amenities.map((a) => [a.label, a]));
    for (const a of draft.amenities) amenities.set(a.label, a);
    const concessions: ConcessionAnswer[] = (p.rfp?.concessions ?? []).map((c) => {
      const had = p.concessions.find((a) => a.concessionId === c.id);
      const answer = answers.get(c.id);
      return {
        id: c.id,
        label: c.label,
        value: c.value,
        required: c.required,
        offered: answer?.offered ?? had?.offered ?? null,
        met: answer?.met ?? had?.met ?? null,
      };
    });
    const offered = new Map<string, OfferedConcession>(
      p.concessions.flatMap((c) => (c.concessionId || !c.label ? [] : [[c.label, { label: c.label, offered: c.offered }]])),
    );
    for (const c of offer.offeredConcessions ?? []) offered.set(c.label, { label: c.label, offered: c.offered ?? offered.get(c.label)?.offered ?? null });
    const values: ProposalValues = {
      ...current,
      submittedOn: draft.submittedOn ?? current.submittedOn,
      checkIn: draft.checkIn ?? current.checkIn,
      checkOut: draft.checkOut ?? current.checkOut,
      notes: draft.notes && !current.notes?.includes(draft.notes) ? [current.notes, draft.notes].filter(Boolean).join("\n\n") : current.notes,
      revision: current.revision + 1,
      allowedAttrition: draft.allowedAttrition ?? current.allowedAttrition,
      guaranteedRevenue: draft.guaranteedRevenue ?? current.guaranteedRevenue,
      validUntil: draft.validUntil ?? current.validUntil,
      taxIncluded: draft.taxIncluded ?? current.taxIncluded,
      amenities: Array.from(amenities.values()),
      nights: draft.nights.length ? draft.nights : current.nights,
      charges: draft.charges.length ? draft.charges : current.charges,
      meetingCharges: draft.meetingCharges?.length ? draft.meetingCharges : current.meetingCharges,
      // A room the offer states replaces the one it had for that request (or
      // of that name); the rest carry over.
      spaces: [
        ...(current.spaces ?? []).filter((r) => !draft.spaces?.some((d) => sameSpace(d, r))),
        ...(draft.spaces ?? []).map((d) => (p.rfp ? d : { ...d, spaceRequestId: null })),
      ],
      fbMinimum: draft.fbMinimum ?? current.fbMinimum,
      fbMinimumScope: draft.fbMinimum != null ? draft.fbMinimumScope : current.fbMinimumScope,
      fbMinimumNote: draft.fbMinimum != null ? draft.fbMinimumNote : current.fbMinimumNote,
      fbTaxRate: draft.fbTaxRate ?? current.fbTaxRate,
      fbServiceCharge: draft.fbServiceCharge ?? current.fbServiceCharge,
      meals: [
        ...(current.meals ?? []).filter((m) => !draft.meals?.some((d) => d.mealType.toLowerCase() === m.mealType.toLowerCase())),
        ...(draft.meals ?? []),
      ],
    };
    return {
      id: p.id,
      label: `${p.rfp ? p.rfp.title : "Standalone"} · rev ${p.revision} · ${p.status}`,
      proposal: current,
      draft: values,
      concessions,
      offeredConcessions: Array.from(offered.values()),
      spaceRequests: meetingRequests(p.rfp?.spaceRequests ?? []),
      mealTypes: rfpMealTypes(p.rfp?.spaceRequests ?? []),
    };
  });
  return {
    choices,
    draft,
    rfpChoices,
    rfpChoice,
    offeredConcessions: offer.offeredConcessions ?? [],
    revisions,
    newHotel: venueId ? null : (offer.hotel ?? null),
    // The message's files, picked when the read gives them to this offer
    // (its own, and the ones shared by all).
    attachments: (() => {
      const picked = new Set(offerAttachmentIndexes(proposalOffers(proposal), index, files.length));
      return files.map((f, i) => ({ id: f.id, fileName: f.fileName, picked: picked.has(i) }));
    })(),
  };
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
  // Only codes Claude placed; the rest start as the wizard guesses them.
  const roomMap = Object.fromEntries(
    (proposal.roomTypes ?? proposal.sheet?.roomTypes ?? []).flatMap((r) => (r.roomType ? [[r.raw, r.roomType]] : [])),
  );
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
      sheet = { fileName: file.fileName, headers, rows, columns, roomMap, statusMap };
    }
  } else if (proposal.kind === "PICKUP_GUESTS" && proposal.guests) {
    // A list read from a PDF or the body goes through the same wizard, so its
    // room types and statuses can be mapped before importing.
    const guests = proposal.guests;
    const pdf = (await inboundAttachments(id)).find((f) => f.mimeType === "application/pdf" || f.fileName.toLowerCase().endsWith(".pdf"));
    const headers = ["Guest", "Confirmation #", "Arrival", "Departure", "Room type", "Status", "Booked", "Cancelled on"];
    const rows = guests.map((g) => ({
      Guest: g.guestName ?? "",
      "Confirmation #": g.confirmationNumber ?? "",
      Arrival: g.checkIn ?? "",
      Departure: g.checkOut ?? "",
      "Room type": g.roomType ?? "",
      Status: g.rawStatus ?? (g.cancelled ? "Cancelled" : ""),
      Booked: g.bookedOn ?? "",
      "Cancelled on": g.cancelledOn ?? "",
    }));
    const columns = {
      fullName: "Guest",
      firstName: "",
      lastName: "",
      confirmation: "Confirmation #",
      checkIn: "Arrival",
      checkOut: "Departure",
      roomType: "Room type",
      status: "Status",
      bookedOn: "Booked",
      cancelledOn: "Cancelled on",
    } satisfies PickupColumns;
    const statusMap: Record<string, boolean> = {};
    rows.forEach((r, i) => {
      if (r.Status) statusMap[r.Status] = (statusMap[r.Status] ?? false) || guests[i].cancelled;
    });
    sheet = { fileName: pdf?.fileName ?? item.subject ?? "Email", headers, rows, columns, roomMap, statusMap };
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
// Each move still checks EVENTS WRITE on the destination.
export async function getInboxDestinationEvents(excludeEventId: string | null) {
  const session = await requirePermission("EVENTS", "WRITE", excludeEventId);
  return prisma.event.findMany({
    where: {
      AND: [await eventScopeWhere(session.user.id, session.tenantId), excludeEventId ? { id: { not: excludeEventId } } : {}],
    },
    select: { id: true, name: true, startDate: true },
    orderBy: { startDate: "desc" },
  });
}

// ─── Org-wide (every visible event, plus Unrouted) ───────────────────────────

export async function getOrgInbox(view: InboxView) {
  const session = await requirePermission("EVENTS", "VIEW");
  await purgeDismissedInboundEmails(session.tenantId).catch(() => {});
  const where = await orgInboxWhere(session.user.id, session.tenantId);
  const [items, counts] = await Promise.all([
    prisma.inboundEmail.findMany({
      where: { ...where, status: { in: INBOX_VIEW_STATUSES[view] } },
      select: { ...listSelect, event: { select: { id: true, name: true } } },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.inboundEmail.groupBy({ by: ["status"], where, _count: true }),
  ]);
  const count = (statuses: InboundStatus[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);
  return {
    items,
    counts: { inbox: count(INBOX_VIEW_STATUSES.inbox), held: count(INBOX_VIEW_STATUSES.held) },
  };
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

// ─── Vendor quotes, BEOs, contracts ──────────────────────────────────────────

async function readOf(id: string, eventId: string, tenantId: string) {
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId }, select: { proposal: true } });
  return item?.proposal as InboundProposal | null;
}

// The quote form, filled from a vendor's quote: the vendor (or a new one by
// the quote's name), the vendor RFP it answers (or standalone), and its lines
// priced against that RFP's line items.
// Only RFPs the reviewer may record a quote on (and standalone with EVENTS
// WRITE); null when there's none.
export async function getQuoteReview(id: string, eventId: string) {
  const { tenantId } = await requirePermission("EVENTS", "VIEW", eventId);
  const read = await readOf(id, eventId, tenantId);
  const quote = read?.kind === "VENDOR_QUOTE" ? read.quote : null;
  if (!quote) return null;
  const [vendors, allRfps, standalone] = await Promise.all([
    prisma.vendor.findMany({ where: { tenantId, isSystemVendor: false, venueId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.rfp.findMany({
      where: { eventId, kind: { not: "HOTEL" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        kind: true,
        lineItems: { orderBy: { sortOrder: "asc" }, select: { id: true, group: true, description: true, quantity: true, unit: true } },
      },
    }),
    hasPermission("EVENTS", "WRITE", eventId),
  ]);
  const writable = await Promise.all(allRfps.map((r) => hasPermission(resourceForKind(r.kind), "WRITE", eventId)));
  const rfps = allRfps.filter((_, i) => writable[i]);
  if (!standalone && rfps.length === 0) return null;
  const args = quoteArgsFromRead(quote, quote.vendorId ?? "");
  const str = (n: number | null) => (n == null ? "" : String(n));
  return {
    vendors,
    rfps,
    standalone,
    rfpId: quote.rfpId && rfps.some((r) => r.id === quote.rfpId) ? quote.rfpId : standalone ? null : rfps[0].id,
    vendorId: quote.vendorId,
    newVendorName: quote.vendorId ? null : quote.vendorName,
    values: {
      vendorId: quote.vendorId ?? "",
      reference: args.reference,
      submittedOn: args.submittedOn,
      validUntil: args.validUntil,
      revision: 1,
      serviceCharge: args.serviceCharge != null ? String(args.serviceCharge) : null,
      tax: args.tax != null ? String(args.tax) : null,
      otherFees: args.otherFees != null ? String(args.otherFees) : null,
      depositAmount: args.depositAmount != null ? String(args.depositAmount) : null,
      depositDue: args.depositDue,
      cancellationTerms: args.cancellationTerms,
      notes: args.notes,
      lines: args.lines.map((l: QuoteLineArgs) => ({
        id: null,
        rfpLineItemId: l.rfpLineItemId,
        description: l.description,
        quantity: str(l.quantity),
        unitPrice: str(l.unitPrice),
        amount: str(l.amount),
        notes: l.notes ?? "",
      })),
    },
  };
}

export async function applyInboundQuote(id: string, eventId: string, formData: FormData) {
  await requirePermission("EVENTS", "VIEW", eventId);
  const rfpId = (formData.get("rfpId") as string) || null;
  const rfp = rfpId ? await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } }) : null;
  const session = await requirePermission(quoteResource(rfp), "WRITE", eventId);
  const vendorId = formData.get("vendorId") as string;
  const newVendorName = vendorId === NEW_VENDOR ? (formData.get("newVendorName") as string) || null : null;
  if (vendorId === NEW_VENDOR && !newVendorName) throw new Error("The new vendor needs a name");
  const raw = formData.get("lines");
  const lines = typeof raw === "string" && raw ? (JSON.parse(raw) as QuoteLineArgs[]) : [];
  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : null);
  const str = (k: string) => (formData.get(k) as string) || null;
  const quoteId = await applyInboundQuoteCore(
    id,
    eventId,
    rfpId,
    {
      vendorId: newVendorName ? "" : vendorId,
      reference: str("reference"),
      submittedOn: str("submittedOn"),
      validUntil: str("validUntil"),
      revision: 1,
      serviceCharge: num("serviceCharge"),
      tax: num("tax"),
      otherFees: num("otherFees"),
      depositAmount: num("depositAmount"),
      depositDue: str("depositDue"),
      cancellationTerms: str("cancellationTerms"),
      notes: str("notes"),
      lines,
    },
    newVendorName,
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/rfps`);
  redirect(`/events/${eventId}/quotes/${quoteId}?success=Quote recorded`);
}

const BEO_FIELDS = [
  ["mealType", "Meal type"],
  ["serviceStyle", "Service style"],
  ["expectedCount", "Expected count"],
  ["confirmedCount", "Confirmed count"],
  ["guaranteeCount", "Guarantee"],
  ["fbMinimum", "F&B minimum"],
  ["depositDeadline", "Deposit due"],
  ["guaranteeDeadline", "Guarantee due"],
  ["paymentDeadline", "Payment due"],
  ["cancellationTerms", "Cancellation"],
  ["dietaryNotes", "Dietary"],
] as const;
type BeoField = (typeof BEO_FIELDS)[number][0];

const showValue = (key: BeoField, v: unknown): string => {
  if (v == null || v === "") return "—";
  if (v instanceof Date) return formatDateKey(dateKey(v));
  if (key === "fbMinimum") return formatMoney(String(v));
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateKey(v);
  return String(v);
};

// A BEO against each catering order it could be for: per field it states,
// the order's value and the BEO's.
export async function getBeoReview(id: string, eventId: string) {
  const { tenantId } = await requirePermission("CATERING_ORDERS", "VIEW", eventId);
  const read = await readOf(id, eventId, tenantId);
  const beo = read?.kind === "BEO" ? read.beo : null;
  if (!beo) return null;
  const orders = await prisma.cateringOrder.findMany({
    where: { eventId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ...Object.fromEntries(BEO_FIELDS.map(([k]) => [k, true])) } as { id: true; name: true } & Record<BeoField, true>,
  });
  const stated = BEO_FIELDS.filter(([k]) => beo[k] != null);
  return {
    orderId: beo.cateringOrderId,
    menu: beo.menu,
    notes: beo.notes,
    orders: orders.map((o) => ({
      id: o.id,
      name: o.name,
      rows: stated.map(([k, label]) => {
        const current = showValue(k, (o as Record<string, unknown>)[k]);
        const proposed = showValue(k, beo[k]);
        return { key: k, label, current, proposed, changed: current !== proposed };
      }),
    })),
  };
}

export async function applyInboundBeo(id: string, eventId: string, orderId: string, keys: string[]) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const { tenantId } = session;
  const read = await readOf(id, eventId, tenantId);
  if (read?.kind !== "BEO" || !read.beo) throw new Error("This message has no BEO");
  const all = beoArgsFromRead(read.beo);
  const keep = new Set(keys);
  const args = Object.fromEntries(Object.entries(all).filter(([k]) => keep.has(k)));
  await applyInboundBeoCore(id, eventId, orderId, args, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  revalidatePath(`/events/${eventId}/catering-orders/${orderId}`);
  redirect(`/events/${eventId}/catering-orders/${orderId}?success=BEO applied`);
}

const CONTRACT_TARGET_LABELS: Record<ContractTarget, string> = {
  HOTEL_PROPOSAL: "Hotel proposals",
  VENDOR_QUOTE: "Vendor quotes",
  CATERING_ORDER: "Catering orders",
};

const CONTRACT_FIELD_LABELS: Record<string, string> = {
  depositAmount: "Deposit",
  depositDue: "Deposit due",
  attrition: "Allowed attrition %",
  signBy: "Valid until",
  cancellationTerms: "Cancellation",
};

// A contract against what it could cover: the event's hotel proposals, vendor
// quotes and catering orders, with what applying writes to each kind. Only
// records the reviewer may write; null when there's none.
export async function getContractReview(id: string, eventId: string) {
  const { tenantId } = await requirePermission("EVENTS", "VIEW", eventId);
  const read = await readOf(id, eventId, tenantId);
  const contract = read?.kind === "CONTRACT" ? read.contract : null;
  if (!contract) return null;
  const can = (r: Parameters<typeof hasPermission>[0]) => hasPermission(r, "WRITE", eventId);
  const [canHotels, canCatering] = await Promise.all([can("HOTELS"), can("CATERING_ORDERS")]);
  const [proposals, allQuotes, orders] = await Promise.all([
    canHotels
      ? prisma.hotelProposal.findMany({ where: { eventId }, select: { id: true, status: true, venue: { select: { name: true } } }, orderBy: { createdAt: "asc" } })
      : [],
    prisma.vendorQuote.findMany({ where: { eventId }, select: { id: true, status: true, vendor: { select: { name: true } }, rfp: { select: { title: true, kind: true } } }, orderBy: { createdAt: "asc" } }),
    canCatering ? prisma.cateringOrder.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const quoteWritable = await Promise.all(allQuotes.map((q) => can(quoteResource(q.rfp))));
  const quotes = allQuotes.filter((_, i) => quoteWritable[i]);
  if (proposals.length + quotes.length + orders.length === 0) return null;
  const targets = [
    ...proposals.map((p) => ({ target: "HOTEL_PROPOSAL" as const, id: p.id, label: `${p.venue.name} · ${p.status}` })),
    ...quotes.map((q) => ({ target: "VENDOR_QUOTE" as const, id: q.id, label: `${q.vendor.name}${q.rfp ? ` · ${q.rfp.title}` : ""}` })),
    ...orders.map((o) => ({ target: "CATERING_ORDER" as const, id: o.id, label: o.name })),
  ];
  // What applying writes, per kind of target.
  const writes = Object.fromEntries(
    CONTRACT_TARGETS.map((t) => {
      const args = contractArgsFromRead(contract, t);
      const fields = Object.entries(args)
        .filter(([k]) => k !== "note")
        .map(([k, v]) => ({ label: CONTRACT_FIELD_LABELS[k] ?? k, value: k === "depositAmount" ? formatMoney(String(v)) : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? formatDateKey(String(v)) : String(v) }));
      return [t, { fields, note: args.note ?? null }];
    }),
  ) as Record<ContractTarget, { fields: { label: string; value: string }[]; note: string | null }>;
  return {
    target: contract.target,
    targetId: contract.targetId,
    groups: CONTRACT_TARGETS.map((t) => ({ target: t, label: CONTRACT_TARGET_LABELS[t], options: targets.filter((x) => x.target === t) })),
    writes,
  };
}

export async function applyInboundContract(id: string, eventId: string, target: ContractTarget, targetId: string, note: string | null) {
  await requirePermission("EVENTS", "VIEW", eventId);
  if (!CONTRACT_TARGETS.includes(target)) throw new Error("Unknown contract target");
  const session = await requirePermission(await contractTargetResource(target, targetId, eventId), "WRITE", eventId);
  const read = await readOf(id, eventId, session.tenantId);
  if (read?.kind !== "CONTRACT" || !read.contract) throw new Error("This message has no contract");
  await applyInboundContractCore(id, eventId, target, targetId, { ...contractArgsFromRead(read.contract, target), note }, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
  const href =
    target === "HOTEL_PROPOSAL"
      ? `/events/${eventId}/hotels/proposals/${targetId}`
      : target === "VENDOR_QUOTE"
        ? `/events/${eventId}/quotes/${targetId}`
        : `/events/${eventId}/catering-orders/${targetId}`;
  revalidatePath(href);
  redirect(`${href}?success=Contract applied`);
}
