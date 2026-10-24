"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { RfpKind, RfpSpaceKind, RfpStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { patternStats, proposedRoles, proposeNights } from "@/lib/hotelPattern";
import { RFP_KINDS, resourceForKind, rfpHref, rfpListHref } from "@/lib/rfp/kinds";
import type { LineItemRow } from "@/lib/rfp/lineItems";
import { BLANK } from "@/lib/rfp/sections";
import { cateringSpaceRows, functionSpaceRows, sortSpaceRows } from "@/lib/rfp/space";
import { getPickupPattern } from "@/app/hotels/actions";
import { eventScopeWhere } from "../core";
import type { OfferHotel } from "@/lib/inboundParse";
import {
  addNewRfpRecipientCore,
  addRfpRecipientsCore,
  addRfpVendorRecipientsCore,
  saveRfpLineItemsCore,
  rfpLineItemCandidatesCore,
  createRfpCore,
  deleteRfpCore,
  getRfpComparisonCore,
  getRfpDocumentCore,
  issueRfpCore,
  rfpDetailInclude,
  removeRfpRecipientCore,
  saveRfpBlocksCore,
  saveRfpConcessionsCore,
  saveRfpSpaceCore,
  updateRfpCore,
  updateRfpRecipientCore,
  type RfpBlockArgs,
  type RfpConcessionArgs,
  type RfpLineItemArgs,
  type RfpFillArgs,
  type RfpRecipientArgs,
  type RfpSpaceArgs,
  type RfpWriteArgs,
} from "./core";

// Every RFP lists on the event's RFPs page; Hotels shows a summary of the
// hotel ones.
function revalidateLists(eventId: string, kind: RfpKind) {
  revalidatePath(rfpListHref(eventId));
  if (kind === "HOTEL") revalidatePath(`/events/${eventId}/hotels`);
}

const rfpPath = rfpHref;

// Reads the RFP's kind first so the permission check uses its resource; a
// foreign id is a not-found.
async function rfpKind(id: string, eventId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id, eventId }, select: { kind: true } });
  if (!rfp) notFound();
  return rfp.kind;
}

