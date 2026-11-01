import { z } from "zod";
import { UserFacingError } from "@/lib/userErrors";
import { PermissionError } from "@/lib/permissionError";

// Shared building blocks for parsing what a client sends. Area-specific
// schemas live beside the core that uses them (see QuoteLineSchema in
// src/app/events/quotes/core.ts), with the core's type derived from them.

/** An id from the client: a short string, never a Prisma filter object. */
export const idSchema = z.string().min(1).max(100);

/** Free text a person typed, bounded. */
export const text = (max = 10_000) => z.string().max(max);

/** A number the form parsed, or null for blank. JSON can't carry NaN. */
export const nullableNumber = z.number().finite().nullable();

/** A YYYY-MM-DD date key, as the date inputs post them. */
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

// Lists a form posts as one hidden JSON field are written by the page's own
// script, so a refusal means a stale or tampered page, not a typing mistake.
const MALFORMED = "The form sent data this page can't read. Reload the page and try again.";

/**
 * A list posted as JSON in one form field (`<input type="hidden" value={JSON.stringify(rows)}>`),
 * each entry checked against `item`. Absent or empty means []. Malformed JSON,
 * a non-list or a bad entry is a UserFacingError, never a 500.
 */
export function readJsonList<T>(formData: FormData, key: string, item: z.ZodType<T>, max = 2_000): T[] {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserFacingError(MALFORMED);
  }
  const result = z.array(item).max(max).safeParse(parsed);
  if (!result.success) throw new UserFacingError(MALFORMED);
  return result.data;
}

/**
 * A Server Action's structured argument (an object or list the page's script
 * builds), checked against `schema`. A refusal is a UserFacingError.
 */
export function parseArgs<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new UserFacingError(MALFORMED);
  return result.data;
}

/** A list of ids from the client. */
export const idList = (max = 1_000) => z.array(idSchema).max(max);

// Server Action arguments travel in React's own encoding, which (unlike JSON)
// keeps NaN, Infinity and undefined. These read them the way the cores always
// have: a non-finite number as none, a missing optional string as null.
// (z.number() itself refuses NaN, so the type check is by hand.)
const anyNumber = z.custom<number>((v) => typeof v === "number", "Expected a number");
export const looseNumber = anyNumber.nullish().transform((n) => (n == null || !Number.isFinite(n) ? null : n));
/** A number where none means 0 (a count): NaN and Infinity read as 0. */
export const looseCount = anyNumber.transform((n) => (Number.isFinite(n) ? n : 0));
// Bounds stay loose: an editor resends its stored rows on every autosave, so a
// value stored before these checks must still pass (Server Action bodies are
// capped at 1MB anyway).
export const looseText = (max = 100_000) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((s) => s ?? null);

/**
 * Ids a caller passed, each a real id string. A Server Action's arguments come
 * from the client unchecked, and an object there is a Prisma filter: as the id
 * in `deleteMany({ where: { id } })`, `{ not: "" }` matches every row. Anything
 * that isn't an id reads as not found.
 */
export function assertIds(...values: unknown[]): void {
  if (values.length > 10_000) throw new PermissionError("NOT_FOUND");
  if (!values.every((v) => idSchema.safeParse(v).success)) throw new PermissionError("NOT_FOUND");
}

/**
 * A text field from a form, trimmed. Blank is null unless `required` (then a
 * UserFacingError naming `label`); longer than `max` is refused the same way.
 * Bounds are generous: a form may resend a value stored before they existed.
 */
export function formText(formData: FormData, key: string, opts: { label: string; max: number; required: true }): string;
export function formText(formData: FormData, key: string, opts: { label: string; max: number; required?: false }): string | null;
export function formText(formData: FormData, key: string, opts: { label: string; max: number; required?: boolean }) {
  const raw = formData.get(key);
  const value = (typeof raw === "string" ? raw : "").trim();
  if (!value) {
    if (opts.required) throw new UserFacingError(`${opts.label} is required`);
    return null;
  }
  if (value.length > opts.max) throw new UserFacingError(`${opts.label} must be at most ${opts.max} characters`);
  return value;
}

// "expectedCount" → "Expected count", for refusals that name a form field.
const fieldLabel = (key: string) => {
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\bfb\b/g, "F&B")
    .replace(/\bav\b/g, "AV");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const formString = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
};

