// APEX Post-Event Report: loads the event's post-event record plus derived
// actuals, and assembles sections I–IX as EsgSection blocks (rendered by the
// same block views as the ESG). No auth — callers gate it (the Post-Event
// page via requirePermission, the report via the share-link carve-out).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eventVenuesInclude } from "@/lib/eventVenues";
import { formatEventDate, getDateKeyInTimezone } from "@/lib/agendaUtils";
import { formatPhone } from "@/lib/format-phone";
import { firmestGuestCount } from "@/lib/cateringGuestCount";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { loadEsgNarrativeData, type EsgNarrativeData } from "@/lib/esg/narrativeData";
import { functionStartKey } from "@/lib/esg/scheduleKey";
import { buildFbAttendanceGrid, PER_FB_ROWS } from "@/lib/esg/fbGrid";
import { formatDateOnly, formatDayDate, formatDayDateTime, isBlankText } from "@/lib/esg/format";
import { DISTRIBUTION_ACTIONS, type EsgFieldDef } from "@/lib/esg/fields";
import { PER_ATTRIBUTION, PER_SECTIONS, type PerDerivedSource } from "@/lib/esg/perFields";
import { MEAL_BUCKETS } from "@/lib/esg/apex";
import type { EsgBlock, EsgItem, EsgSection } from "@/lib/esg/types";

const sched = { select: { type: true, startTime: true, endTime: true, isPublic: true } } as const;

export async function loadPerData(eventId: string) {
  const narrative = await loadEsgNarrativeData(eventId);
  if (!narrative) return null;
  const { event } = narrative;
  const [postEvent, functions, catering, booths, mealTypes, scheduleTypes, prior, next] = await Promise.all([
    prisma.eventPostEvent.findUnique({ where: { eventId } }),
    prisma.function.findMany({
      // `not` alone would also drop rows with no status (SQL NULL).
      where: { eventId, OR: [{ status: null }, { status: { not: "CANCELLED" } }] },
      select: {
        id: true,
        name: true,
        type: true,
        functionNumber: true,
        offSiteLocation: true,
        hold24Hour: true,
        expectedAttendance: true,
        actualAttendance: true,
        setForCount: true,
        breakoutGroup: { select: { name: true, rooms: { select: { roomId: true } } } },
        sessionRoomOverrides: { select: { roomId: true, type: true } },
        schedules: sched,
        setupOrderFunctions: { select: { setupOrder: { select: { setupType: true } } } },
        rooms: { select: { room: { select: { name: true } } } },
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
        actualCount: true,
        function: { select: { name: true, functionNumber: true, schedules: sched } },
        lineItems: { select: { unitPrice: true, quantity: true } },
      },
    }),
    prisma.exhibitBooth.findMany({
      where: { eventId },
      select: { companyName: true, name: true, boothType: true, group: { select: { boothType: true } } },
    }),
    prisma.customOption.findMany({
      where: { category: "meal_type", tenant: { events: { some: { id: eventId } } } },
      select: { label: true, group: true },
    }),
    prisma.customOption.findMany({
      where: { category: "schedule_type", tenant: { events: { some: { id: eventId } } } },
      select: { label: true, group: true },
    }),
    event.seriesId
      ? prisma.event.findFirst({
          where: { seriesId: event.seriesId, startDate: { lt: event.startDate }, NOT: { id: eventId } },
          orderBy: { startDate: "desc" },
          include: eventVenuesInclude,
        })
      : null,
    event.seriesId
      ? prisma.event.findFirst({
          where: { seriesId: event.seriesId, startDate: { gt: event.startDate }, NOT: { id: eventId } },
          orderBy: { startDate: "asc" },
          include: eventVenuesInclude,
        })
      : null,
  ]);
  const support = new Set(scheduleTypes.filter((o) => o.group === "SETUP" || o.group === "TEARDOWN").map((o) => o.label));
  if (support.size === 0) ["Setup", "Breakdown"].forEach((l) => support.add(l));
  return { narrative, postEvent, functions, catering, booths, mealTypes, support, prior, next };
}

export type PerData = NonNullable<Awaited<ReturnType<typeof loadPerData>>>;

export type PerDocument = {
  meta: { eventName: string; eventDates: string; generatedAt: string; timezone: string };
  sections: EsgSection[];
  attribution: string;
};

function person(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim();
}

function pct(n: number | null | undefined, of: number | null | undefined): string {
  return n != null && of ? ` (${Math.round((n / of) * 100)}%)` : "";
}

