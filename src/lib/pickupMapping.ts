// Turning a pickup report's rows into guest rows: the column mapping the CSV
// wizard (PickupImport) edits and the inbox proposes, and the deterministic
// row → guest step both of them run. Plain module: the client wizard and the
// server-side inbox parser share it.

export type PickupGuestRow = {
  guestName: string | null;
  confirmationNumber: string | null;
  checkIn: string | null;
  checkOut: string | null;
  roomType: string | null;
  cancelled: boolean;
  rawStatus: string | null;
  bookedOn: string | null;
  cancelledOn: string | null;
};

export const PICKUP_FIELDS = [
  { key: "cancelledOn", label: "Cancel date", guess: /(cancel|cxl)\w*\s*(date|dt)\b|(cancel|cxl)\w*\s+on\b|date\s*(cancel|cxl)/i },
  { key: "bookedOn", label: "Booked date", guess: /book(ed|ing)?\s*(date|dt)\b|booked\s+on\b|res(ervation)?\s*(made|date|created)|date\s*(booked|made|created)|^created/i },
  { key: "confirmation", label: "Confirmation #", guess: /conf|confirmation|res(ervation)?\s*(#|no|num|id)/i },
  { key: "fullName", label: "Guest name", guess: /^(guest\s*)?name$|guest|full\s*name/i },
  { key: "firstName", label: "First name", guess: /first/i },
  { key: "lastName", label: "Last name", guess: /last|surname/i },
  { key: "checkIn", label: "Check-in", guess: /arriv|check.?in|^in$/i },
  { key: "checkOut", label: "Check-out", guess: /depart|check.?out|^out$/i },
  { key: "roomType", label: "Room type", guess: /room\s*type|room|type/i },
  { key: "status", label: "Status", guess: /status|state/i },
] as const;
export type PickupFieldKey = (typeof PICKUP_FIELDS)[number]["key"];
export const PICKUP_FIELD_KEYS = PICKUP_FIELDS.map((f) => f.key) as PickupFieldKey[];

// Field → header; "" leaves a field unmapped.
export type PickupColumns = Record<PickupFieldKey, string>;
export type SheetRow = Record<string, string>;

// MM/DD/YYYY, M/D/YY or YYYY-MM-DD (optionally with a time) → YYYY-MM-DD.
export function parseCsvDate(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

export function guessColumns(headers: string[]): PickupColumns {
  const used = new Set<string>();
  const out = {} as PickupColumns;
  for (const f of PICKUP_FIELDS) {
    const hit = headers.find((h) => !used.has(h) && f.guess.test(h));
    out[f.key] = hit ?? "";
    if (hit) used.add(hit);
  }
  // A full-name column beats first/last guesses that came from it.
  if (out.fullName && (out.firstName === out.fullName || out.lastName === out.fullName)) {
    out.firstName = "";
    out.lastName = "";
  }
  return out;
}

export function distinctValues(rows: SheetRow[], col: string): string[] {
  return col ? Array.from(new Set(rows.map((r) => (r[col] ?? "").trim()).filter(Boolean))).sort() : [];
}

// roomFor: raw room type → the block's type (null drops it). isCancelled: raw
// status → cancelled. A cancel date always means cancelled.
export function rowsToGuests(
  rows: SheetRow[],
  columns: PickupColumns,
  roomFor: (raw: string) => string | null,
  isCancelled: (raw: string) => boolean,
): PickupGuestRow[] {
  return rows.map((r) => {
    const get = (k: PickupFieldKey) => (columns[k] ? (r[columns[k]] ?? "").trim() : "");
    const name = get("fullName") || [get("firstName"), get("lastName")].filter(Boolean).join(" ");
    const status = get("status");
    const room = get("roomType");
    const cancelledOn = parseCsvDate(get("cancelledOn"));
    return {
      guestName: name || null,
      confirmationNumber: get("confirmation") || null,
      checkIn: parseCsvDate(get("checkIn")),
      checkOut: parseCsvDate(get("checkOut")),
      roomType: room ? roomFor(room) : null,
      cancelled: cancelledOn ? true : status ? isCancelled(status) : false,
      rawStatus: status || null,
      bookedOn: parseCsvDate(get("bookedOn")),
      cancelledOn,
    };
  });
}

export const DEFAULT_CANCELLED = /cancel|no.?show|void/i;

export function hasUsableDates(g: Pick<PickupGuestRow, "checkIn" | "checkOut">): boolean {
  return !!g.checkIn && !!g.checkOut && g.checkOut > g.checkIn;
}
