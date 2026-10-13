// The normalized Event Specifications Guide document. Plain serializable data
// (every value already formatted in the event timezone) so one model feeds
// the React report (screen / print / share) and the .docx / .xlsx renderers.

export type EsgItem = {
  label: string;
  // Plain text (may contain newlines). null renders as blank.
  value: string | null;
  // Set instead of `value` for rich text from RichTextEditor (tiptap HTML).
  html?: string | null;
  required?: boolean;
};

export type EsgTable = {
  title?: string;
  columns: string[];
  rows: (string | null)[][];
  // Right-align (and treat as numbers in xlsx) per column.
  numeric?: boolean[];
};

export type EsgBlock = { kind: "fields"; items: EsgItem[] } | { kind: "table"; table: EsgTable } | { kind: "note"; text: string };

export type EsgSection = {
  // "A"…"X" for Part I; "A"…"N" inside a set-up order.
  letter: string;
  title: string;
  na: boolean;
  blocks: EsgBlock[];
};

export type EsgPart = "I" | "II" | "IIIa" | "IIIb";
export const ESG_PARTS: EsgPart[] = ["I", "II", "IIIa", "IIIb"];

export type EsgScheduleRow = {
  dateKey: string;
  dayDate: string;
  start: string;
  end: string;
  startIso: string;
  endIso: string;
  number: string | null;
  name: string;
  facility: string | null;
  room: string | null;
  setup: string | null;
  setFor: string | null;
  posting: string | null;
  hold24: boolean;
};

export type EsgSetupOrder = {
  anchor: string;
  number: string | null;
  name: string;
  dateKey: string | null;
  sections: EsgSection[];
};

export type EsgMeta = {
  eventId: string;
  eventName: string;
  organizer: string | null;
  contactName: string | null;
  contactPhone: string | null;
  dateOriginated: string | null;
  dateRevised: string | null;
  generatedAt: string;
  timezone: string;
  eventDates: string;
};

export type EsgDocument = {
  meta: EsgMeta;
  parts: EsgPart[];
  narrative: { header: EsgItem[]; sections: EsgSection[] } | null;
  functionSchedule: EsgScheduleRow[] | null;
  setupOrders: EsgSetupOrder[] | null;
  boothOrders: EsgSetupOrder[] | null;
  attribution: string;
};

export type EsgOptions = {
  parts: EsgPart[];
  days?: string[];
  functionIds?: string[];
  showBlank: boolean;
  includeBilling: boolean;
};

// "Function Set-up Order" fields with no source in the app still print as
// blanks when showBlank is on, matching the template.
export function blankItem(label: string): EsgItem {
  return { label, value: null };
}

// Parts the report offers.
export const AVAILABLE_ESG_PARTS: EsgPart[] = ESG_PARTS;