function count(n: number | null | undefined): string | null {
  return n == null ? null : String(n);
}

function yn(v: boolean | null | undefined): string | null {
  return v == null ? null : v ? "Yes" : "No";
}

function fieldValue(d: PerData, f: EsgFieldDef): EsgItem {
  const pe = d.postEvent as Record<string, unknown> | null;
  const narrative = (d.postEvent?.narrative as Record<string, unknown> | null) ?? {};
  const raw = f.storage === "narrative" ? narrative[f.key] : pe?.[f.key];
  const base = { label: f.label, required: f.required };
  if (raw === null || raw === undefined || raw === "") return { ...base, value: null };
  if (f.kind === "richtext") return { ...base, value: null, html: isBlankText(raw) ? null : (raw as string) };
  if (f.kind === "bool") return { ...base, value: raw ? "Yes" : "No" };
  return { ...base, value: String(raw) };
}

function venueLine(e: { venues: { venue: { name: string; city: string | null; state: string | null; country: string | null } }[] }) {
  const v = e.venues[0]?.venue;
  return v ? { facility: v.name, place: [v.city, v.state, v.country].filter(Boolean).join(", ") || null } : { facility: null, place: null };
}

function effectiveRoomCount(fn: PerData["functions"][number]): number {
  const ids = new Set((fn.breakoutGroup?.rooms ?? []).map((r) => r.roomId));
  for (const o of fn.sessionRoomOverrides) {
    if (o.type === "exclude") ids.delete(o.roomId);
    else ids.add(o.roomId);
  }
  return ids.size;
}

