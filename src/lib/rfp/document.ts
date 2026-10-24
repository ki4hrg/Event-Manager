// The RFP document as plain data: one shape read by the print page and the
// .docx renderer (src/lib/rfp/renderDocx.ts). Built from loaded rows by
// buildRfpDocument, in the order of the APEX Single Facility RFP
// (docs/apex/APEX_Single_Facility_RFP.pdf): I contact information, II event
// profile and history, III requirements (dates, facility summary, guest
// rooms, function space, F&B, concessions), IV proposal specifications, V
// the proposal content we ask back. A part that is switched off is null. Pure.

import type { HotelContractType, RfpKind, RfpSpaceKind, RfpStatus } from "@prisma/client";
import { addDays, blockTypeLabel, dateKey, formatDateKey, formatMoney, formatNight, RUN_OF_HOUSE, roomTypeLabel } from "@/lib/hotels";
import { CONCESSION_GROUPS, concessionGroupOf, FB_INCLUDES, type ConcessionGroup, type RfpSection } from "@/lib/rfp/sections";
import { DAY_TBD, formatClockRange, sortSpaceRows, spaceRowDays } from "@/lib/rfp/space";
import { groupLineItems } from "@/lib/rfp/lineItems";
import { RFP_KIND_LABELS } from "@/lib/rfp/kinds";

export type RfpBlockDoc = {
  label: string; // "Contract · Attendees block"
  targetRate: string | null; // formatted
  targetRateRequired: boolean; // "must be no more than" rather than a target
  notes: string | null;
  nights: string[]; // night keys, ascending — the table's rows
  roomTypes: string[]; // the table's columns
  cells: Record<string, Record<string, number>>; // night → room type → rooms
  totals: Record<string, number>;
  peak: number;
  roomNights: number;
};

export type RfpSpaceDocRow = {
  time: string;
  name: string;
  type: string | null;
  setup: string | null;
  attendance: number | null;
  areaSqFt: number | null;
  av: string | null;
  hold24: boolean;
  room: string | null;
};

export type RfpSpaceDay = { day: string | null; label: string; rows: RfpSpaceDocRow[] };

export type RfpHistoryRow = {
  name: string;
  facility: string;
  city: string | null;
  start: string;
  end: string;
  attendance: number | null;
  peak: number;
  roomNights: number;
  blockedNights: number;
  pickupPercent: number | null;
};

export type RfpFact = { label: string; value: string };

export type RfpConcessionItem = { label: string; value: string | null; required: boolean };

// A vendor RFP's line item as printed.
export type RfpLineDocRow = { description: string; quantity: string | null; when: string | null; notes: string | null };
export type RfpLineGroup = { group: string | null; rows: RfpLineDocRow[] };

export type RfpDocument = {
  meta: {
    kind: RfpKind;
    kindLabel: string; // "AV", "Transportation"
    title: string;
    status: RfpStatus;
    eventName: string;
    eventDates: string;
    issuedOn: string | null;
    responseDue: string | null;
  };
  // I. Contact information
  contact: { name: string; title: string | null; organization: string | null; email: string | null; phone: string | null } | null;
  host: { name: string; address: string | null; phone: string | null; website: string | null } | null;
  // II. Event profile
  profile: {
    facts: RfpFact[];
    overview: string | null; // RichTextEditor HTML (ESG)
    objectives: string | null;
    demographics: string | null;
    accessibility: string | null;
  };
  history: RfpHistoryRow[] | null;
  historyOf: string | null; // "Contract · Attendees" when history is limited to blocks like this RFP's
  // III. Requirements
  statementOfNeed: string | null; // RichTextEditor HTML
  locations: string[]; // preferred hotel areas
  dates: { preferred: string | null; alternates: string[]; flexible: boolean; notes: string | null };
  facility: RfpFact[];
  blocks: RfpBlockDoc[] | null;
  lineItems: RfpLineGroup[] | null; // vendor RFPs
  roomTerms: RfpFact[];
  meetingSpace: RfpSpaceDay[] | null;
  fb: { days: RfpSpaceDay[]; terms: RfpFact[] } | null;
  amenities: string[];
  concessions: { group: string; items: RfpConcessionItem[] }[] | null;
  requirements: string | null; // RichTextEditor HTML
  // IV. Proposal specifications
  specs: RfpFact[];
  attachments: string[];
  // V. Proposal content — what the hotel fills in and returns.
  responseForm: {
    roomTypes: string[];
    meetingSpace: { day: string; time: string; name: string; setup: string | null }[];
    mealTypes: string[];
    // APEX "Concessions Offered": every heading with the concessions we asked
    // for under it; the form adds blank rows for ones the hotel offers unasked.
    concessions: { group: string; items: string[] }[];
    // Vendor RFPs: a price row per line item, under its group.
    lineItems: { group: string | null; description: string; quantity: string | null }[];
  } | null;
};

