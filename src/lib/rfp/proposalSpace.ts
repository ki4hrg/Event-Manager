// A hotel proposal's function space and F&B, against what the RFP asked:
// its meeting space requests (each answered with a room) and the F&B meal
// types its response form prices. Shared by the proposal pages and form, the
// inbox and the comparison. Pure.

import type { HotelChargeScope, HotelWaiverType, RfpSpaceKind } from "@prisma/client";
import { CHARGE_SCOPE_LABELS, dateKey, formatMoney, formatNight } from "@/lib/hotels";
import { DAY_TBD, formatClockRange } from "@/lib/rfp/space";

type SpaceRequestInput = {
  id: string;
  kind: RfpSpaceKind;
  day: Date | null;
  endDay: Date | null;
  startTime: string | null;
  endTime: string | null;
  functionType: string | null;
  name: string;
  attendance: number | null;
  setup: string | null;
  hold24: boolean;
};

// A meeting space request as a proposal row shows it: when, and what was asked.
export type SpaceRequestDoc = { id: string; when: string; name: string; asked: string | null };

export function spaceRequestDoc(r: SpaceRequestInput): SpaceRequestDoc {
  const day = r.day ? dateKey(r.day) : null;
  const end = r.endDay ? dateKey(r.endDay) : null;
  const days = day ? (end && end > day ? `${formatNight(day)} – ${formatNight(end)}` : formatNight(day)) : DAY_TBD;
  const time = formatClockRange(r.startTime, r.endTime);
  return {
    id: r.id,
    when: time === "—" ? days : `${days} · ${time}`,
    name: r.name,
    asked: [r.attendance != null ? `${r.attendance} people` : null, r.setup, r.hold24 ? "24-hr hold" : null].filter(Boolean).join(" · ") || null,
  };
}

// The RFP's meeting space requests, in its order.
export const meetingRequests = (rows: SpaceRequestInput[]) => rows.filter((r) => r.kind === "MEETING").map(spaceRequestDoc);

// The F&B the RFP asks the hotel to price, by type (or name when untyped), as
// its response form lists them.
export const rfpMealTypes = (rows: SpaceRequestInput[]) => Array.from(new Set(rows.filter((r) => r.kind === "FB").map((r) => r.functionType ?? r.name)));

// One function space row in the form: a request's answer (request set) or a
// room offered unasked. Strings, as the inputs hold them.
export type SpaceAnswer = {
  request: SpaceRequestDoc | null;
  name: string;
  room: string;
  capacity: string;
  hold24: boolean | null;
  rental: string;
  rentalScope: HotelChargeScope | "";
  waiverType: HotelWaiverType | "";
  waiverAmount: string;
  waiverScope: HotelChargeScope | "";
  note: string;
};

export const WAIVER_TYPES: { value: HotelWaiverType; label: string }[] = [
  { value: "FB_SPEND", label: "F&B spend" },
  { value: "ROOM_NIGHTS", label: "Room nights" },
  { value: "OTHER", label: "Other" },
];

export const BLANK_SPACE: Omit<SpaceAnswer, "request"> = {
  name: "",
  room: "",
  capacity: "",
  hold24: null,
  rental: "",
  rentalScope: "",
  waiverType: "",
  waiverAmount: "",
  waiverScope: "",
  note: "",
};

export type StoredSpace = {
  spaceRequestId: string | null;
  name: string;
  room: string | null;
  capacity: number | null;
  hold24: boolean | null;
  rental: { toString(): string } | string | number | null;
  rentalScope: HotelChargeScope | null;
  // Older offer reads and snapshots have none of these.
  waiverType?: HotelWaiverType | null;
  waiverAmount?: { toString(): string } | string | number | null;
  waiverScope?: HotelChargeScope | null;
  note: string | null;
};

const text = (v: { toString(): string } | string | number | null) => (v == null ? "" : String(v));