export async function getRfps(eventId: string, kind: RfpKind) {
  await requirePermission(resourceForKind(kind), "VIEW", eventId);
  return prisma.rfp.findMany({
    where: { eventId, kind },
    select: {
      id: true,
      title: true,
      status: true,
      responseDue: true,
      issuedOn: true,
      hotelBlocks: { select: { contractType: true, guestType: true }, orderBy: { sortOrder: "asc" } },
      recipients: { select: { venueId: true, sentOn: true, declinedToBid: true } },
      hotelProposals: { select: { venueId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// Every RFP on the event the user may see (each kind is its own resource),
// with what the RFPs page shows. Hotel proposals and vendor quotes both count
// as responses.
export async function getEventRfps(eventId: string) {
  await requirePermission("EVENTS", "VIEW", eventId);
  const kinds = RFP_KINDS;
  const allowed = (await Promise.all(kinds.map(async (k) => ((await hasPermission(resourceForKind(k), "VIEW", eventId)) ? k : null)))).filter(
    (k): k is RfpKind => k != null,
  );
  return prisma.rfp.findMany({
    where: { eventId, kind: { in: allowed } },
    select: {
      id: true,
      kind: true,
      title: true,
      service: true,
      status: true,
      responseDue: true,
      issuedOn: true,
      recipients: { select: { venueId: true, vendorId: true, sentOn: true, declinedToBid: true } },
      hotelProposals: { select: { venueId: true } },
      quotes: { select: { vendorId: true, status: true } },
    },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
}

export async function getRfp(id: string, eventId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id, eventId }, select: { kind: true } });
  if (!rfp) return null;
  await requirePermission(resourceForKind(rfp.kind), "VIEW", eventId);
  return prisma.rfp.findFirst({ where: { id, eventId }, include: rfpDetailInclude });
}

// The RFPs a vendor or hotel was sent and what it answered with (quotes,
// proposals), on the events the user can see and the kinds they may view —
// for the vendor and venue pages. Newest events first.
export async function getRfpHistory(party: { vendorId: string } | { venueId: string }) {
  const session = await requirePermission("vendorId" in party ? "VENDORS" : "VENUES", "VIEW");
  const [allowed, event] = await Promise.all([
    Promise.all(RFP_KINDS.map(async (k) => ((await hasPermission(resourceForKind(k), "VIEW")) ? k : null))),
    eventScopeWhere(session.user.id, session.tenantId),
  ]);
  const kinds = allowed.filter((k): k is RfpKind => k != null);
  const take = 25;
  const eventSelect = { select: { id: true, name: true, startDate: true } } as const;
  const rfpSelect = { select: { id: true, kind: true, title: true, status: true, responseDue: true, event: eventSelect } } as const;
  const [recipients, quotes, proposals] = await Promise.all([
    prisma.rfpRecipient.findMany({
      where: { ...party, rfp: { kind: { in: kinds }, event } },
      select: { id: true, sentOn: true, declinedToBid: true, rfp: rfpSelect },
      orderBy: [{ rfp: { event: { startDate: "desc" } } }, { createdAt: "desc" }],
      take,
    }),
    "vendorId" in party
      ? prisma.vendorQuote.findMany({
          where: {
            vendorId: party.vendorId,
            event,
            // A quote without an RFP is event work (EVENTS, as Other services).
            OR: [{ rfp: { kind: { in: kinds } } }, ...(kinds.includes("OTHER") ? [{ rfpId: null }] : [])],
          },
          select: { id: true, status: true, revision: true, rfpId: true, event: eventSelect },
          orderBy: [{ event: { startDate: "desc" } }, { createdAt: "asc" }],
          take,
        })
      : [],
    "venueId" in party && kinds.includes("HOTEL")
      ? prisma.hotelProposal.findMany({
          where: { venueId: party.venueId, event, rfpId: { not: null } },
          select: { id: true, status: true, rfpId: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);
  return { recipients, quotes, proposals };
}

// Dropdown sources for the RFP editor: the event's key staff as the point of
// contact, the tenant's option lists, and series for Fill from history.
export async function getRfpFormChoices(eventId: string, kind: RfpKind) {
  const session = await requirePermission(resourceForKind(kind), "VIEW", eventId);
  const [keyStaff, options, series, hotels] = await Promise.all([
    prisma.eventKeyStaff.findMany({
      where: { eventId },
      select: { title: true, contact: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.customOption.findMany({
      where: { tenantId: session.tenantId, category: { in: ["function_type", "meal_type", "setup_type", "hotel_room_type", "hotel_guest_type", "hotel_amenity", "hotel_region", "hotel_area", "reservation_method", "rfp_concession", "rfp_service", "rfp_term"] } },
      select: { category: true, label: true, group: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventSeries.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({
      where: { tenantId: session.tenantId, isLodging: true },
      select: { id: true, name: true, city: true, state: true, area: true, amenities: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const of = (category: string) => options.filter((o) => o.category === category).map((o) => o.label);
  const contacts = new Map<string, string>();
  for (const k of keyStaff) {
    const name = `${k.contact.firstName} ${k.contact.lastName}`.trim();
    if (!contacts.has(k.contact.id)) contacts.set(k.contact.id, k.title ? `${name} — ${k.title}` : name);
  }
  return {
    contacts: Array.from(contacts, ([id, label]) => ({ id, label })),
    functionTypes: of("function_type"),
    mealTypes: of("meal_type"),
    setupTypes: of("setup_type"),
    roomTypes: of("hotel_room_type"),
    guestTypes: of("hotel_guest_type"),
    amenities: of("hotel_amenity"),
    reservationMethods: of("reservation_method"),
    // hotel_area labels with their region (the option's group).
    regions: of("hotel_region"),
    areas: options.filter((o) => o.category === "hotel_area").map((o) => ({ label: o.label, region: o.group })),
    concessions: options.filter((o) => o.category === "rfp_concession").map((o) => ({ label: o.label, group: o.group })),
    // Vendor RFPs: what an Other services RFP is for, and the terms they ask.
    services: of("rfp_service"),
    terms: options.filter((o) => o.category === "rfp_term").map((o) => ({ label: o.label, group: null })),
    series,
    hotels: hotels.map((h) => ({ id: h.id, area: h.area, amenities: h.amenities, label: [h.name, [h.city, h.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ") })),
  };
}

// Support schedule types (set-up / tear-down) — left off function-space rows.
async function supportScheduleTypes(eventId: string) {
  const options = await prisma.customOption.findMany({
    where: { tenant: { events: { some: { id: eventId } } }, category: "schedule_type", group: { in: ["SETUP", "TEARDOWN"] } },
    select: { label: true },
  });
  return new Set(options.length ? options.map((o) => o.label) : ["Setup", "Breakdown"]);
}

// Everything the document needs (getRfpDocumentCore); null for a foreign id.
export async function getRfpDocument(id: string, eventId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id, eventId }, select: { kind: true } });
  if (!rfp) return null;
  const session = await requirePermission(resourceForKind(rfp.kind), "VIEW", eventId);
  return getRfpDocumentCore(id, eventId, session.user.id);
}

// The event's functions and catering orders as function-space rows, for
// "Add from functions". Rooms are included; the editor drops them unless asked.
export async function getRfpSpaceCandidates(id: string, eventId: string) {
  const kind = await rfpKind(id, eventId);
  await requirePermission(resourceForKind(kind), "VIEW", eventId);
  const scheduleSelect = { select: { type: true, startTime: true, endTime: true } } as const;
  const [event, support, functions, orders] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { timezone: true } }),
    supportScheduleTypes(eventId),
    prisma.function.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        type: true,
        functionNumber: true,
        breakoutGroup: { select: { name: true } },
        hold24Hour: true,
        expectedAttendance: true,
        setForCount: true,
        offSiteLocation: true,
        rooms: { select: { room: { select: { name: true } } } },
        defaultSetup: true,
        setupOrderFunctions: { select: { setupOrder: { select: { setupType: true } } } },
        avOrderFunctions: { select: { avOrder: { select: { name: true } } } },
        schedules: scheduleSelect,
      },
    }),
    prisma.cateringOrder.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        mealType: true,
        expectedCount: true,
        confirmedCount: true,
        guaranteeCount: true,
        function: { select: { rooms: { select: { room: { select: { name: true } } } }, schedules: scheduleSelect } },
      },
    }),
  ]);
  const roomNames = (rooms: { room: { name: string } }[]) => rooms.map((r) => r.room.name);
  return sortSpaceRows([
    ...functionSpaceRows(
      functions.map((fn) => ({
        ...fn,
        rooms: roomNames(fn.rooms),
        setupTypes: Array.from(new Set(fn.setupOrderFunctions.flatMap((s) => (s.setupOrder.setupType ? [s.setupOrder.setupType] : [])))),
        avOrders: fn.avOrderFunctions.map((a) => a.avOrder.name),
      })),
      support,
      event.timezone,
      true,
    ),
    ...cateringSpaceRows(
      orders.map((o) => ({ ...o, function: o.function ? { rooms: roomNames(o.function.rooms), schedules: o.function.schedules } : null })),
      support,
      event.timezone,
      true,
    ),
  ]);
}

// Order type each vendor RFP kind buys for (Vendor.models).
const KIND_MODEL: Partial<Record<RfpKind, string>> = { AV: "AV_ORDER", CATERING: "CATERING_ORDER", PRINT: "PRINT_ORDER" };

// The tenant's vendors for a vendor RFP's recipients. Suggested: tagged for
// the kind's order type (or untagged, i.e. general-purpose); for Other
// services, the vendors already on the event.
export async function getRfpVendorChoices(eventId: string, kind: RfpKind) {
  const session = await requirePermission(resourceForKind(kind), "VIEW", eventId);
  const model = KIND_MODEL[kind];
  const vendors = await prisma.vendor.findMany({
    // Not the house vendor or a venue's own vendor record.
    where: { tenantId: session.tenantId, isSystemVendor: false, venueId: null },
    select: { id: true, name: true, models: true, eventVendors: { where: { eventId }, select: { id: true } } },
    orderBy: { name: "asc" },
  });
  return vendors.map((v) => ({
    id: v.id,
    name: v.name,
    fits: model ? v.models.length === 0 || v.models.includes(model) : v.eventVendors.length > 0,
  }));
}

// The event's orders of the RFP's kind as line items, for "Add from orders".
export async function getRfpLineItemCandidates(id: string, eventId: string): Promise<LineItemRow[]> {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "VIEW", eventId);
  return rfpLineItemCandidatesCore(id, eventId, session.user.id);
}

export async function getRfpComparison(id: string, eventId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id, eventId }, select: { kind: true } });
  if (!rfp) return null;
  const session = await requirePermission(resourceForKind(rfp.kind), "VIEW", eventId);
  return getRfpComparisonCore(id, eventId, session.user.id);
}

// A requested block filled from past pickup (src/lib/hotelPattern.ts), dated
// to this event. Read-only; the editor applies it to its grid.
export async function getRfpPatternFill(
  eventId: string,
  args: RfpFillArgs & { city?: string; from?: string; to?: string },
) {
  await requirePermission("HOTELS", "VIEW", eventId);
  if (!(await hasPermission("HOTELS", "VIEW"))) return { events: 0, nights: [] };
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true, endDate: true } });
  const { events } = await getPickupPattern({
    seriesId: args.seriesId ?? undefined,
    contractTypes: args.contractType ? [args.contractType] : [],
    guestTypes: args.guestType ? [args.guestType] : [],
    city: args.city,
    from: args.from,
    to: args.to,
  });
  const adjust = Number.isFinite(args.adjust) ? Math.min(200, Math.max(-90, args.adjust)) : 0;
  const stats = patternStats(events);
  const start = dateKey(event.startDate);
  const end = dateKey(event.endDate);
  const nights = end >= start ? proposeNights(start, end, proposedRoles(stats, args.basis, adjust), stats.observedMiddle) : [];
  return { events: events.length, nights: nights.map((n) => ({ night: n.night, rooms: Math.round(n.rooms) })).filter((n) => n.rooms > 0) };
}

function readJson<T>(formData: FormData, key: string): T[] {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${key} must be a list`);
  return parsed as T[];
}

function readRfp(formData: FormData): RfpWriteArgs {
  const str = (k: string) => (formData.get(k) as string) || null;
  // Selects post BLANK for "none".
  const pick = (k: string) => (formData.get(k) === BLANK ? null : str(k));
  const status = formData.get("status") as string | null;
  return {
    title: (formData.get("title") as string) ?? "",
    // The form also posts the status it shows as saved: an untouched select
    // leaves the status alone, so an autosave can't undo an Issue.
    status:
      !status || status === formData.get("statusWas")
        ? undefined
        : status === "ISSUED" || status === "CLOSED"
          ? status
          : ("DRAFT" satisfies RfpStatus),
    responseDue: str("responseDue"),
    decisionBy: str("decisionBy"),
    sections: formData.getAll("sections") as string[],
    introduction: str("introduction"),
    requirements: str("requirements"),
    contactId: pick("contactId"),
    arrivalDate: str("arrivalDate"),
    departureDate: str("departureDate"),
    datesFlexible: formData.get("datesFlexible") === "true",
    dateNotes: str("dateNotes"),
    alternateDates: readJson<{ startDate: string; endDate: string }>(formData, "alternateDates"),
    peakRooms: formData.get("peakRooms") ? parseInt(formData.get("peakRooms") as string) : null,
    historyMatching: formData.get("historyMatching") === "true",
    reservationMethod: pick("reservationMethod"),
    commissionNotes: str("commissionNotes"),
    fbMinimum: formData.get("fbMinimum") ? Number(formData.get("fbMinimum")) : null,
    fbIncludes: formData.getAll("fbIncludes") as string[],
    fbHistoricalSpend: formData.get("fbHistoricalSpend") ? Number(formData.get("fbHistoricalSpend")) : null,
    amenities: formData.getAll("amenities") as string[],
    decisionMakerId: pick("decisionMakerId"),
    decisionMaker: str("decisionMaker"),
    regions: formData.getAll("regions") as string[],
    areas: formData.getAll("areas") as string[],
    siteVisitBy: str("siteVisitBy"),
    service: formData.has("service") ? pick("service") : undefined,
  };
}

export async function createRfp(eventId: string, kind: RfpKind, formData: FormData) {
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const raw = formData.get("blocks");
  const blocks = typeof raw === "string" && raw ? (JSON.parse(raw) as RfpBlockArgs[]) : [];
  const rfp = await createRfpCore(eventId, kind, readRfp(formData), blocks, session.user.id);
  revalidateLists(eventId, kind);
  redirect(`${rfpPath(eventId, kind, rfp.id)}?success=RFP created`);
}

export async function updateRfp(id: string, eventId: string, formData: FormData) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await updateRfpCore(id, eventId, readRfp(formData), session.user.id);
  revalidateLists(eventId, kind);
  revalidatePath(rfpPath(eventId, kind, id));
}

export async function deleteRfp(id: string, eventId: string) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "DELETE", eventId);
  await deleteRfpCore(id, eventId, session.user.id);
  revalidateLists(eventId, kind);
  redirect(`${rfpListHref(eventId)}?success=RFP deleted`);
}

// The card saves (blocks, line items, concessions, space) autosave without a
// redirect and return each row's saved id, so the editor's next save updates
// rows it just created.
export async function saveRfpBlocks(id: string, eventId: string, blocks: RfpBlockArgs[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const ids = await saveRfpBlocksCore(id, eventId, blocks, session.user.id);
  revalidatePath(rfpPath(eventId, kind, id));
  return ids;
}

export async function saveRfpLineItems(id: string, eventId: string, rows: RfpLineItemArgs[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const ids = await saveRfpLineItemsCore(id, eventId, rows, session.user.id);
  revalidatePath(rfpPath(eventId, kind, id));
  return ids;
}

export async function saveRfpConcessions(id: string, eventId: string, concessions: RfpConcessionArgs[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const ids = await saveRfpConcessionsCore(id, eventId, concessions, session.user.id);
  revalidatePath(rfpPath(eventId, kind, id));
  return ids;
}

export async function saveRfpSpace(id: string, eventId: string, spaceKind: RfpSpaceKind, rows: RfpSpaceArgs[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const ids = await saveRfpSpaceCore(id, eventId, rows, session.user.id, spaceKind === "FB" ? "FB" : "MEETING");
  revalidatePath(rfpPath(eventId, kind, id));
  return ids;
}

export async function issueRfp(id: string, eventId: string) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const doc = await getRfpDocument(id, eventId);
  if (!doc) notFound();
  const { renderRfpDocx, rfpFileName } = await import("@/lib/rfp/renderDocx");
  await issueRfpCore(id, eventId, { fileName: rfpFileName(doc.meta.eventName, doc.meta.title), buffer: await renderRfpDocx(doc) }, session.user.id);
  revalidateLists(eventId, kind);
  revalidatePath(rfpPath(eventId, kind, id));
  redirect(`${rfpPath(eventId, kind, id)}?success=RFP issued`);
}

// Recipients are edited in place from the RFP page; the client refreshes.
export async function addRfpRecipients(id: string, eventId: string, venueIds: string[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await addRfpRecipientsCore(id, eventId, venueIds, session.user.id);
  revalidateLists(eventId, kind);
}

export async function addNewRfpRecipient(id: string, eventId: string, hotel: OfferHotel) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await addNewRfpRecipientCore(id, eventId, hotel, session.user.id);
  revalidateLists(eventId, kind);
  revalidatePath("/venues");
}

export async function addRfpVendorRecipients(id: string, eventId: string, vendorIds: string[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await addRfpVendorRecipientsCore(id, eventId, vendorIds, session.user.id);
  revalidateLists(eventId, kind);
  revalidatePath(rfpPath(eventId, kind, id));
}

export async function updateRfpRecipient(recipientId: string, id: string, eventId: string, args: RfpRecipientArgs) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await updateRfpRecipientCore(recipientId, id, eventId, args, session.user.id);
  revalidateLists(eventId, kind);
}

export async function removeRfpRecipient(recipientId: string, id: string, eventId: string) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await removeRfpRecipientCore(recipientId, id, eventId, session.user.id);
  revalidateLists(eventId, kind);
}