type Dec = { toString(): string } | null;

export type RfpDocumentInput = {
  rfp: {
    kind: RfpKind;
    title: string;
    status: RfpStatus;
    sections: RfpSection[];
    responseDue: Date | null;
    decisionBy: Date | null;
    issuedOn: Date | null;
    siteVisitBy: Date | null;
    decisionMaker: string | null;
    historyOf: string | null;
    locations: string[]; // preferred regions / areas (the RFP's own, else the event's)
    introduction: string | null;
    requirements: string | null;
    arrivalDate: Date | null;
    departureDate: Date | null;
    datesFlexible: boolean;
    dateNotes: string | null;
    alternateDates: { startDate: Date; endDate: Date }[];
    peakRooms: number | null;
    reservationMethod: string | null;
    commissionNotes: string | null;
    fbMinimum: Dec;
    fbIncludes: string[];
    fbHistoricalSpend: Dec;
    amenities: string[];
    contact: { firstName: string; lastName: string; organization: string | null; email: string | null; phone: string | null } | null;
    contactTitle: string | null;
    concessions: RfpConcessionItem[];
    hotelBlocks: {
      contractType: HotelContractType;
      guestType: string | null;
      targetRate: Dec;
      targetRateRequired: boolean;
      notes: string | null;
      nights: { roomType: string | null; night: Date; rooms: number }[];
    }[];
    spaceRequests: {
      kind: RfpSpaceKind;
      day: Date | null;
      endDay: Date | null;
      startTime: string | null;
      endTime: string | null;
      functionType: string | null;
      name: string;
      attendance: number | null;
      setup: string | null;
      areaSqFt: number | null;
      av: string | null;
      hold24: boolean;
      room: string | null;
    }[];
    attachments: string[];
    // Vendor RFPs.
    service: string | null;
    lineItems: {
      group: string | null;
      description: string;
      quantity: number | null;
      unit: string | null;
      day: Date | null;
      endDay: Date | null;
      startTime: string | null;
      endTime: string | null;
      notes: string | null;
    }[];
  };
  event: {
    name: string;
    startDate: Date;
    endDate: Date;
    expectedAttendance: number | null;
    location: string | null;
  };
  // ESG §A / §D (EventSpecification), when filled in.
  spec: {
    hostOrgName: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    eventType: string | null;
    eventScope: string | null;
    eventFrequency: string | null;
    overview: string | null;
    objectives: string | null;
    demographics: string | null;
    accessibility: string | null;
  };
  // The concession option list's headings (label → group).
  concessionGroups: Record<string, string | null>;
  history: {
    name: string;
    startDate: string;
    endDate: string;
    city: string | null;
    actualAttendance: number | null;
    pickedUp: Record<string, number>;
    blocked: Record<string, number>;
    hotels: string[];
  }[];
};

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);
const fmtDay = (d: Date | null) => (d ? formatDateKey(dateKey(d)) : null);
const fact = (label: string, value: string | number | null | undefined): RfpFact[] =>
  value == null || value === "" ? [] : [{ label, value: String(value) }];

function dateSpan(start: string, end: string) {
  return start === end ? formatDateKey(start) : `${formatDateKey(start)} – ${formatDateKey(end)}`;
}

export const blockLabel = (contractType: HotelContractType, guestType: string | null) => `${blockTypeLabel(contractType, guestType)} block`;