/** A whole number from a form field; blank is null. Refuses text, fractions and out-of-range values. */
export function formInt(formData: FormData, key: string, opts: { min?: number; max?: number } = {}): number | null {
  const raw = formString(formData, key);
  return raw ? parseWhole(raw, fieldLabel(key), opts) : null;
}

/** `raw` as a whole number within an Int column's range (or `opts`), refused by `label`. */
export function parseWhole(raw: string, label: string, opts: { min?: number; max?: number } = {}): number {
  const n = Number(raw.trim());
  if (!raw.trim() || !Number.isInteger(n)) throw new UserFacingError(`${label} must be a whole number`);
  const { min = -2_147_483_647, max = 2_147_483_647 } = opts;
  if (n < min || n > max) throw new UserFacingError(`${label} must be between ${min} and ${max}`);
  return n;
}

/** A number from a form field; blank is null. Refuses text, NaN and Infinity. */
export function formNumber(formData: FormData, key: string, opts: { min?: number } = {}): number | null {
  const raw = formString(formData, key);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new UserFacingError(`${fieldLabel(key)} must be a number`);
  if (opts.min !== undefined && n < opts.min) throw new UserFacingError(`${fieldLabel(key)} can't be below ${opts.min}`);
  return n;
}

/** An id from a select that must be picked; refused as "Pick a <label>" when blank. */
export function formRequiredId(formData: FormData, key: string, label: string): string {
  const id = formId(formData, key);
  if (!id) throw new UserFacingError(`Pick a ${label}`);
  return id;
}

/** An id from a select; blank (or `__blank__`, the "none" sentinel) is null, anything else must be an id. */
export function formId(formData: FormData, key: string): string | null {
  const raw = formString(formData, key);
  if (!raw || raw === "__blank__") return null;
  assertIds(raw);
  return raw;
}

/** Free text from a form field, bounded; blank is null. The label comes from the key. */
export function formNote(formData: FormData, key: string, max = 100_000): string | null {
  return formText(formData, key, { label: fieldLabel(key), max });
}

/** A text field as the core expects it: "" when blank (the core decides if that's allowed), bounded. */
export function formValue(formData: FormData, key: string, max = 100_000): string {
  return formText(formData, key, { label: fieldLabel(key), max }) ?? "";
}

/** The ids a multi-select or checkbox group posts under one key; blanks dropped, each an id. */
export function formIds(formData: FormData, key: string, max = 1_000): string[] {
  const values = formData
    .getAll(key)
    .map((v) => (typeof v === "string" ? v.trim() : v))
    .filter((v) => v !== "" && v !== "__blank__");
  if (values.length > max) throw new UserFacingError(`Too many ${fieldLabel(key).toLowerCase()}`);
  assertIds(...values);
  return values as string[];
}

/** One of `values` from a select; blank is `fallback`. Anything else is refused. */
export function formEnum<T extends string>(formData: FormData, key: string, values: readonly T[] | Record<string, T>, fallback: T): T {
  const raw = formString(formData, key);
  if (!raw) return fallback;
  const allowed = (Array.isArray(values) ? values : Object.values(values)) as readonly string[];
  if (!allowed.includes(raw)) throw new UserFacingError(`Pick a ${fieldLabel(key).toLowerCase()} from the list`);
  return raw as T;
}

/** A required name or label from a form field, bounded; blank or spaces only is refused. */
export function formName(formData: FormData, key: string, max = 1_000): string {
  return formText(formData, key, { label: fieldLabel(key), max, required: true });
}

/** A required YYYY-MM-DD date from a date input, as a Date; anything else is refused. */
export function formDate(formData: FormData, key: string): Date {
  const raw = formString(formData, key);
  const date = dateKeySchema.safeParse(raw).success ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) throw new UserFacingError(`${fieldLabel(key)} must be a date`);
  return date;
}

/** Several text values a form posts under one key (checkbox labels, repeated inputs), each bounded. */
export function formTexts(formData: FormData, key: string, opts: { max?: number; maxItems?: number } = {}): string[] {
  const { max = 1_000, maxItems = 1_000 } = opts;
  const values = formData.getAll(key);
  if (values.length > maxItems || !values.every((v): v is string => typeof v === "string" && v.length <= max)) {
    throw new UserFacingError(`${fieldLabel(key)} must be a list of short text`);
  }
  return values;
}