function answerOf(s: StoredSpace | undefined, request: SpaceRequestDoc | null): SpaceAnswer {
  return {
    request,
    name: request?.name ?? s?.name ?? "",
    room: s?.room ?? "",
    capacity: text(s?.capacity ?? null),
    hold24: s?.hold24 ?? null,
    rental: text(s?.rental ?? null),
    rentalScope: s?.rentalScope ?? "",
    waiverType: s?.waiverType ?? "",
    waiverAmount: text(s?.waiverAmount ?? null),
    waiverScope: s?.waiverScope ?? "",
    note: s?.note ?? "",
  };
}

// Every request with its answer, then the rooms offered unasked (and answers
// to requests the RFP no longer has, kept by name).
export function spaceAnswers(requests: SpaceRequestDoc[], stored: StoredSpace[]): SpaceAnswer[] {
  const ids = new Set(requests.map((r) => r.id));
  return [
    ...requests.map((r) => answerOf(stored.find((s) => s.spaceRequestId === r.id), r)),
    ...stored.filter((s) => !s.spaceRequestId || !ids.has(s.spaceRequestId)).map((s) => answerOf(s, null)),
  ];
}

export const answered = (a: SpaceAnswer) => !!(a.room.trim() || a.capacity || a.hold24 != null || a.rental || a.waiverType || a.note.trim());

// The form's rows as the proposal cores take them: unanswered requests and
// nameless unasked rows are dropped.
export function spaceArgs(answers: SpaceAnswer[]) {
  return answers
    .filter((a) => (a.request ? answered(a) : a.name.trim() || a.room.trim()))
    .map((a) => ({
      spaceRequestId: a.request?.id ?? null,
      name: a.name.trim() || a.room.trim(),
      room: a.room.trim() || null,
      capacity: a.capacity ? parseInt(a.capacity) : null,
      hold24: a.hold24,
      rental: a.rental !== "" ? Number(a.rental) : null,
      rentalScope: a.rentalScope || null,
      waiverType: a.waiverType || null,
      waiverAmount: a.waiverType && a.waiverAmount !== "" ? Number(a.waiverAmount) : null,
      waiverScope: (a.waiverType && a.waiverScope) || null,
      note: a.note.trim() || null,
    }));
}

const per = (scope: HotelChargeScope | null | undefined) => (scope ? CHARGE_SCOPE_LABELS[scope].toLowerCase() : null);

// "waived with $500.00 F&B per day", "waived with 50 room nights per stay".
export function waiverLine(s: Pick<StoredSpace, "waiverType" | "waiverAmount" | "waiverScope">): string | null {
  if (!s.waiverType) return null;
  const amount = s.waiverAmount != null ? String(s.waiverAmount) : null;
  const what =
    s.waiverType === "FB_SPEND"
      ? [amount ? formatMoney(amount) : null, "F&B"]
      : s.waiverType === "ROOM_NIGHTS"
        ? [amount ? `${Number(amount)} room nights` : "room nights"]
        : [amount];
  return ["waived with", ...what, per(s.waiverScope)].filter(Boolean).join(" ") || null;
}

// "Hoover Commons · 75 capacity · 24-hr hold · $900.00 per day, or waived with
// $500.00 F&B per day": one row, for the comparison and the version history.
export function spaceSummary(s: Omit<StoredSpace, "spaceRequestId" | "name">): string {
  const rental = s.rental != null ? [formatMoney(String(s.rental)), per(s.rentalScope)].filter(Boolean).join(" ") : null;
  const waiver = waiverLine(s);
  return (
    [
      s.room,
      s.capacity != null ? `${s.capacity} capacity` : null,
      s.hold24 == null ? null : s.hold24 ? "24-hr hold" : "no 24-hr hold",
      rental && waiver ? `${rental}, or ${waiver}` : (rental ?? waiver),
      s.note,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

// The form's meal price rows: the RFP's meal types first, then others priced.
export function mealRows(mealTypes: string[], stored: { mealType: string; price: { toString(): string } | string | number | null }[]) {
  const key = (s: string) => s.trim().toLowerCase();
  return [
    ...mealTypes.map((m) => ({ mealType: m, price: text(stored.find((s) => key(s.mealType) === key(m))?.price ?? null), asked: true })),
    ...stored.filter((s) => !mealTypes.some((m) => key(m) === key(s.mealType))).map((s) => ({ mealType: s.mealType, price: text(s.price), asked: false })),
  ];
}