function blockDoc(b: RfpDocumentInput["rfp"]["hotelBlocks"][number]): RfpBlockDoc {
  const nights = Array.from(new Set(b.nights.map((n) => dateKey(n.night)))).sort();
  // Run of House first, then typed rooms in the order they were entered.
  const typed = Array.from(new Set(b.nights.flatMap((n) => (n.roomType != null ? [n.roomType] : []))));
  const roomTypes = [...(b.nights.some((n) => n.roomType == null) ? [RUN_OF_HOUSE] : []), ...typed];
  const cells: RfpBlockDoc["cells"] = {};
  for (const n of b.nights) {
    const k = dateKey(n.night);
    const t = roomTypeLabel(n.roomType);
    cells[k] = { ...(cells[k] ?? {}), [t]: (cells[k]?.[t] ?? 0) + n.rooms };
  }
  const totals = Object.fromEntries(nights.map((k) => [k, sum(Object.values(cells[k] ?? {}))]));
  return {
    label: blockLabel(b.contractType, b.guestType),
    targetRate: b.targetRate != null ? formatMoney(b.targetRate.toString()) : null,
    targetRateRequired: b.targetRateRequired,
    notes: b.notes,
    nights,
    roomTypes,
    cells,
    totals,
    peak: Math.max(0, ...Object.values(totals)),
    roomNights: sum(Object.values(totals)),
  };
}

// One line per day a row covers (a repeating row prints on each day, as on
// the APEX and hotel forms), grouped by day.
function expand(rows: RfpDocumentInput["rfp"]["spaceRequests"]) {
  return rows.flatMap((r) => spaceRowDays({ day: r.day ? dateKey(r.day) : null, endDay: r.endDay ? dateKey(r.endDay) : null }).map((day) => ({ ...r, day })));
}

function spaceDays(rows: RfpDocumentInput["rfp"]["spaceRequests"]): RfpSpaceDay[] {
  const sorted = sortSpaceRows(expand(rows));
  const days = Array.from(new Set(sorted.map((r) => r.day)));
  return days.map((day) => ({
    day,
    label: day ? formatNight(day) : DAY_TBD,
    rows: sorted
      .filter((r) => r.day === day)
      .map((r) => ({
        time: formatClockRange(r.startTime, r.endTime),
        name: r.name,
        type: r.functionType,
        setup: r.setup,
        attendance: r.attendance,
        areaSqFt: r.areaSqFt,
        av: r.av,
        hold24: r.hold24,
        room: r.room,
      })),
  }));
}

// Most meeting rows running at once on any day (APEX "breakout rooms
// required simultaneously"); rows without both times don't count.
export function mostAtOnce(rows: { day: string | null; startTime: string | null; endTime: string | null }[]): number {
  // An end at or before the start runs overnight: until midnight, then from
  // midnight on the next day.
  const timed = rows
    .filter((r): r is { day: string; startTime: string; endTime: string } => !!r.day && !!r.startTime && !!r.endTime)
    .flatMap((r) =>
      r.endTime > r.startTime
        ? [r]
        : [
            { day: r.day, startTime: r.startTime, endTime: "24:00" },
            ...(r.endTime > "00:00" ? [{ day: addDays(r.day, 1), startTime: "00:00", endTime: r.endTime }] : []),
          ],
    );
  let most = 0;
  for (const r of timed) {
    const at = timed.filter((o) => o.day === r.day && o.startTime <= r.startTime && r.startTime < o.endTime).length;
    most = Math.max(most, at);
  }
  return most;
}

function historyRows(input: RfpDocumentInput): RfpHistoryRow[] {
  return input.history.map((e) => {
    const roomNights = sum(Object.values(e.pickedUp));
    const blockedNights = sum(Object.values(e.blocked));
    return {
      name: e.name,
      facility: e.hotels.join(", "),
      city: e.city,
      start: formatDateKey(e.startDate),
      end: formatDateKey(e.endDate),
      attendance: e.actualAttendance,
      peak: Math.max(0, ...Object.values(e.pickedUp)),
      roomNights,
      blockedNights,
      pickupPercent: blockedNights > 0 ? Math.round((roomNights / blockedNights) * 1000) / 10 : null,
    };
  });
}

function lineGroups(rows: RfpDocumentInput["rfp"]["lineItems"]): RfpLineGroup[] {
  return groupLineItems(rows).map((g) => ({
    group: g.group,
    rows: g.rows.map((r) => {
      const day = r.day ? dateKey(r.day) : null;
      const endDay = r.endDay ? dateKey(r.endDay) : null;
      const when = [day ? (endDay ? `${formatNight(day)} – ${formatNight(endDay)}` : formatNight(day)) : null, r.startTime ? formatClockRange(r.startTime, r.endTime) : null]
        .filter(Boolean)
        .join(", ");
      return {
        description: r.description,
        quantity: r.quantity != null ? `${r.quantity}${r.unit ? ` ${r.unit}` : ""}` : r.unit,
        when: when || null,
        notes: r.notes,
      };
    }),
  }));
}

