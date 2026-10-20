// The RFP document as plain data: one shape read by the print page and the
// .docx renderer (src/lib/rfp/renderDocx.ts). Built from loaded rows by
// buildRfpDocument; a part that is switched off is null. Pure.

import type { HotelBlockType, RfpKind, RfpStatus } from "@prisma/client";
import { formatTimeRange, getDateKeyInTimezone } from "@/lib/agendaUtils";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { BLOCK_TYPE_LABELS, dateKey, formatDateKey, formatMoney } from "@/lib/hotels";
import type { FbGrid } from "@/lib/esg/fbGrid";
import type { RfpSection } from "@/lib/rfp/sections";

export type RfpBlockDoc = {
  label: string; // "Contract attendee block"
  isRunOfHouse: boolean;
  targetRate: string | null; // formatted
  notes: string | null;
  nights: string[]; // night keys, ascending
  rows: { roomType: string; rooms: Record<string, number> }[];
  totals: Record<string, number>;
  peak: number;
  roomNights: number;
};

export type RfpMeetingRow = {
  date: string; // night-style key in the event timezone
  time: string;
  name: string;
  type: string;
  setup: string | null;
  attendance: number | null;
  hold24: boolean;
  room: string | null;
};

export type RfpHistoryRow = {
  name: string;
  dates: string;
  attendance: number | null;
  peak: number;
  roomNights: number;
  blockedNights: number;
  pickupPercent: number | null;
  hotels: number;
};

export type RfpDocument = {
  meta: {
    kind: RfpKind;
    title: string;
    status: RfpStatus;
    eventName: string;
    eventDates: string;
    location: string | null;
    expectedAttendance: number | null;
    responseDue: string | null; // formatted
    decisionBy: string | null;
    issuedOn: string | null;
    contact: { name: string; title: string | null; organization: string | null; email: string | null; phone: string | null } | null;
  };
  introduction: string | null; // RichTextEditor HTML
  blocks: RfpBlockDoc[] | null;
  meetingSpace: { rows: RfpMeetingRow[]; showRoomNames: boolean } | null;
  fb: FbGrid | null;
  concessions: { label: string; value: string | null; required: boolean }[] | null;
  history: RfpHistoryRow[] | null;
  requirements: string | null; // RichTextEditor HTML
};

export type RfpDocumentInput = {
  rfp: {
    kind: RfpKind;
    title: string;
    status: RfpStatus;
    sections: RfpSection[];
    responseDue: Date | null;
    decisionBy: Date | null;
    issuedOn: Date | null;
    introduction: string | null;
    requirements: string | null;
    showRoomNames: boolean;
    excludedFunctionTypes: string[];
    contact: { firstName: string; lastName: string; organization: string | null; email: string | null; phone: string | null } | null;
    contactTitle: string | null;
    concessions: { label: string; value: string | null; required: boolean }[];
    hotelBlocks: {
      blockType: HotelBlockType;
      isRunOfHouse: boolean;
      targetRate: { toString(): string } | null;
      notes: string | null;
      nights: { roomType: string | null; night: Date; rooms: number }[];
    }[];
  };
  event: {
    name: string;
    startDate: Date;
    endDate: Date;
    timezone: string;
    expectedAttendance: number | null;
    location: string | null;
  };
  functions: {
    name: string;
    type: string;
    functionNumber: string | null;
    breakoutGroup: { name: string } | null;
    hold24Hour: boolean;
    expectedAttendance: number | null;
    setForCount: number | null;
    offSiteLocation: string | null;
    rooms: string[];
    setupTypes: string[];
    schedules: { type: string; startTime: Date; endTime: Date }[];
  }[];
  // Set-up / tear-down schedule types (option group SETUP / TEARDOWN).
  supportScheduleTypes: Set<string>;
  fb: FbGrid | null;
  history: { name: string; startDate: string; endDate: string; actualAttendance: number | null; pickedUp: Record<string, number>; blocked: Record<string, number>; hotels: string[] }[];
};

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);
const fmtDay = (d: Date | null) => (d ? formatDateKey(dateKey(d)) : null);

export const blockLabel = (t: HotelBlockType) => `${BLOCK_TYPE_LABELS[t]} block`;

