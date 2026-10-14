// Loads everything ESG Part I needs for one event: the stored specification,
// its grids, and the derived inputs (key staff, supplier contacts, catering
// for the F&B grid, housing). No auth — callers gate it: the Specifications
// page via requirePermission, the ESG report via the share-link carve-out.

import { prisma } from "@/lib/prisma";
import { eventVenuesInclude } from "@/lib/eventVenues";
import { functionStartKey } from "@/lib/esg/scheduleKey";
import { buildFbAttendanceGrid, fbGridHasData } from "@/lib/esg/fbGrid";
import { loadHousingInput } from "@/lib/esg/housing";
import { computeEsgCompleteness } from "@/lib/esg/completeness";
import { isBlankText } from "@/lib/esg/format";
import { deriveFunctionSpace } from "@/lib/esg/functionSpace";
import type { FunctionSpace } from "@/lib/esg/apex";
import { orgEsgDefaults, orgProfileSelect } from "@/lib/orgProfile";
import type { EsgDerivedSource, SpecGrid } from "@/lib/esg/fields";

const scheduleSelect = { type: true, startTime: true, endTime: true, isPublic: true } as const;

export type InheritedValue = { value: string; source: "organization" | "functions" };

export async function loadEsgNarrativeData(eventId: string) {
  const [event, tenant, spec, vips, shuttles, transfers, shipments, coverage, keys, futureDates, distributions, keyStaff, eventVendors, cateringOrders, options, functions, boothCount, breakoutRooms] =
    await Promise.all([
      prisma.event.findUnique({ where: { id: eventId }, include: eventVenuesInclude }),
      prisma.tenant.findFirst({
        where: { events: { some: { id: eventId } } },
        select: { name: true, ...orgProfileSelect },
      }),
      prisma.eventSpecification.findUnique({
        where: { eventId },
        include: {
          finalBillContact: { select: { id: true, firstName: true, lastName: true, organization: true } },
          securityVendor: { select: { id: true, name: true } },
          firstAidVendor: { select: { id: true, name: true } },
          transportationVendor: { select: { id: true, name: true } },
          masterExhibitFunction: {
            select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } },
          },
        },
      }),
      prisma.eventSpecVip.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
      prisma.eventSpecShuttleRoute.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
      prisma.eventSpecTransfer.findMany({
        where: { eventId },
        orderBy: { sortOrder: "asc" },
        include: { function: { select: { id: true, name: true, functionNumber: true } } },
      }),
      prisma.eventSpecShipment.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
      prisma.eventSpecCoverage.findMany({ where: { eventId }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] }),
      prisma.eventSpecKey.findMany({
        where: { eventId },
        orderBy: { sortOrder: "asc" },
        include: { function: { select: { id: true, name: true, functionNumber: true } } },
      }),
      prisma.eventPostEventFutureDate.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
      prisma.eventPostEventDistribution.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
      prisma.eventKeyStaff.findMany({
        where: { eventId },
        include: { contact: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.eventVendor.findMany({
        where: { eventId },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              isSystemVendor: true,
              venueId: true,
              contacts: { include: { contact: true }, orderBy: [{ isPrimary: "desc" }] },
            },
          },
        },
      }),
      prisma.cateringOrder.findMany({
        where: { eventId },
        select: {
          id: true,
          name: true,
          status: true,
          mealType: true,
          expectedCount: true,
          confirmedCount: true,
          guaranteeCount: true,
          function: { select: { schedules: { select: scheduleSelect } } },
          additionalServiceLocations: {
            select: { expectedCount: true, function: { select: { schedules: { select: scheduleSelect } } } },
          },
        },
      }),
      prisma.customOption.findMany({
        where: {
          tenant: { events: { some: { id: eventId } } },
          category: { in: ["function_type", "meal_type", "schedule_type", "event_type", "event_scope", "event_frequency", "reservation_method"] },
        },
        orderBy: { sortOrder: "asc" },
        select: { category: true, label: true, group: true },
      }),
      prisma.function.findMany({
        where: { eventId, type: { not: "BREAKOUT_BLOCK" } },
        select: {
          id: true,
          name: true,
          type: true,
          offSiteLocation: true,
          functionNumber: true,
          breakoutGroup: { select: { name: true } },
          rooms: { select: { room: { select: { name: true, venue: { select: { name: true } } } } } },
          schedules: { select: { startTime: true, endTime: true } },
        },
      }),
      prisma.exhibitBooth.count({ where: { eventId } }),
      prisma.breakoutGroupRoom.findMany({
        where: { breakoutGroup: { eventId } },
        select: {
          breakoutGroup: { select: { name: true } },
          room: { select: { name: true, venue: { select: { name: true } } } },
        },
      }),
    ]);
  if (!event) return null;

  const venueIds = event.venues.map((v) => v.venueId);
  const venueContacts = venueIds.length
    ? await prisma.venueContact.findMany({
        where: { venueId: { in: venueIds } },
        include: { contact: true, venue: { select: { name: true } } },
      })
    : [];

  const optionsBy = (category: string) => options.filter((o) => o.category === category);
  const support = new Set(
    optionsBy("schedule_type")
      .filter((o) => o.group === "SETUP" || o.group === "TEARDOWN")
      .map((o) => o.label),
  );
  if (support.size === 0) ["Setup", "Breakdown"].forEach((l) => support.add(l));

  const fbGrid = buildFbAttendanceGrid(
    cateringOrders.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      mealType: o.mealType,
      expectedCount: o.expectedCount,
      confirmedCount: o.confirmedCount,
      guaranteeCount: o.guaranteeCount,
      serviceStart: o.function ? functionStartKey(o.function.schedules, support) : null,
      serviceLocations: o.additionalServiceLocations.map((l) => ({
        expectedCount: l.expectedCount,
        serviceStart: l.function ? functionStartKey(l.function.schedules, support) : null,
      })),
    })),
    optionsBy("meal_type"),
    event.timezone,
    "esg",
  );

  // What the event itself stores, then defaults for the keys it leaves blank:
  // the organization profile (§A host organization) and the event's functions
  // (§I function space). Everything downstream (report, completeness, PER)
  // reads the merged view; the edit form reads storedNarrative.
  const storedNarrative = (spec?.narrative as Record<string, unknown> | null) ?? {};
  const spaceByType = new Map(
    optionsBy("function_type")
      .filter((o) => o.group)
      .map((o) => [o.label, o.group as FunctionSpace]),
  );
  const functionSpace = deriveFunctionSpace(
    functions.map((f) => ({
      name: f.name,
      type: f.type,
      offSiteLocation: f.offSiteLocation,
      rooms: f.rooms.map((r) => ({ name: r.room.name, venueName: r.room.venue.name })),
      schedules: f.schedules,
    })),
    spaceByType,
    breakoutRooms.map((r) => ({ name: r.room.name, venueName: r.room.venue.name, groupName: r.breakoutGroup.name })),
    event.timezone,
  );
  const inheritedNarrative: Record<string, InheritedValue> = {};
  const inherit = (defaults: Record<string, string>, source: InheritedValue["source"]) => {
    for (const [key, value] of Object.entries(defaults)) {
      if (isBlankText(storedNarrative[key])) inheritedNarrative[key] = { value, source };
    }
  };
  inherit(orgEsgDefaults(tenant), "organization");
  inherit(functionSpace, "functions");
  const narrative: Record<string, unknown> = {
    ...storedNarrative,
    ...Object.fromEntries(Object.entries(inheritedNarrative).map(([k, v]) => [k, v.value])),
  };
  const housing = await loadHousingInput(eventId, spec ? { ...spec, narrative } : null);

  const signatories = keyStaff.filter((k) => !!k.approvalAuthority);
  const supplierContacts = [
    ...eventVendors
      .filter((ev) => !ev.vendor.isSystemVendor)
      .flatMap((ev) =>
        ev.vendor.contacts.slice(0, 1).map((vc) => ({
          key: `vendor-${vc.id}`,
          company: ev.vendor.name,
          role: vc.contactType,
          contact: vc.contact,
        })),
      ),
    ...venueContacts.map((vc) => ({
      key: `venue-${vc.id}`,
      company: vc.venue.name,
      role: vc.role,
      contact: vc.contact,
    })),
  ];

  const derived: Record<EsgDerivedSource, boolean> = {
    eventName: !!event.name,
    eventDates: true,
    primaryFacility: event.venues.length > 0,
    expectedAttendance: event.expectedAttendance !== null,
    membership: event.isMembershipBased && event.membershipCount !== null,
    keyContacts: keyStaff.length > 0,
    supplierContacts: supplierContacts.length > 0,
    emergencyContact: keyStaff.some((k) => k.isEmergencyContact),
    fbAttendance: fbGridHasData(fbGrid),
    signatories: signatories.length > 0,
    housingBlocks: housing.roomBlocks.length > 0,
    exhibitBooths: boothCount > 0,
  };
  const gridCounts: Record<SpecGrid, number> = {
    vips: vips.length,
    shuttles: shuttles.length,
    transfers: transfers.length,
    shipments: shipments.length,
    coverage: coverage.length,
    keys: keys.length,
    futureDates: futureDates.length,
    distributions: distributions.length,
  };
  const completeness = computeEsgCompleteness({
    spec: spec ? { ...(spec as unknown as Record<string, unknown>), narrative, naSections: spec.naSections } : null,
    derived,
    gridCounts,
  });

  return {
    event,
    spec,
    narrative,
    storedNarrative,
    inheritedNarrative,
    grids: { vips, shuttles, transfers, shipments, coverage, keys, futureDates, distributions },
    keyStaff,
    signatories,
    supplierContacts,
    eventVendors: eventVendors.map((ev) => ev.vendor),
    functions,
    options: {
      event_type: optionsBy("event_type"),
      event_scope: optionsBy("event_scope"),
      event_frequency: optionsBy("event_frequency"),
      reservation_method: optionsBy("reservation_method"),
    },
    fbGrid,
    housing,
    boothCount,
    derived,
    gridCounts,
    completeness,
  };
}

export type EsgNarrativeData = NonNullable<Awaited<ReturnType<typeof loadEsgNarrativeData>>>;