export function buildRfpDocument(input: RfpDocumentInput): RfpDocument {
  const { rfp, event, spec } = input;
  const on = new Set(rfp.sections);
  const hotel = rfp.kind === "HOTEL";
  const blocks = rfp.hotelBlocks.map(blockDoc);
  const meeting = rfp.spaceRequests.filter((r) => r.kind === "MEETING");
  const fbRows = rfp.spaceRequests.filter((r) => r.kind === "FB");

  // Peak night across every block; the RFP's own peak when no grid is filled.
  const allNights = Array.from(new Set(blocks.flatMap((b) => b.nights)));
  const peakAcross = Math.max(0, ...allNights.map((k) => sum(blocks.map((b) => b.totals[k] ?? 0))));
  const largest = meeting.reduce<(typeof meeting)[number] | null>((best, r) => ((r.attendance ?? 0) > (best?.attendance ?? 0) ? r : best), null);
  const atOnce = mostAtOnce(expand(meeting));

  const arrival = rfp.arrivalDate ? dateKey(rfp.arrivalDate) : null;
  const departure = rfp.departureDate ? dateKey(rfp.departureDate) : null;
  const grouped = new Map<ConcessionGroup, RfpConcessionItem[]>();
  // A vendor RFP's terms print under one heading.
  const concessionGroups = hotel ? CONCESSION_GROUPS : [{ value: "OTHER" as const, label: "Terms" }];
  for (const c of rfp.concessions) {
    const g = hotel ? concessionGroupOf(input.concessionGroups[c.label]) : "OTHER";
    grouped.set(g, [...(grouped.get(g) ?? []), c]);
  }
  const contactName = rfp.contact ? `${rfp.contact.firstName} ${rfp.contact.lastName}`.trim() : null;

  return {
    meta: {
      kind: rfp.kind,
      kindLabel: rfp.kind === "OTHER" && rfp.service ? rfp.service : RFP_KIND_LABELS[rfp.kind],
      title: rfp.title,
      status: rfp.status,
      eventName: event.name,
      eventDates: dateSpan(dateKey(event.startDate), dateKey(event.endDate)),
      issuedOn: fmtDay(rfp.issuedOn),
      responseDue: fmtDay(rfp.responseDue),
    },
    contact: rfp.contact
      ? { name: contactName!, title: rfp.contactTitle, organization: rfp.contact.organization, email: rfp.contact.email, phone: rfp.contact.phone }
      : null,
    host: spec.hostOrgName ? { name: spec.hostOrgName, address: spec.address, phone: spec.phone, website: spec.website } : null,
    profile: {
      facts: [
        ...fact("Event", event.name),
        ...fact("Host organization", spec.hostOrgName),
        ...fact("Dates", dateSpan(dateKey(event.startDate), dateKey(event.endDate))),
        ...fact("Location", event.location),
        ...fact("Event type", spec.eventType),
        ...fact("Scope", spec.eventScope),
        ...fact("Frequency", spec.eventFrequency),
        ...fact("Expected attendance", event.expectedAttendance),
      ],
      overview: spec.overview,
      objectives: spec.objectives,
      demographics: spec.demographics,
      accessibility: spec.accessibility,
    },
    history: on.has("history") ? historyRows(input) : null,
    historyOf: rfp.historyOf,
    statementOfNeed: rfp.introduction,
    locations: hotel ? rfp.locations : [],
    dates: {
      preferred: arrival && departure ? dateSpan(arrival, departure) : arrival ? formatDateKey(arrival) : null,
      alternates: rfp.alternateDates.map((a) => dateSpan(dateKey(a.startDate), dateKey(a.endDate))),
      flexible: rfp.datesFlexible,
      notes: rfp.dateNotes,
    },
    facility: [
      ...fact("Total room nights", on.has("blocks") ? sum(blocks.map((b) => b.roomNights)) || null : null),
      ...fact("Peak night room block", (on.has("blocks") && peakAcross) || rfp.peakRooms),
      ...fact(
        "Largest function",
        on.has("meetingSpace") && largest?.attendance ? [`${largest.attendance} people`, largest.setup, largest.name].filter(Boolean).join(" · ") : null,
      ),
      ...fact("Meeting rooms at once", on.has("meetingSpace") && atOnce > 1 ? atOnce : null),
    ],
    blocks: on.has("blocks") ? blocks : null,
    lineItems: on.has("lineItems") ? lineGroups(rfp.lineItems) : null,
    roomTerms: on.has("blocks") ? [...fact("Reservations", rfp.reservationMethod), ...fact("Rebates, assessments or commissions", rfp.commissionNotes)] : [],
    meetingSpace: on.has("meetingSpace") ? spaceDays(meeting) : null,
    fb: on.has("fb")
      ? {
          days: spaceDays(fbRows),
          terms: [
            ...fact("F&B minimum", rfp.fbMinimum != null ? formatMoney(rfp.fbMinimum.toString()) : null),
            ...fact(
              "Minimum includes",
              rfp.fbMinimum != null
                ? FB_INCLUDES.filter((f) => rfp.fbIncludes.includes(f.value))
                    .map((f) => f.label)
                    .join(", ") || "None of tax, service charge or gratuity"
                : null,
            ),
            ...fact("F&B historical spend", rfp.fbHistoricalSpend != null ? formatMoney(rfp.fbHistoricalSpend.toString()) : null),
          ],
        }
      : null,
    amenities: hotel ? rfp.amenities : [],
    concessions: on.has("concessions")
      ? concessionGroups.flatMap((g) => (grouped.get(g.value)?.length ? [{ group: g.label, items: grouped.get(g.value)! }] : []))
      : null,
    requirements: on.has("requirements") ? rfp.requirements : null,
    specs: [
      ...fact("Questions to", contactName),
      ...fact("RFP issued", fmtDay(rfp.issuedOn)),
      ...fact("Proposal due", fmtDay(rfp.responseDue)),
      ...fact("Decision date", fmtDay(rfp.decisionBy)),
      ...fact("Site visit by", fmtDay(rfp.siteVisitBy)),
      ...fact("Decision maker", rfp.decisionMaker),
    ],
    attachments: rfp.attachments,
    responseForm: on.has("responseForm")
      ? {
          roomTypes: Array.from(new Set(blocks.flatMap((b) => b.roomTypes))),
          meetingSpace: spaceDays(meeting).flatMap((d) => d.rows.map((r) => ({ day: d.label, time: r.time, name: r.name, setup: r.setup }))),
          // The F&B the RFP asks for, by type (or name when untyped).
          mealTypes: on.has("fb") ? Array.from(new Set(fbRows.map((r) => r.functionType ?? r.name))) : [],
          concessions: concessionGroups.map((g) => ({ group: g.label, items: (grouped.get(g.value) ?? []).map((c) => c.label) })),
          lineItems: lineGroups(rfp.lineItems).flatMap((g) => g.rows.map((r) => ({ group: g.group, description: r.description, quantity: r.quantity }))),
        }
      : null,
  };
}