export function perDerivedBlocks(d: PerData, source: PerDerivedSource, label: string): EsgBlock[] {
  const n: EsgNarrativeData = d.narrative;
  const { event } = n;
  const tz = event.timezone;
  const pe = d.postEvent;
  switch (source) {
    case "eventSummary": {
      const { facility, place } = venueLine(event);
      return [
        {
          kind: "fields",
          items: [
            { label: "Event name", value: event.name, required: true },
            { label: "Organizer / host", value: (n.narrative.hostOrgName as string) ?? null, required: true },
            { label: "Event location", value: place, required: true },
            { label: "Published start date", value: formatEventDate(event.startDate, tz), required: true },
            { label: "Published end date", value: formatEventDate(event.endDate, tz), required: true },
            { label: "Event type", value: n.spec?.eventType ?? null },
            { label: "Event frequency", value: n.spec?.eventFrequency ?? null },
            { label: "Event web address", value: (n.narrative.eventWebsite as string) ?? null },
            { label: "Primary event facility", value: facility, required: true },
            { label: "Event objectives", value: null, html: (n.narrative.eventObjectives as string) ?? null },
          ],
        },
      ];
    }
    case "attendance": {
      const actual = event.actualAttendance;
      const domestic = pe?.domesticAttendees ?? null;
      const intl = pe?.internationalAttendees ?? null;
      return [
        {
          kind: "fields",
          items: [
            ...(event.isMembershipBased ? [{ label: "Membership", value: count(event.membershipCount) }] : []),
            { label: "Original expected attendance", value: count(event.expectedAttendance) },
            { label: "Total pre-registered attendance", value: count(n.spec?.preRegisteredCount) },
            {
              label: "Actual attendance (including exhibitors)",
              required: true,
              value:
                actual == null
                  ? null
                  : `${actual}${event.isMembershipBased && event.membershipCount ? ` (${Math.round((actual / event.membershipCount) * 100)}% of membership)` : ""}`,
            },
            { label: "Domestic attendees", value: domestic == null ? null : `${domestic}${pct(domestic, actual)}` },
            { label: "International attendees", value: intl == null ? null : `${intl}${pct(intl, actual)}` },
          ],
        },
      ];
    }
    case "lastOccurrence": {
      if (!d.prior) return [{ kind: "note", text: "No earlier event in this series." }];
      const { facility, place } = venueLine(d.prior);
      return [
        {
          kind: "fields",
          items: [
            { label: "Event", value: d.prior.name },
            { label: "Dates", value: `${formatEventDate(d.prior.startDate, d.prior.timezone)} – ${formatEventDate(d.prior.endDate, d.prior.timezone)}` },
            { label: "Primary facility", value: facility },
            { label: "Location", value: place },
            { label: "Actual attendance", value: count(d.prior.actualAttendance) },
          ],
        },
      ];
    }
    case "keyContacts":
      return n.keyStaff.length === 0
        ? [{ kind: "note", text: "No event contacts recorded." }]
        : [
            {
              kind: "table",
              table: {
                columns: ["Name", "Job title", "Employer", "Phone", "Email"],
                rows: n.keyStaff.map((k) => [
                  person(k.contact),
                  k.title,
                  k.contact.organization,
                  k.contact.phone ? formatPhone(k.contact.phone) : null,
                  k.contact.email,
                ]),
              },
            },
          ];
    case "housingSummary": {
      const s = n.housing.perSummary;
      if (n.housing.source !== "hotels") return [];
      return [
        {
          kind: "fields",
          items: [
            { label: "Event used sleeping rooms", value: yn(s.usedSleepingRooms) },
            { label: "Number of hotels used", value: count(s.hotelCount) },
            { label: "Total rooms used on peak night", value: count(s.peakNightRooms) },
            { label: "Housing services performed by", value: s.performedBy },
          ],
        },
      ];
    }
    case "roomBlocks": {
      const hotels = n.housing.perHotels;
      if (hotels.length === 0) {
        return [{ kind: "note", text: "No room blocks. Add them under Hotels." }];
      }
      return hotels.map(
        (h): EsgBlock => ({
          kind: "table",
          table: {
            title: `${h.facilityName}${h.isHq ? " (HQ)" : ""}`,
            columns: ["Night", "Contracted", "Final", "90 day", "60 day", "30 day", "21 day", "14 day", "7 day", "Actual"],
            numeric: [false, true, true, true, true, true, true, true, true, true],
            rows: h.nights.map((x) => [
              formatDayDate(new Date(`${x.dateKey}T12:00:00Z`), "UTC"),
              count(x.contracted),
              count(x.final),
              count(x.pickup90),
              count(x.pickup60),
              count(x.pickup30),
              count(x.pickup21),
              count(x.pickup14),
              count(x.pickup7),
              count(x.actual),
            ]),
          },
        }),
      );
    }
    case "fbSchedule": {
      const grid = buildFbAttendanceGrid(
        d.catering.map((o) => ({
          id: o.id,
          name: o.name,
          status: o.status,
          mealType: o.mealType,
          expectedCount: o.expectedCount,
          confirmedCount: o.confirmedCount,
          guaranteeCount: o.guaranteeCount,
          actualCount: o.actualCount,
          serviceStart: o.function ? functionStartKey(o.function.schedules, d.support) : null,
        })),
        d.mealTypes,
        tz,
        "per",
      );
      if (grid.days.length === 0) return [{ kind: "note", text: "No catered functions with a meal type." }];
      return [
        {
          kind: "table",
          table: {
            title: "# held / # guar / # fed",
            columns: ["", ...grid.days.map((day) => formatDayDate(new Date(`${day}T12:00:00Z`), "UTC"))],
            rows: PER_FB_ROWS.map((r) => {
              const row = grid.rows.find((x) => x.key === r.key);
              return [
                r.label,
                ...grid.days.map((day) => {
                  const c = row?.cells[day];
                  return c ? `${c.held} / ${c.guaranteed || "—"} / ${c.hasFed ? c.fed : "—"}` : null;
                }),
              ];
            }),
          },
        },
      ];
    }
    case "largestFb": {
      const bucketOf = new Map(d.mealTypes.map((m) => [m.label, m.group]));
      const live = d.catering.filter((o) => o.status !== "CANCELLED");
      const sized = live.map((o) => ({ o, size: o.actualCount ?? firmestGuestCount(o)?.value ?? 0 }));
      const largest = sized.sort((a, b) => b.size - a.size)[0];
      // Revenue by APEX meal bucket, summed in Decimal (never float).
      const revenue = new Map<string, Prisma.Decimal>();
      for (const o of live) {
        const bucket = (o.mealType && bucketOf.get(o.mealType)) || null;
        if (!bucket) continue;
        let total = revenue.get(bucket) ?? new Prisma.Decimal(0);
        for (const li of o.lineItems) {
          if (li.unitPrice && li.quantity) total = total.add(li.unitPrice.mul(li.quantity));
        }
        revenue.set(bucket, total);
      }
      const top = Array.from(revenue.entries()).sort((a, b) => b[1].comparedTo(a[1]))[0];
      const bucketLabel = (b: string | null | undefined) => MEAL_BUCKETS.find((m) => m.value === b)?.label ?? b ?? null;
      return [
        {
          kind: "fields",
          items: [
            { label: "Attendance at largest F&B function", value: largest && largest.size ? `${largest.size} — ${largest.o.name}` : null },
            { label: "Type of largest F&B function", value: largest?.o.mealType ?? null },
            { label: "Largest revenue-producing F&B type", value: top && top[1].gt(0) ? `${bucketLabel(top[0])} (${top[1].toFixed(2)})` : null },
          ],
        },
      ];
    }
    case "largestFunction": {
      const sized = d.functions
        .filter((f) => f.type !== "BREAKOUT_BLOCK")
        .map((f) => ({ f, size: f.actualAttendance ?? f.expectedAttendance ?? f.setForCount ?? 0 }))
        .sort((a, b) => b.size - a.size);
      const top = sized[0];
      if (!top || top.size === 0) return [{ kind: "note", text: "Record function attendance to identify the largest function." }];
      return [
        {
          kind: "fields",
          items: [
            { label: "Largest function", value: formatFunctionLabel(top.f) },
            { label: "Attendance at largest function", value: String(top.size), required: true },
            { label: "Space on a 24-hour hold", value: top.f.hold24Hour ? "Yes" : "No" },
            { label: "Room set-up for the largest function", value: top.f.setupOrderFunctions.map((l) => l.setupOrder.setupType).filter(Boolean).join("; ") || null },
          ],
        },
      ];
    }
    case "breakouts": {
      const blocks = d.functions.filter((f) => f.type === "BREAKOUT_BLOCK");
      if (blocks.length === 0) return [];
      const perDay = new Map<string, number>();
      let total = 0;
      const setups = new Map<string, number>();
      for (const b of blocks) {
        const rooms = effectiveRoomCount(b);
        total += rooms;
        const k = functionStartKey(b.schedules, d.support);
        if (k !== null) {
          const day = getDateKeyInTimezone(new Date(k), tz);
          perDay.set(day, (perDay.get(day) ?? 0) + rooms);
        }
        for (const l of b.setupOrderFunctions) if (l.setupOrder.setupType) setups.set(l.setupOrder.setupType, (setups.get(l.setupOrder.setupType) ?? 0) + 1);
      }
      const typical = Array.from(setups.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return [
        {
          kind: "fields",
          items: [
            { label: "Total concurrent breakout sessions", value: String(total) },
            { label: "Largest daily total of concurrent breakouts", value: String(Math.max(0, ...Array.from(perDay.values()))) },
            { label: "Typical breakout room set-up", value: typical },
          ],
        },
      ];
    }
    case "exhibitSummary": {
      const spec = n.spec;
      if (d.booths.length === 0 && !spec?.grossSqFt && !spec?.netSqFt) return [];
      const companies = new Set(d.booths.map((b) => b.companyName || b.name));
      const types = Array.from(new Set(d.booths.map((b) => b.boothType ?? b.group?.boothType).filter(Boolean)));
      const sqm = (ft: number | null | undefined) => (ft ? ` (${Math.round(ft * 0.092903)} m²)` : "");
      return [
        {
          kind: "fields",
          items: [
            { label: "Number of exhibits", value: String(d.booths.length) },
            { label: "Number of exhibiting companies", value: String(companies.size) },
            { label: "Type of exhibits", value: types.join(", ") || null },
            { label: "Gross square feet used", value: spec?.grossSqFt ? `${spec.grossSqFt}${sqm(spec.grossSqFt)}` : null },
            { label: "Net square feet used", value: spec?.netSqFt ? `${spec.netSqFt}${sqm(spec.netSqFt)}` : null },
            { label: "Exhibitor move-in", value: spec?.exhibitorMoveInStart ? formatDayDateTime(spec.exhibitorMoveInStart, tz) : null },
            { label: "Exhibitor move-out", value: spec?.exhibitorMoveOutEnd ? formatDayDateTime(spec.exhibitorMoveOutEnd, tz) : null },
          ],
        },
      ];
    }
    case "nextInSeries": {
      if (!d.next) return [];
      const { facility, place } = venueLine(d.next);
      return [
        {
          kind: "fields",
          items: [
            { label: label, value: d.next.name },
            { label: "Next published dates", value: `${formatEventDate(d.next.startDate, d.next.timezone)} – ${formatEventDate(d.next.endDate, d.next.timezone)}` },
            { label: "Next facility", value: facility },
            { label: "Next location", value: place },
          ],
        },
      ];
    }
    default: {
      const _exhaustive: never = source;
      throw new Error(`Unhandled PER source: ${_exhaustive}`);
    }
  }
}

function gridBlocks(d: PerData, grid: "futureDates" | "distributions"): EsgBlock | null {
  if (grid === "futureDates") {
    const rows = d.narrative.grids.futureDates;
    if (rows.length === 0) return null;
    return {
      kind: "table",
      table: {
        title: "Future dates",
        columns: ["Start", "End", "Facility", "City", "State / province", "Country", "Comments"],
        rows: rows.map((r) => [formatDateOnly(r.startDate), formatDateOnly(r.endDate), r.facility, r.city, r.state, r.country, r.comments]),
      },
    };
  }
  const rows = d.narrative.grids.distributions;
  if (rows.length === 0) return null;
  return {
    kind: "table",
    table: {
      columns: ["Report", "Date", "By", "Delivered via", "Delivered on", "Recipients"],
      rows: rows.map((r) => [
        DISTRIBUTION_ACTIONS.find((a) => a.value === r.action)?.label ?? r.action,
        formatDateOnly(r.actionDate),
        [r.byName, r.byTitle, r.byEmployer].filter(Boolean).join(", ") || null,
        r.method,
        formatDateOnly(r.deliveredOn),
        r.recipients,
      ]),
    },
  };
}

const SHOWN_IN_ATTENDANCE = new Set(["domesticAttendees", "internationalAttendees"]);

export function assemblePerDocument(d: PerData, opts: { showBlank: boolean }): PerDocument {
  const { event } = d.narrative;
  const na = new Set(d.postEvent?.naSections ?? []);
  const sections: EsgSection[] = PER_SECTIONS.map((s) => {
    if (na.has(s.letter)) return { letter: s.letter, title: s.title, na: true, blocks: [] };
    const blocks: EsgBlock[] = [];
    for (const def of s.derived ?? []) blocks.push(...perDerivedBlocks(d, def.source, def.label));
    // Domestic / international print inside the attendance block (with %).
    const items = s.fields.filter((f) => !SHOWN_IN_ATTENDANCE.has(f.key)).map((f) => fieldValue(d, f));
    const kept = opts.showBlank ? items : items.filter((i) => i.value !== null || (i.html && !isBlankText(i.html)));
    if (kept.length) blocks.push({ kind: "fields", items: kept });
    for (const g of s.grids ?? []) {
      const b = gridBlocks(d, g.grid as "futureDates" | "distributions");
      if (b) blocks.push(b);
    }
    return { letter: s.letter, title: s.title, na: false, blocks };
  }).filter((s) => s.na || s.blocks.length > 0 || opts.showBlank);
  return {
    meta: {
      eventName: event.name,
      eventDates: `${formatEventDate(event.startDate, event.timezone)} – ${formatEventDate(event.endDate, event.timezone)}`,
      generatedAt: formatDayDateTime(new Date(), event.timezone),
      timezone: event.timezone,
    },
    sections,
    attribution: PER_ATTRIBUTION,
  };
}

// Required PER fields still missing (sections marked N/A exempt).
export function perCompleteness(d: PerData) {
  const na = new Set(d.postEvent?.naSections ?? []);
  const missing: { section: string; label: string }[] = [];
  let total = 0;
  for (const s of PER_SECTIONS) {
    if (na.has(s.letter)) continue;
    for (const f of s.fields) {
      if (!f.required) continue;
      total++;
      const v = fieldValue(d, f);
      if (v.value === null && (!v.html || isBlankText(v.html))) missing.push({ section: s.letter, label: f.label });
    }
    if (s.derived?.some((x) => x.source === "attendance")) {
      total++;
      if (d.narrative.event.actualAttendance == null) missing.push({ section: s.letter, label: "Actual attendance (on the event)" });
    }
    if (s.derived?.some((x) => x.source === "keyContacts")) {
      total++;
      if (d.narrative.keyStaff.length === 0) missing.push({ section: s.letter, label: "At least one event contact" });
    }
    for (const g of s.grids ?? []) {
      if (!g.required) continue;
      total++;
      if (d.narrative.gridCounts[g.grid] === 0) missing.push({ section: s.letter, label: g.label });
    }
  }
  return { done: total - missing.length, total, missing };
}
