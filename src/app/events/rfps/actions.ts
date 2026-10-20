"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { RfpKind, RfpStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { patternStats, proposedRoles, proposeNights } from "@/lib/hotelPattern";
import { resourceForKind } from "@/lib/rfp/kinds";
import { buildRfpDocument } from "@/lib/rfp/document";
import { parseSections } from "@/lib/rfp/sections";
import { cateringSpaceRows, functionSpaceRows, sortSpaceRows } from "@/lib/rfp/space";
import { getPickupPattern } from "@/app/hotels/actions";
import {
  addRfpRecipientsCore,
  createRfpCore,
  deleteRfpCore,
  getRfpComparisonCore,
  issueRfpCore,
  removeRfpRecipientCore,
  saveRfpBlocksCore,
  saveRfpConcessionsCore,
  saveRfpSpaceCore,
  updateRfpCore,
  updateRfpRecipientCore,
  type RfpBlockArgs,
  type RfpConcessionArgs,
  type RfpFillArgs,
  type RfpRecipientArgs,
  type RfpSpaceArgs,
  type RfpWriteArgs,
} from "./core";

// Where an RFP of each kind lives in the app.
function rfpBase(eventId: string, kind: RfpKind) {
  switch (kind) {
    case "HOTEL":
      return `/events/${eventId}/hotels`;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled RFP kind: ${_exhaustive}`);
    }
  }
}

const rfpPath = (eventId: string, kind: RfpKind, id: string) => `${rfpBase(eventId, kind)}/rfps/${id}`;

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

export async function getRfp(id: string, eventId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id, eventId }, select: { kind: true } });
  if (!rfp) return null;
  await requirePermission(resourceForKind(rfp.kind), "VIEW", eventId);
  return prisma.rfp.findFirst({
    where: { id, eventId },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, organization: true, email: true, phone: true } },
      concessions: { orderBy: { sortOrder: "asc" } },
      hotelBlocks: { orderBy: { sortOrder: "asc" }, include: { nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] } } },
      alternateDates: { orderBy: { sortOrder: "asc" } },
      spaceRequests: { orderBy: { sortOrder: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      recipients: { orderBy: { createdAt: "asc" }, include: { venue: { select: { id: true, name: true, city: true, state: true } } } },
      hotelProposals: { select: { id: true, venueId: true, rfpBlockId: true, status: true } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
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
      where: { tenantId: session.tenantId, category: { in: ["function_type", "meal_type", "setup_type", "hotel_room_type", "hotel_guest_type", "hotel_amenity", "reservation_method", "rfp_concession"] } },
      select: { category: true, label: true, group: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.eventSeries.findMany({ where: { tenantId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({
      where: { tenantId: session.tenantId, isLodging: true },
      select: { id: true, name: true, city: true, state: true },
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
    concessions: options.filter((o) => o.category === "rfp_concession").map((o) => ({ label: o.label, group: o.group })),
    series,
    hotels: hotels.map((h) => ({ id: h.id, label: [h.name, [h.city, h.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ") })),
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

const narrativeText = (n: Record<string, unknown>, key: string) => (typeof n[key] === "string" && (n[key] as string).trim() ? (n[key] as string) : null);

// Everything the document needs. Function space and F&B are the RFP's own
// rows; the event profile comes from the ESG; history is the event's
// series, ended events with pickup.
export async function getRfpDocument(id: string, eventId: string) {
  const rfp = await getRfp(id, eventId);
  if (!rfp) return null;
  const [event, keyStaff, concessionOptions] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        name: true,
        startDate: true,
        endDate: true,
        seriesId: true,
        expectedAttendance: true,
        tenant: { select: { name: true } },
        venues: { orderBy: { sortOrder: "asc" }, take: 1, select: { venue: { select: { city: true, state: true } } } },
        specification: { select: { eventType: true, eventScope: true, eventFrequency: true, narrative: true } },
      },
    }),
    rfp.contactId
      ? prisma.eventKeyStaff.findFirst({ where: { eventId, contactId: rfp.contactId }, select: { title: true }, orderBy: { sortOrder: "asc" } })
      : null,
    prisma.customOption.findMany({
      where: { tenant: { events: { some: { id: eventId } } }, category: "rfp_concession" },
      select: { label: true, group: true },
    }),
  ]);
  const sections = new Set(rfp.sections);
  // Pickup history reads across the tenant's events, so it needs HOTELS beyond this one event.
  const history =
    sections.has("history") && event.seriesId && (await hasPermission("HOTELS", "VIEW"))
      ? (await getPickupPattern({ seriesId: event.seriesId, contractTypes: [], guestTypes: [] })).events
      : [];
  const venue = event.venues[0]?.venue;
  const narrative = (event.specification?.narrative as Record<string, unknown> | null) ?? {};
  const text = (key: string) => narrativeText(narrative, key);
  const address = [
    text("hostOrgAddress1"),
    text("hostOrgAddress2"),
    [text("hostOrgCity"), text("hostOrgState"), text("hostOrgPostalCode")].filter(Boolean).join(" "),
    text("hostOrgCountry"),
  ]
    .filter(Boolean)
    .join(", ");

  return buildRfpDocument({
    rfp: {
      ...rfp,
      sections: parseSections(rfp.kind, rfp.sections),
      contactTitle: keyStaff?.title ?? null,
      // Files staff attached for the hotels; the RFP's own issued copies aren't attachments.
      attachments: rfp.files.filter((f) => f.fileType !== "RFP").map((f) => f.fileName),
    },
    event: {
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      expectedAttendance: event.expectedAttendance,
      location: venue ? [venue.city, venue.state].filter(Boolean).join(", ") || null : null,
    },
    spec: {
      hostOrgName: text("hostOrgName") ?? event.tenant.name,
      address: address || null,
      phone: text("hostOrgPhone"),
      website: text("hostOrgWebsite"),
      eventType: event.specification?.eventType ?? null,
      eventScope: event.specification?.eventScope ?? null,
      eventFrequency: event.specification?.eventFrequency ?? null,
      overview: text("hostOrgOverview"),
      objectives: text("eventObjectives"),
      demographics: text("attendeeDemographics"),
      accessibility: text("attendeeAccessibility"),
    },
    concessionGroups: Object.fromEntries(concessionOptions.map((o) => [o.label, o.group])),
    history,
  });
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
        setupOrderFunctions: { select: { setupOrder: { select: { setupType: true } } } },
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
  const status = formData.get("status") as string;
  return {
    title: (formData.get("title") as string) ?? "",
    status: status === "ISSUED" || status === "CLOSED" ? status : ("DRAFT" satisfies RfpStatus),
    responseDue: str("responseDue"),
    decisionBy: str("decisionBy"),
    sections: formData.getAll("sections") as string[],
    introduction: str("introduction"),
    requirements: str("requirements"),
    contactId: str("contactId"),
    arrivalDate: str("arrivalDate"),
    departureDate: str("departureDate"),
    datesFlexible: formData.get("datesFlexible") === "true",
    dateNotes: str("dateNotes"),
    alternateDates: readJson<{ startDate: string; endDate: string }>(formData, "alternateDates"),
    peakRooms: formData.get("peakRooms") ? parseInt(formData.get("peakRooms") as string) : null,
    reservationMethod: str("reservationMethod"),
    commissionNotes: str("commissionNotes"),
    fbMinimum: formData.get("fbMinimum") ? Number(formData.get("fbMinimum")) : null,
    fbIncludes: formData.getAll("fbIncludes") as string[],
    fbHistoricalSpend: formData.get("fbHistoricalSpend") ? Number(formData.get("fbHistoricalSpend")) : null,
    amenities: formData.getAll("amenities") as string[],
    decisionMaker: str("decisionMaker"),
    siteVisitBy: str("siteVisitBy"),
  };
}

export async function createRfp(eventId: string, kind: RfpKind, formData: FormData) {
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const raw = formData.get("blocks");
  const blocks = typeof raw === "string" && raw ? (JSON.parse(raw) as RfpBlockArgs[]) : [];
  const rfp = await createRfpCore(eventId, kind, readRfp(formData), blocks, session.user.id);
  revalidatePath(rfpBase(eventId, kind));
  redirect(`${rfpPath(eventId, kind, rfp.id)}?success=RFP created`);
}

export async function updateRfp(id: string, eventId: string, formData: FormData) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await updateRfpCore(id, eventId, readRfp(formData), session.user.id);
  revalidatePath(rfpBase(eventId, kind));
  revalidatePath(rfpPath(eventId, kind, id));
  redirect(`${rfpPath(eventId, kind, id)}?success=RFP updated`);
}

export async function deleteRfp(id: string, eventId: string) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "DELETE", eventId);
  await deleteRfpCore(id, eventId, session.user.id);
  revalidatePath(rfpBase(eventId, kind));
  redirect(`${rfpBase(eventId, kind)}?success=RFP deleted`);
}

export async function saveRfpBlocks(id: string, eventId: string, blocks: RfpBlockArgs[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await saveRfpBlocksCore(id, eventId, blocks, session.user.id);
  revalidatePath(rfpPath(eventId, kind, id));
}

export async function saveRfpConcessions(id: string, eventId: string, concessions: RfpConcessionArgs[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await saveRfpConcessionsCore(id, eventId, concessions, session.user.id);
  revalidatePath(rfpPath(eventId, kind, id));
}

export async function saveRfpSpace(id: string, eventId: string, rows: RfpSpaceArgs[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await saveRfpSpaceCore(id, eventId, rows, session.user.id);
  revalidatePath(rfpPath(eventId, kind, id));
}

export async function issueRfp(id: string, eventId: string) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  const doc = await getRfpDocument(id, eventId);
  if (!doc) notFound();
  const { renderRfpDocx, rfpFileName } = await import("@/lib/rfp/renderDocx");
  await issueRfpCore(id, eventId, { fileName: rfpFileName(doc.meta.eventName, doc.meta.title), buffer: await renderRfpDocx(doc) }, session.user.id);
  revalidatePath(rfpBase(eventId, kind));
  revalidatePath(rfpPath(eventId, kind, id));
  redirect(`${rfpPath(eventId, kind, id)}?success=RFP issued`);
}

// Recipients are edited in place from the RFP page; the client refreshes.
export async function addRfpRecipients(id: string, eventId: string, venueIds: string[]) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await addRfpRecipientsCore(id, eventId, venueIds, session.user.id);
  revalidatePath(rfpBase(eventId, kind));
}

export async function updateRfpRecipient(recipientId: string, id: string, eventId: string, args: RfpRecipientArgs) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await updateRfpRecipientCore(recipientId, id, eventId, args, session.user.id);
  revalidatePath(rfpBase(eventId, kind));
}

export async function removeRfpRecipient(recipientId: string, id: string, eventId: string) {
  const kind = await rfpKind(id, eventId);
  const session = await requirePermission(resourceForKind(kind), "WRITE", eventId);
  await removeRfpRecipientCore(recipientId, id, eventId, session.user.id);
  revalidatePath(rfpBase(eventId, kind));
}