// The response form's "Concessions offered" rows: under each heading, the
// concessions asked for, then blank rows for others the hotel offers.
const OTHER_CONCESSION_ROWS = 2;
export function concessionOfferRows(groups: { group: string; items: string[] }[]): string[][] {
  return groups.flatMap((g) => [...g.items.map((item) => [g.group, item]), ...Array.from({ length: OTHER_CONCESSION_ROWS }, () => [g.group])]);
}

// "peak 120 · 360 room nights" one-liner used in lists.
export function blockSummary(nights: { night: Date; rooms: number }[]): string | null {
  if (nights.length === 0) return null;
  const byNight = new Map<string, number>();
  for (const n of nights) byNight.set(dateKey(n.night), (byNight.get(dateKey(n.night)) ?? 0) + n.rooms);
  const peak = Math.max(0, ...Array.from(byNight.values()));
  return `peak ${peak} · ${sum(Array.from(byNight.values()))} room nights`;
}

// The block's rate line: a ceiling when required, else a target to aim for.
export const targetRateLine = (b: Pick<RfpBlockDoc, "targetRate" | "targetRateRequired">) =>
  b.targetRate ? (b.targetRateRequired ? `Room rate must be no more than ${b.targetRate}` : `Target room rate: ${b.targetRate}`) : null;