function blockDoc(b: RfpDocumentInput["rfp"]["hotelBlocks"][number]): RfpBlockDoc {
  const nights = Array.from(new Set(b.nights.map((n) => dateKey(n.night)))).sort();
  const types = Array.from(new Set(b.nights.map((n) => n.roomType ?? "Run of house")));
  const rows = types.map((roomType) => ({
    roomType,
    rooms: Object.fromEntries(b.nights.filter((n) => (n.roomType ?? "Run of house") === roomType).map((n) => [dateKey(n.night), n.rooms])),
  }));
  const totals = Object.fromEntries(nights.map((k) => [k, sum(rows.map((r) => r.rooms[k] ?? 0))]));
  return {
    label: blockLabel(b.blockType),
    isRunOfHouse: b.isRunOfHouse,
    targetRate: b.targetRate != null ? formatMoney(b.targetRate.toString()) : null,
    notes: b.notes,
    nights,
    rows,
    totals,
    peak: Math.max(0, ...Object.values(totals)),
    roomNights: sum(Object.values(totals)),
  };
}

// One row per scheduled time of each on-site function. Set-up and tear-down
// rows are left out unless they are all the function has.
function meetingRows(input: RfpDocumentInput): RfpMeetingRow[] {
  const excluded = new Set(input.rfp.excludedFunctionTypes);
  const tz = input.event.timezone;
  const rows: (RfpMeetingRow & { sort: number })[] = [];
  for (const fn of input.functions) {
    if (fn.offSiteLocation || excluded.has(fn.type)) continue;
    const own = fn.schedules.filter((s) => !input.supportScheduleTypes.has(s.type));
    for (const s of own.length > 0 ? own : fn.schedules) {
      rows.push({
        sort: s.startTime.getTime(),
        date: getDateKeyInTimezone(s.startTime, tz),
        time: formatTimeRange(s.startTime, s.endTime, tz),
        name: formatFunctionLabel(fn),
        type: fn.type,
        setup: fn.setupTypes.join(", ") || null,
        attendance: fn.setForCount ?? fn.expectedAttendance,
        hold24: fn.hold24Hour,
        room: fn.rooms.join(", ") || null,
      });
    }
  }
  return rows.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(({ sort: _sort, ...r }) => r);
}

function historyRows(input: RfpDocumentInput): RfpHistoryRow[] {
  return input.history.map((e) => {
    const roomNights = sum(Object.values(e.pickedUp));
    const blockedNights = sum(Object.values(e.blocked));
    return {
      name: e.name,
      dates: `${formatDateKey(e.startDate)} – ${formatDateKey(e.endDate)}`,
      attendance: e.actualAttendance,
      peak: Math.max(0, ...Object.values(e.pickedUp)),
      roomNights,
      blockedNights,
      pickupPercent: blockedNights > 0 ? Math.round((roomNights / blockedNights) * 1000) / 10 : null,
      hotels: e.hotels.length,
    };
  });
}

export function buildRfpDocument(input: RfpDocumentInput): RfpDocument {
  const { rfp, event } = input;
  const on = new Set(rfp.sections);
  const start = dateKey(event.startDate);
  const end = dateKey(event.endDate);
  return {
    meta: {
      kind: rfp.kind,
      title: rfp.title,
      status: rfp.status,
      eventName: event.name,
      eventDates: start === end ? formatDateKey(start) : `${formatDateKey(start)} – ${formatDateKey(end)}`,
      location: event.location,
      expectedAttendance: event.expectedAttendance,
      responseDue: fmtDay(rfp.responseDue),
      decisionBy: fmtDay(rfp.decisionBy),
      issuedOn: fmtDay(rfp.issuedOn),
      contact: rfp.contact
        ? {
            name: `${rfp.contact.firstName} ${rfp.contact.lastName}`.trim(),
            title: rfp.contactTitle,
            organization: rfp.contact.organization,
            email: rfp.contact.email,
            phone: rfp.contact.phone,
          }
        : null,
    },
    introduction: rfp.introduction,
    blocks: on.has("blocks") ? rfp.hotelBlocks.map(blockDoc) : null,
    meetingSpace: on.has("meetingSpace") ? { rows: meetingRows(input), showRoomNames: rfp.showRoomNames } : null,
    fb: on.has("fb") ? input.fb : null,
    concessions: on.has("concessions") ? rfp.concessions : null,
    history: on.has("history") ? historyRows(input) : null,
    requirements: on.has("requirements") ? rfp.requirements : null,
  };
}

// "Rooms 120 · 3 nights" style one-liner used in lists.
export function blockSummary(nights: { night: Date; rooms: number }[]): string | null {
  if (nights.length === 0) return null;
  const byNight = new Map<string, number>();
  for (const n of nights) byNight.set(dateKey(n.night), (byNight.get(dateKey(n.night)) ?? 0) + n.rooms);
  const peak = Math.max(0, ...Array.from(byNight.values()));
  return `peak ${peak} · ${sum(Array.from(byNight.values()))} room nights`;
}
